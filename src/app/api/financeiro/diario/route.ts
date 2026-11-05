import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDailySales, getDailySalesRange } from "@/modules/financeiro";
import { centavosToBRL, addMoney } from "@/modules/currency";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const dataParam = searchParams.get("data");
    const dataInicioParam = searchParams.get("dataInicio");
    const dataFimParam = searchParams.get("dataFim");
    const mesAnoParam = searchParams.get("mesAno");

    // Caso 1: Consulta de dia específico
    if (dataParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
        return NextResponse.json(
          {
            success: false,
            error: `Data inválida: "${dataParam}". Formato esperado: YYYY-MM-DD.`,
          },
          { status: 400 }
        );
      }

      const summary = await getDailySales(dataParam);
      const lancamentos = await prisma.lancamentoDiario.findMany({
        where: { data: dataParam },
        orderBy: { criadoEm: "desc" },
        include: {
          baixas: {
            select: {
              id: true,
              codigoProduto: true,
              discriminacaoProduto: true,
              quantidadeBaixada: true,
              unitarioCentavos: true,
              totalCentavos: true,
              formaPagamento: true,
            },
          },
        },
      });

      return NextResponse.json(
        {
          success: true,
          ...summary,
          totalCartaoBRL: centavosToBRL(summary.totalCartaoCentavos),
          totalDinheiroBRL: centavosToBRL(summary.totalDinheiroCentavos),
          totalGeralBRL: centavosToBRL(summary.totalGeralCentavos),
          lancamentos: lancamentos.map((l) => ({
            id: l.id,
            data: l.data,
            valorCartaoCentavos: l.valorCartaoCentavos,
            valorCartaoBRL: centavosToBRL(l.valorCartaoCentavos),
            valorDinheiroCentavos: l.valorDinheiroCentavos,
            valorDinheiroBRL: centavosToBRL(l.valorDinheiroCentavos),
            totalDiarioCentavos: l.totalDiarioCentavos,
            totalDiarioBRL: centavosToBRL(l.totalDiarioCentavos),
            observacoes: l.observacoes,
            criadoEm: l.criadoEm,
            baixas: l.baixas.map((b) => ({
              ...b,
              unitarioBRL: centavosToBRL(b.unitarioCentavos),
              totalBRL: centavosToBRL(b.totalCentavos),
            })),
          })),
        },
        { status: 200 }
      );
    }

    // Caso 2: Intervalo de datas ou Mês Completo
    let startDate: string;
    let endDate: string;

    if (dataInicioParam && dataFimParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicioParam) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFimParam)) {
        return NextResponse.json(
          {
            success: false,
            error: "Formato de data de início ou fim inválido. Esperado YYYY-MM-DD.",
          },
          { status: 400 }
        );
      }
      startDate = dataInicioParam;
      endDate = dataFimParam;
    } else if (mesAnoParam) {
      if (!/^\d{4}-\d{2}$/.test(mesAnoParam)) {
        return NextResponse.json(
          {
            success: false,
            error: "Formato de mesAno inválido. Esperado YYYY-MM.",
          },
          { status: 400 }
        );
      }
      startDate = `${mesAnoParam}-01`;
      endDate = `${mesAnoParam}-31`;
    } else {
      // Padrão: Mês atual completo
      const currentMonth = new Date().toISOString().slice(0, 7);
      startDate = `${currentMonth}-01`;
      endDate = `${currentMonth}-31`;
    }

    const summaries = await getDailySalesRange(startDate, endDate);

    // Totais agregados do período
    const totalCartaoCentavos = summaries.reduce(
      (s, d) => addMoney(s, d.totalCartaoCentavos),
      0
    );
    const totalDinheiroCentavos = summaries.reduce(
      (s, d) => addMoney(s, d.totalDinheiroCentavos),
      0
    );
    const totalGeralCentavos = addMoney(totalCartaoCentavos, totalDinheiroCentavos);
    const totalLancamentos = summaries.reduce(
      (s, d) => s + d.quantidadeLancamentos,
      0
    );

    return NextResponse.json(
      {
        success: true,
        periodo: {
          dataInicio: startDate,
          dataFim: endDate,
        },
        totaisPeriodo: {
          totalCartaoCentavos,
          totalCartaoBRL: centavosToBRL(totalCartaoCentavos),
          totalDinheiroCentavos,
          totalDinheiroBRL: centavosToBRL(totalDinheiroCentavos),
          totalGeralCentavos,
          totalGeralBRL: centavosToBRL(totalGeralCentavos),
          quantidadeLancamentos: totalLancamentos,
          diasComVendas: summaries.length,
        },
        dias: summaries.map((d) => ({
          ...d,
          totalCartaoBRL: centavosToBRL(d.totalCartaoCentavos),
          totalDinheiroBRL: centavosToBRL(d.totalDinheiroCentavos),
          totalGeralBRL: centavosToBRL(d.totalGeralCentavos),
        })),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao consultar vendas diárias.",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
