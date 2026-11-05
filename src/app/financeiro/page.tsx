"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  BarChart3,
  Calendar,
  Receipt,
} from "lucide-react";
import type { DetailedMonthlyConsolidation } from "@/modules/financeiro/types";
import { MonthlySummaryCards } from "@/components/financeiro/MonthlySummaryCards";
import { MonthlyComparisonCard } from "@/components/financeiro/MonthlyComparisonCard";
import { NotaFiscalCard } from "@/components/financeiro/NotaFiscalCard";
import { DailySalesTable } from "@/components/financeiro/DailySalesTable";
import { ExpenseModal } from "@/components/financeiro/ExpenseModal";
import { ExpenseListTable } from "@/components/financeiro/ExpenseListTable";

export default function FinanceiroPage() {
  const [currentMonth, setCurrentMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [activeTab, setActiveTab] = useState<"mensal" | "diario" | "despesas">("mensal");
  const [consolidation, setConsolidation] = useState<DetailedMonthlyConsolidation | null>(null);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [notaFiscal, setNotaFiscal] = useState<{ valorCentavos: number; valorBRL: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [resConsol, resDiario, resDespesas, resNF] = await Promise.all([
        fetch(`/api/financeiro/consolidado?mesAno=${currentMonth}`),
        fetch(`/api/financeiro/diario?mesAno=${currentMonth}`),
        fetch(`/api/despesas?mesAno=${currentMonth}`),
        fetch(`/api/financeiro/notas-fiscais?mesAno=${currentMonth}`),
      ]);

      if (!resConsol.ok || !resDiario.ok || !resDespesas.ok) {
        throw new Error("Falha ao comunicar com os serviços financeiros da API.");
      }

      const dataConsol = await resConsol.json();
      const dataDiario = await resDiario.json();
      const dataDespesas = await resDespesas.json();
      const dataNF = resNF.ok ? await resNF.json() : null;

      if (dataConsol.success) {
        setConsolidation(dataConsol);
      } else {
        throw new Error(dataConsol.error || "Erro ao consolidar mês.");
      }
      if (dataDiario.success) {
        setDailySales(dataDiario.dias || []);
      }
      if (dataDespesas.success) {
        setExpenses(dataDespesas.despesas || []);
      }
      if (dataNF?.success && dataNF.notaFiscal) {
        setNotaFiscal(dataNF.notaFiscal);
      } else {
        setNotaFiscal({ valorCentavos: 0, valorBRL: "R$ 0,00" });
      }
    } catch (err: any) {
      console.error("Falha ao carregar dados financeiros:", err);
      setErrorMsg(err?.message || "Erro desconhecido ao carregar painel financeiro.");
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const changeMonth = (offset: number) => {
    const [yearStr, monthStr] = currentMonth.split("-");
    const d = new Date(Number(yearStr), Number(monthStr) - 1 + offset, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setCurrentMonth(newMonth);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header com Navegação de Mês e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Painel Financeiro &amp; Fechamento
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhamento diário de caixa, consolidação mensal e confronto com despesas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor de Mês */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm p-1">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              title="Mês Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="px-2 py-1 text-sm font-bold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              title="Próximo Mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Botão Nova Despesa */}
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Despesa</span>
          </button>

          {/* Botão Atualizar */}
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-50"
            title="Recarregar Dados"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("mensal")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "mensal"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Consolidação Mensal (DRE)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("diario")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "diario"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Vendas Diárias ({dailySales.length} dias)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("despesas")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "despesas"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Receipt className="h-4 w-4" />
          Despesas ({expenses.length})
        </button>
      </div>

      {/* Feedback de Erro */}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={fetchData}
            className="text-xs font-bold underline hover:no-underline ml-4"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Conteúdo Dinâmico */}
      {loading && !consolidation ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : consolidation ? (
        <div className="space-y-6">
          {/* Cartões KPI Principais */}
          <MonthlySummaryCards data={consolidation} />

          {activeTab === "mensal" && (
            <>
              {notaFiscal && (
                <NotaFiscalCard
                  mesAno={currentMonth}
                  totalSaidasCentavos={consolidation.totalEntradasCentavos}
                  totalSaidasBRL={consolidation.totalEntradasBRL}
                  notaFiscalCentavos={notaFiscal.valorCentavos}
                  notaFiscalBRL={notaFiscal.valorBRL}
                  onNotaFiscalUpdated={fetchData}
                />
              )}
              <MonthlyComparisonCard data={consolidation} />
            </>
          )}

          {activeTab === "diario" && (
            <DailySalesTable dias={dailySales} />
          )}

          {activeTab === "despesas" && (
            <ExpenseListTable
              despesas={expenses}
              onExpenseDeleted={fetchData}
            />
          )}
        </div>
      ) : null}

      {/* Modal de Nova Despesa */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSuccess={fetchData}
        defaultMesAno={currentMonth}
      />
    </main>
  );
}
