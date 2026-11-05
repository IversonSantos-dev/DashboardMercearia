import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { centavosToBRL } from "@/modules/currency";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const data = searchParams.get("data");
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const codigo = searchParams.get("codigo");
    const formaPagamento = searchParams.get("formaPagamento");
    const rawLimit = searchParams.get("limit");
    const rawOffset = searchParams.get("offset");

    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200) : 50;
    const offset = rawOffset ? Math.max(parseInt(rawOffset, 10) || 0, 0) : 0;

    const where: any = {};

    if (data) {
      where.lancamentoDiario = { data };
    } else if (dataInicio || dataFim) {
      where.lancamentoDiario = {};
      const dateFilter: any = {};
      if (dataInicio) dateFilter.gte = dataInicio;
      if (dataFim) dateFilter.lte = dataFim;
      where.lancamentoDiario.data = dateFilter;
    }

    if (codigo) {
      where.codigoProduto = codigo.trim();
    }

    if (formaPagamento) {
      const normForma = formaPagamento.trim().toUpperCase();
      if (normForma === "CARTAO" || normForma === "DINHEIRO") {
        where.formaPagamento = normForma;
      }
    }

    const [totalRegistros, aggregate, records] = await Promise.all([
      prisma.historicoBaixa.count({ where }),
      prisma.historicoBaixa.aggregate({
        where,
        _sum: {
          quantidadeBaixada: true,
          totalCentavos: true,
        },
      }),
      prisma.historicoBaixa.findMany({
        where,
        orderBy: { dataHora: "desc" },
        take: limit,
        skip: offset,
        include: {
          lancamentoDiario: {
            select: {
              data: true,
            },
          },
        },
      }),
    ]);

    const valorTotalCentavos = aggregate._sum.totalCentavos ?? 0;
    const quantidadeTotalItensBaixados = aggregate._sum.quantidadeBaixada ?? 0;

    const historico = records.map((r) => ({
      id: r.id,
      dataHora: r.dataHora.toISOString(),
      produtoId: r.produtoId,
      codigoProduto: r.codigoProduto,
      discriminacaoProduto: r.discriminacaoProduto,
      quantidadeBaixada: r.quantidadeBaixada,
      unitarioCentavos: r.unitarioCentavos,
      unitarioBRL: centavosToBRL(r.unitarioCentavos),
      totalCentavos: r.totalCentavos,
      totalBRL: centavosToBRL(r.totalCentavos),
      formaPagamento: r.formaPagamento,
      lancamentoDiarioId: r.lancamentoDiarioId,
      dataFiscalLancamento: r.lancamentoDiario?.data ?? null,
    }));

    return NextResponse.json(
      {
        success: true,
        paginacao: {
          totalRegistros,
          limit,
          offset,
          temMais: offset + records.length < totalRegistros,
        },
        totais: {
          quantidadeTotalItensBaixados,
          valorTotalCentavos,
          valorTotalBRL: centavosToBRL(valorTotalCentavos),
        },
        historico,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno no servidor ao consultar histórico de baixas.",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
