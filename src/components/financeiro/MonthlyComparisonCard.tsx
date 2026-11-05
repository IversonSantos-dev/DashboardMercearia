"use client";

import { PieChart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { DetailedMonthlyConsolidation } from "@/modules/financeiro/types";

interface Props {
  data: DetailedMonthlyConsolidation;
}

const CATEGORY_COLORS: Record<string, string> = {
  OPERACIONAL: "bg-purple-500",
  MERCADORIA: "bg-blue-500",
  CONTAS_FIXAS: "bg-amber-500",
  PESSOAL: "bg-orange-500",
  IMPOSTOS: "bg-rose-500",
  OUTROS: "bg-slate-500",
};

export function MonthlyComparisonCard({ data }: Props) {
  const ratioDespesasEntradas =
    data.totalEntradasCentavos > 0
      ? Math.min(
          100,
          Number(((data.totalSaidasCentavos / data.totalEntradasCentavos) * 100).toFixed(1))
        )
      : 100;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Confronto DRE Simplificado */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <PieChart className="h-5 w-5 text-indigo-600" />
          Confronto Financeiro (Entradas vs. Saídas)
        </h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm font-semibold mb-1">
              <span className="text-slate-600 flex items-center gap-1">
                <ArrowUpRight className="h-4 w-4 text-emerald-500" /> Entradas (Vendas)
              </span>
              <span className="text-emerald-700 font-bold">{data.totalEntradasBRL}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full w-full" />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm font-semibold mb-1">
              <span className="text-slate-600 flex items-center gap-1">
                <ArrowDownRight className="h-4 w-4 text-rose-500" /> Despesas (Saídas)
              </span>
              <span className="text-rose-600 font-bold">{data.totalSaidasBRL}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${ratioDespesasEntradas}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              Despesas consom {ratioDespesasEntradas}% da receita bruta.
            </span>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Resultado Líquido</span>
            <span
              className={`text-lg font-black ${
                data.saldoLiquidoCentavos >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {data.saldoLiquidoBRL}
            </span>
          </div>
        </div>
      </div>

      {/* Distribuição de Despesas por Categoria */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4">
          Despesas por Categoria
        </h3>

        {data.despesasPorCategoria.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-sm text-slate-400">
            Nenhuma despesa cadastrada no mês de {data.mesAno}.
          </div>
        ) : (
          <div className="space-y-3">
            {data.despesasPorCategoria.map((cat) => (
              <div key={cat.categoria}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">{cat.label}</span>
                  <span className="text-slate-900">
                    {cat.totalBRL} ({cat.percentual}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      CATEGORY_COLORS[cat.categoria] || "bg-slate-400"
                    }`}
                    style={{ width: `${cat.percentual}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
