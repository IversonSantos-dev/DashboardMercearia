// ====================================================================
// Module: financeiro
// Subsystem: Financial Dashboard, Daily Aggregations & Monthly Closure
// Features: F23 (Daily Sales View), F24 (Monthly Consolidation), F25 (Expenses)
// ====================================================================

import prisma from "@/lib/prisma";
import {
  addMoney,
  subtractMoney,
  centavosToBRL,
} from "@/modules/currency";

export * from "./types";
import {
  DailySalesSummary,
  DetailedDailySalesSummary,
  ExpenseCategoryBreakdown,
  MonthlyConsolidation,
  DetailedMonthlyConsolidation,
  CANONICAL_EXPENSE_CATEGORIES,
  CanonicalExpenseCategory,
  CATEGORIAS_DESPESA_LABELS,
} from "./types";

// --------------------------------------------------------------------
// Domain Functions
// --------------------------------------------------------------------

/**
 * Retorna o resumo consolidado de vendas de um único dia específico.
 * Se o dia não contiver lançamentos, retorna zeros sem lançar erro (T2-B22).
 */
export async function getDailySales(data: string): Promise<DailySalesSummary> {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`Data inválida: "${data}". Formato obrigatório: YYYY-MM-DD`);
  }

  const entries = await prisma.lancamentoDiario.findMany({
    where: { data },
  });

  const totalCartaoCentavos = entries.reduce(
    (acc, curr) => addMoney(acc, curr.valorCartaoCentavos),
    0
  );
  const totalDinheiroCentavos = entries.reduce(
    (acc, curr) => addMoney(acc, curr.valorDinheiroCentavos),
    0
  );
  const totalGeralCentavos = addMoney(totalCartaoCentavos, totalDinheiroCentavos);

  return {
    data,
    totalCartaoCentavos,
    totalDinheiroCentavos,
    totalGeralCentavos,
    quantidadeLancamentos: entries.length,
  };
}

/**
 * Retorna resumos diários para um intervalo de datas [startDate, endDate].
 */
export async function getDailySalesRange(
  startDate: string,
  endDate: string
): Promise<DailySalesSummary[]> {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    throw new Error(
      `Intervalo de datas inválido: "${startDate}" a "${endDate}". Formato: YYYY-MM-DD`
    );
  }

  const entries = await prisma.lancamentoDiario.findMany({
    where: {
      data: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { data: "asc" },
  });

  // Agrupa lançamentos por data
  const mapPorData = new Map<
    string,
    { cartao: number; dinheiro: number; count: number }
  >();

  for (const e of entries) {
    const existing = mapPorData.get(e.data) ?? { cartao: 0, dinheiro: 0, count: 0 };
    existing.cartao = addMoney(existing.cartao, e.valorCartaoCentavos);
    existing.dinheiro = addMoney(existing.dinheiro, e.valorDinheiroCentavos);
    existing.count += 1;
    mapPorData.set(e.data, existing);
  }

  const results: DailySalesSummary[] = [];
  for (const [data, val] of mapPorData.entries()) {
    const totalGeral = addMoney(val.cartao, val.dinheiro);
    results.push({
      data,
      totalCartaoCentavos: val.cartao,
      totalDinheiroCentavos: val.dinheiro,
      totalGeralCentavos: totalGeral,
      quantidadeLancamentos: val.count,
    });
  }

  // Ordena por data decrescente para exibição natural em tabela
  return results.sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Retorna a consolidação mensal de vendas e despesas (DRE simplificado).
 * Lida graciosamente com déficit (saldoLiquidoCentavos negativo).
 */
export async function getMonthlyConsolidation(
  mesAno: string
): Promise<MonthlyConsolidation> {
  if (!mesAno || !/^\d{4}-\d{2}$/.test(mesAno)) {
    throw new Error(`Mês de referência inválido: "${mesAno}". Formato: YYYY-MM`);
  }

  const sales = await prisma.lancamentoDiario.findMany({
    where: { data: { startsWith: mesAno } },
  });

  const expenses = await prisma.despesaMensal.findMany({
    where: { mesAno },
  });

  const totalCartaoCentavos = sales.reduce(
    (acc, curr) => addMoney(acc, curr.valorCartaoCentavos),
    0
  );
  const totalDinheiroCentavos = sales.reduce(
    (acc, curr) => addMoney(acc, curr.valorDinheiroCentavos),
    0
  );
  const totalEntradasCentavos = addMoney(totalCartaoCentavos, totalDinheiroCentavos);

  const totalSaidasCentavos = expenses.reduce(
    (acc, curr) => addMoney(acc, curr.valorCentavos),
    0
  );

  const saldoLiquidoCentavos = subtractMoney(
    totalEntradasCentavos,
    totalSaidasCentavos
  );

  const diasComVendas = new Set(sales.map((s) => s.data)).size;

  return {
    mesAno,
    totalCartaoCentavos,
    totalDinheiroCentavos,
    totalEntradasCentavos,
    totalSaidasCentavos,
    saldoLiquidoCentavos,
    diasComVendas,
  };
}

/**
 * Retorna consolidação mensal enriquecida com formatação BRL e distribuição por categoria.
 */
export async function getDetailedMonthlyConsolidation(
  mesAno: string
): Promise<DetailedMonthlyConsolidation> {
  const base = await getMonthlyConsolidation(mesAno);

  const expenses = await prisma.despesaMensal.findMany({
    where: { mesAno },
  });

  const salesCount = await prisma.lancamentoDiario.count({
    where: { data: { startsWith: mesAno } },
  });

  // Agrupamento por categoria
  const catMap = new Map<string, { total: number; count: number }>();
  for (const cat of CANONICAL_EXPENSE_CATEGORIES) {
    catMap.set(cat, { total: 0, count: 0 });
  }

  for (const exp of expenses) {
    const item = catMap.get(exp.categoria) ?? { total: 0, count: 0 };
    item.total = addMoney(item.total, exp.valorCentavos);
    item.count += 1;
    catMap.set(exp.categoria, item);
  }

  const despesasPorCategoria: ExpenseCategoryBreakdown[] = [];
  for (const [cat, data] of catMap.entries()) {
    if (data.count > 0 || data.total > 0) {
      const pct =
        base.totalSaidasCentavos > 0
          ? Number(((data.total / base.totalSaidasCentavos) * 100).toFixed(1))
          : 0;
      despesasPorCategoria.push({
        categoria: cat,
        label: CATEGORIAS_DESPESA_LABELS[cat] || cat,
        totalCentavos: data.total,
        totalBRL: centavosToBRL(data.total),
        percentual: pct,
        quantidade: data.count,
      });
    }
  }

  // Ordena categorias pelo maior valor de despesa
  despesasPorCategoria.sort((a, b) => b.totalCentavos - a.totalCentavos);

  const margemLiquida =
    base.totalEntradasCentavos > 0
      ? Number(
          ((base.saldoLiquidoCentavos / base.totalEntradasCentavos) * 100).toFixed(1)
        )
      : 0;

  const pctCartao =
    base.totalEntradasCentavos > 0
      ? Number(((base.totalCartaoCentavos / base.totalEntradasCentavos) * 100).toFixed(1))
      : 0;

  const pctDinheiro =
    base.totalEntradasCentavos > 0
      ? Number(((base.totalDinheiroCentavos / base.totalEntradasCentavos) * 100).toFixed(1))
      : 0;

  return {
    ...base,
    totalCartaoBRL: centavosToBRL(base.totalCartaoCentavos),
    totalDinheiroBRL: centavosToBRL(base.totalDinheiroCentavos),
    totalEntradasBRL: centavosToBRL(base.totalEntradasCentavos),
    totalSaidasBRL: centavosToBRL(base.totalSaidasCentavos),
    saldoLiquidoBRL: centavosToBRL(base.saldoLiquidoCentavos),
    despesasPorCategoria,
    margemLiquidaPercentual: margemLiquida,
    percentualCartao: pctCartao,
    percentualDinheiro: pctDinheiro,
    quantidadeDespesas: expenses.length,
    quantidadeLancamentos: salesCount,
  };
}
