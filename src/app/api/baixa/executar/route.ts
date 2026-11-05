import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  executeDeductionTransaction,
  DeductionValidationError,
  ProductNotFoundError,
  ProductInactiveError,
  InsufficientStockError,
  ConcurrencyConflictError,
  FormaPagamento,
} from "@/modules/transacoes";
import { centavosToBRL } from "@/modules/currency";

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    // 1. Payment Method
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
    const formaPagamento = rawForma as FormaPagamento;

    // 2. Date
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!body.data || typeof body.data !== "string" || !isoDateRegex.test(body.data)) {
      return NextResponse.json(
        {
          success: false,
          error: `Data de lançamento inválida: "${body.data}". Formato obrigatório: YYYY-MM-DD.`,
        },
        { status: 400 }
      );
    }
    const dataLancamento = body.data;

    // 3. Items array
    if (!Array.isArray(body.itens) || body.itens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "A lista de itens para baixa não pode ser vazia.",
        },
        { status: 400 }
      );
    }

    for (let i = 0; i < body.itens.length; i++) {
      const item = body.itens[i];
      if (!item || typeof item !== "object") {
        return NextResponse.json(
          {
            success: false,
            error: `Item no índice ${i} é inválido.`,
          },
          { status: 400 }
        );
      }
      if (!item.produtoId || typeof item.produtoId !== "string" || item.produtoId.trim() === "") {
        return NextResponse.json(
          {
            success: false,
            error: `ID de produto inválido ou ausente no índice ${i}.`,
          },
          { status: 400 }
        );
      }
      if (
        typeof item.quantidadeDebitar !== "number" ||
        !Number.isInteger(item.quantidadeDebitar) ||
        item.quantidadeDebitar <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Quantidade a debitar inválida no índice ${i}: ${item.quantidadeDebitar}. Deve ser um inteiro positivo.`,
          },
          { status: 400 }
        );
      }
    }

    // 4. Optional Target Value
    let valorAlvoCentavos: number | undefined;
    if (typeof body.valorAlvoCentavos === "number" && Number.isInteger(body.valorAlvoCentavos)) {
      valorAlvoCentavos = body.valorAlvoCentavos;
    }

    // 5. Execute Atomic Transaction
    const result = await executeDeductionTransaction({
      valorAlvoCentavos,
      formaPagamento,
      dataLancamento,
      itens: body.itens,
      operadorObservacao: body.observacoes,
    });

    // 6. Query updated items details for complete response feedback
    const auditRecords = await prisma.historicoBaixa.findMany({
      where: { id: { in: result.historicoIds } },
      include: {
        produto: {
          select: {
            quantidade: true,
            ativo: true,
          },
        },
      },
    });

    const detalhesItens = auditRecords.map((rec) => ({
      produtoId: rec.produtoId,
      codigo: rec.codigoProduto,
      discriminacao: rec.discriminacaoProduto,
      quantidadeDebitada: rec.quantidadeBaixada,
      quantidadeRestante: rec.produto?.quantidade ?? 0,
      unitarioCentavos: rec.unitarioCentavos,
      totalItemCentavos: rec.totalCentavos,
      ativo: rec.produto?.ativo ?? false,
    }));

    return NextResponse.json(
      {
        success: true,
        lancamentoId: result.lancamentoDiarioId,
        totalDebitadoCentavos: result.totalDebitadoCentavos,
        totalDebitadoBRL: centavosToBRL(result.totalDebitadoCentavos),
        formaPagamento,
        dataLancamento,
        itensBaixados: result.historicoIds.length,
        historicoIds: result.historicoIds,
        detalhesItens,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof DeductionValidationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }
    if (err instanceof ProductNotFoundError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 }
      );
    }
    if (err instanceof ConcurrencyConflictError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409 }
      );
    }
    if (err instanceof ProductInactiveError || err instanceof InsufficientStockError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Erro interno no servidor ao executar baixa de estoque.",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
