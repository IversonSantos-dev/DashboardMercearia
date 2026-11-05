import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { findDeductionSuggestion } from "@/modules/baixa-inteligente";
import { brlToCentavos, centavosToBRL } from "@/modules/currency";

const MAX_TARGET_CENTAVOS = 100_000_000; // R$ 1.000.000,00

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTimer = performance.now();

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Corpo da requisição inválido. JSON esperado.",
        },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "Corpo da requisição não pode ser vazio.",
        },
        { status: 400 }
      );
    }

    // 1. Resolve Target Value
    let valorAlvoCentavos: number;
    if (typeof body.valorAlvoCentavos === "number") {
      if (
        !Number.isInteger(body.valorAlvoCentavos) ||
        body.valorAlvoCentavos <= 0 ||
        body.valorAlvoCentavos > MAX_TARGET_CENTAVOS
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `valorAlvoCentavos inválido. Deve ser um inteiro positivo até ${MAX_TARGET_CENTAVOS} (R$ 1.000.000,00).`,
          },
          { status: 400 }
        );
      }
      valorAlvoCentavos = body.valorAlvoCentavos;
    } else if (body.valorAlvoBRL !== undefined && body.valorAlvoBRL !== null) {
      try {
        valorAlvoCentavos = brlToCentavos(body.valorAlvoBRL);
        if (valorAlvoCentavos <= 0 || valorAlvoCentavos > MAX_TARGET_CENTAVOS) {
          return NextResponse.json(
            {
              success: false,
              error: `valorAlvoBRL inválido. O valor deve ser positivo e até R$ 1.000.000,00.`,
            },
            { status: 400 }
          );
        }
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            error: `Erro ao converter valorAlvoBRL: ${err?.message || "formato inválido"}`,
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Valor alvo não informado. Forneça valorAlvoCentavos ou valorAlvoBRL.",
        },
        { status: 400 }
      );
    }

    // 2. Validate Payment Method
    const rawForma = String(body.formaPagamento || "").trim().toUpperCase();
    if (rawForma !== "CARTAO" && rawForma !== "DINHEIRO") {
      return NextResponse.json(
        {
          success: false,
          error: `Forma de pagamento inválida: "${body.formaPagamento}". Permitidos: CARTAO, DINHEIRO.`,
        },
        { status: 400 }
      );
    }

    // 3. Optional Date Validation
    if (body.data) {
      const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!isoRegex.test(body.data)) {
        return NextResponse.json(
          {
            success: false,
            error: `Data inválida: "${body.data}". Formato esperado: YYYY-MM-DD.`,
          },
          { status: 400 }
        );
      }
    }

    // 4. Query active inventory from database
    const candidates = await prisma.produtoEstoque.findMany({
      where: {
        ativo: true,
        quantidade: { gt: 0 },
      },
      select: {
        id: true,
        codigo: true,
        barras: true,
        discriminacao: true,
        unidade: true,
        quantidade: true,
        unitarioCentavos: true,
        ativo: true,
      },
      orderBy: { codigo: "asc" },
    });

    const candidateStockMap = new Map<string, number>(
      candidates.map((c) => [c.id, c.quantidade])
    );

    // If completely empty inventory, return graceful SEM_ESTOQUE
    if (candidates.length === 0) {
      const durationMs = Number((performance.now() - startTimer).toFixed(2));
      return NextResponse.json(
        {
          success: true,
          sugestao: {
            estrategia: "SEM_ESTOQUE",
            valorAlvoCentavos,
            valorAlvoBRL: centavosToBRL(valorAlvoCentavos),
            valorSugeridoCentavos: 0,
            valorSugeridoBRL: centavosToBRL(0),
            deltaCentavos: -valorAlvoCentavos,
            deltaBRL: centavosToBRL(-valorAlvoCentavos),
            itens: [],
          },
          catalogoProximidade: [],
          tempoExecucaoMs: durationMs,
        },
        { status: 200 }
      );
    }

    // 5. Run Deduction Engine
    const topLimit = typeof body.limiteAlternativas === "number" && body.limiteAlternativas > 0
      ? Math.min(body.limiteAlternativas, 50)
      : 20;

    const suggestionResult = findDeductionSuggestion(candidates, valorAlvoCentavos, {
      topAlternativesLimit: topLimit,
    });

    const executionTimeMs = Number((performance.now() - startTimer).toFixed(2));

    // 6. Format Response
    const responsePayload = {
      success: true,
      sugestao: {
        estrategia: suggestionResult.strategy,
        valorAlvoCentavos: suggestionResult.valorAlvoCentavos,
        valorAlvoBRL: centavosToBRL(suggestionResult.valorAlvoCentavos),
        valorSugeridoCentavos: suggestionResult.valorSugeridoCentavos,
        valorSugeridoBRL: centavosToBRL(suggestionResult.valorSugeridoCentavos),
        deltaCentavos: suggestionResult.deltaCentavos,
        deltaBRL: centavosToBRL(suggestionResult.deltaCentavos),
        itens: suggestionResult.itens.map((item) => ({
          produtoId: item.produtoId,
          codigo: item.codigo,
          barras: item.barras,
          discriminacao: item.discriminacao,
          unidade: item.unidade,
          quantidadeDisponivel: candidateStockMap.get(item.produtoId) ?? 0,
          quantidadeDebitar: item.quantidadeDebitar,
          unitarioCentavos: item.unitarioCentavos,
          unitarioBRL: centavosToBRL(item.unitarioCentavos),
          totalItemCentavos: item.totalItemCentavos,
          totalItemBRL: centavosToBRL(item.totalItemCentavos),
        })),
      },
      catalogoProximidade: (suggestionResult.alternativasProximidade || []).map((alt) => ({
        produtoId: alt.id,
        codigo: alt.codigo,
        barras: alt.barras,
        discriminacao: alt.discriminacao,
        unidade: alt.unidade,
        quantidadeDisponivel: alt.quantidade,
        unitarioCentavos: alt.unitarioCentavos,
        unitarioBRL: centavosToBRL(alt.unitarioCentavos),
        deltaCentavos: alt.unitarioCentavos - valorAlvoCentavos,
      })),
      tempoExecucaoMs: executionTimeMs,
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno no servidor ao processar sugestão de baixa.",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
