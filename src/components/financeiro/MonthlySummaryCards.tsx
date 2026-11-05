"use client";

import { CreditCard, Banknote, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import type { DetailedMonthlyConsolidation } from "@/modules/financeiro/types";

interface Props {
  data: DetailedMonthlyConsolidation;
}

export function MonthlySummaryCards({ data }: Props) {
  const isSuperavit = data.saldoLiquidoCentavos >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Total Cartão */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Cartão</span>
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <CreditCard className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900">{data.totalCartaoBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.percentualCartao}% do faturamento
        </div>
      </div>

      {/* 2. Total Dinheiro */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Dinheiro</span>
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <Banknote className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900">{data.totalDinheiroBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.percentualDinheiro}% do faturamento
        </div>
      </div>

      {/* 3. Total Entradas */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Entradas</span>
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-indigo-700">{data.totalEntradasBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.diasComVendas} dias com vendas ({data.quantidadeLancamentos} lançamentos)
        </div>
      </div>

      {/* 4. Total Saídas (Despesas) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Despesas</span>
          <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
            <TrendingDown className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-rose-600">{data.totalSaidasBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.quantidadeDespesas} despesas registradas
        </div>
      </div>

      {/* 5. Saldo Líquido */}
      <div
        className={`rounded-xl border p-5 shadow-sm ${
          isSuperavit
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-rose-200 bg-rose-50/40"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              isSuperavit ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            Saldo Líquido
          </span>
          <div
            className={`p-2 rounded-lg ${
              isSuperavit
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            <DollarSign className="h-4 w-4" />
          </div>
        </div>
        <div
          className={`text-2xl font-black ${
            isSuperavit ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {data.saldoLiquidoBRL}
        </div>
        <div
          className={`mt-1 text-xs font-medium ${
            isSuperavit ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {isSuperavit ? "Superávit Operacional" : "Déficit Operacional"} &bull; Margem:{" "}
          {data.margemLiquidaPercentual}%
        </div>
      </div>
    </div>
  );
}
