import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseModelP7File, P7ParseResult, P7ProductItem, P7RowIssue } from "@/modules/parser-p7";
import { multiplyMoney } from "@/modules/currency";
import { syncProdutoEstoqueToSupabase } from "@/lib/supabase-sync";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const SUPPORTED_EXTENSIONS = [".xlsx", ".csv", ".xls"];
const CHUNK_SIZE = 50;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Validate Content-Type
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "Requisição inválida. O corpo da requisição deve ser multipart/form-data.",
        },
        { status: 400 }
      );
    }

    // 2. Parse FormData
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (formErr: any) {
      return NextResponse.json(
        {
          success: false,
          error: "Falha ao processar os dados do formulário multipart.",
          details: formErr?.message,
        },
        { status: 400 }
      );
    }

    const file = formData.get("file");

    // 3. Validate file presence
    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum arquivo enviado ou arquivo vazio.",
        },
        { status: 400 }
      );
    }

    // 4. Validate file size limit
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `O arquivo excede o limite máximo permitido de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
        },
        { status: 413 }
      );
    }

    // 5. Validate file extension
    const fileName = file.name.trim();
    const hasValidExtension = SUPPORTED_EXTENSIONS.some((ext) =>
      fileName.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return NextResponse.json(
        {
          success: false,
          error: `Formato de arquivo inválido (${fileName}). Envie um arquivo com extensão .xlsx ou .csv.`,
        },
        { status: 400 }
      );
    }

    // 6. Ingest buffer and call parseModelP7File
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parseResult: P7ParseResult;
    try {
      parseResult = await parseModelP7File(buffer, fileName);
    } catch (parseErr: any) {
      return NextResponse.json(
        {
          success: false,
          error: parseErr?.message || "Erro ao processar a planilha Modelo P7.",
        },
        { status: 422 }
      );
    }

    // If no valid items were found
    if (!parseResult.items || parseResult.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum item válido foi encontrado no arquivo de inventário.",
          administrativeHeader: parseResult.administrativeHeader,
          quarantine: parseResult.quarantine,
        },
        { status: 422 }
      );
    }

    // 7. Consolidate items sharing the same internal code within the file
    const consolidatedMap = new Map<string, P7ProductItem>();
    const extraQuarantine: P7RowIssue[] = [];

    for (const item of parseResult.items) {
      const codeKey = item.codigo.trim();
      if (!consolidatedMap.has(codeKey)) {
        consolidatedMap.set(codeKey, { ...item, codigo: codeKey });
      } else {
        const existing = consolidatedMap.get(codeKey)!;
        existing.quantidade += item.quantidade;
        if (item.barras) existing.barras = item.barras;
        if (item.ncm) existing.ncm = item.ncm;
        if (item.discriminacao) existing.discriminacao = item.discriminacao;
        if (item.unidade) existing.unidade = item.unidade;
        existing.unitarioCentavos = item.unitarioCentavos;
        existing.totalCentavos = multiplyMoney(existing.unitarioCentavos, existing.quantidade);

        extraQuarantine.push({
          rowNumber: 0,
          codigo: codeKey,
          discriminacao: item.discriminacao,
          reason: `Código duplicado no arquivo: quantidades somadas para total de ${existing.quantidade}`,
          severity: "WARNING",
        });
      }
    }

    const consolidatedItems = Array.from(consolidatedMap.values());
    const fullQuarantine = [...parseResult.quarantine, ...extraQuarantine];

    // 8. Handle ?dryRun=true mode
    const { searchParams } = new URL(req.url);
    const isDryRun =
      searchParams.get("dryRun") === "true" || searchParams.get("dryRun") === "1";

    const allCodes = consolidatedItems.map((it) => it.codigo);

    if (isDryRun) {
      const existingInDb = await prisma.produtoEstoque.findMany({
        where: { codigo: { in: allCodes } },
        select: { codigo: true },
      });
      const existingCodeSet = new Set(existingInDb.map((p) => p.codigo));
      const estimatedNew = consolidatedItems.filter(
        (it) => !existingCodeSet.has(it.codigo)
      ).length;
      const estimatedUpdate = consolidatedItems.length - estimatedNew;

      return NextResponse.json(
        {
          success: true,
          dryRun: true,
          fileName,
          administrativeHeader: parseResult.administrativeHeader,
          summary: {
            totalItensLidos: parseResult.items.length + parseResult.quarantine.length,
            totalItensValidos: consolidatedItems.length,
            totalItensQuarentena: fullQuarantine.length,
            novosProdutosEstimados: estimatedNew,
            produtosAtualizadosEstimados: estimatedUpdate,
            valorTotalGeralCentavos: consolidatedItems.reduce(
              (acc, it) => acc + it.totalCentavos,
              0
            ),
          },
          quarantine: fullQuarantine,
          itemsPreview: consolidatedItems.slice(0, 50),
        },
        { status: 200 }
      );
    }

    // 9. Commit Mode: Transactional Upsert into produtos_estoque
    let countCreated = 0;
    let countUpdated = 0;

    await prisma.$transaction(
      async (tx) => {
        const existingInDb = await tx.produtoEstoque.findMany({
          where: { codigo: { in: allCodes } },
          select: { codigo: true },
        });
        const existingCodeSet = new Set(existingInDb.map((p) => p.codigo));

        for (let i = 0; i < consolidatedItems.length; i += CHUNK_SIZE) {
          const chunk = consolidatedItems.slice(i, i + CHUNK_SIZE);

          await Promise.all(
            chunk.map(async (item) => {
              const qtyInt = Math.max(0, Math.round(item.quantidade));
              const isAtivo = qtyInt > 0;
              const totalCentavos = multiplyMoney(item.unitarioCentavos, qtyInt);

              await tx.produtoEstoque.upsert({
                where: { codigo: item.codigo },
                create: {
                  codigo: item.codigo,
                  barras: item.barras || null,
                  ncm: item.ncm || null,
                  discriminacao: item.discriminacao,
                  unidade: item.unidade || "UN",
                  quantidade: qtyInt,
                  unitarioCentavos: item.unitarioCentavos,
                  totalCentavos,
                  ativo: isAtivo,
                },
                update: {
                  barras: item.barras || null,
                  ncm: item.ncm || null,
                  discriminacao: item.discriminacao,
                  unidade: item.unidade || "UN",
                  quantidade: qtyInt, // Substitui o saldo anterior pelo inventariado
                  unitarioCentavos: item.unitarioCentavos,
                  totalCentavos,
                  ativo: isAtivo,
                },
              });

              if (existingCodeSet.has(item.codigo)) {
                countUpdated++;
              } else {
                countCreated++;
              }
            })
          );
        }
      },
      {
        timeout: 30000,
        maxWait: 10000,
      }
    );

    // 10. Success Response
    const totalEstoqueCentavos = consolidatedItems.reduce(
      (acc, it) => acc + multiplyMoney(it.unitarioCentavos, Math.max(0, Math.round(it.quantidade))),
      0
    );

    // Sincroniza os produtos importados/atualizados com o Supabase online em lote
    (async () => {
      try {
        const codigos = consolidatedItems.map((c) => c.codigo);
        const prods = await prisma.produtoEstoque.findMany({
          where: { codigo: { in: codigos } },
        });
        for (const p of prods) {
          await syncProdutoEstoqueToSupabase(p);
        }
      } catch (syncErr) {
        console.error("[Supabase Sync] Falha ao sincronizar importação com a nuvem:", syncErr);
      }
    })();

    return NextResponse.json(
      {
        success: true,
        dryRun: false,
        fileName,
        administrativeHeader: parseResult.administrativeHeader,
        summary: {
          totalItensLidos: parseResult.items.length + parseResult.quarantine.length,
          totalItensImportados: consolidatedItems.length,
          totalItensQuarentena: fullQuarantine.length,
          novosCadastrados: countCreated,
          atualizados: countUpdated,
          valorTotalEstoqueCentavos: totalEstoqueCentavos,
        },
        quarantine: fullQuarantine,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API /api/inventario/import] Erro interno:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno no servidor ao processar importação de inventário.",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
