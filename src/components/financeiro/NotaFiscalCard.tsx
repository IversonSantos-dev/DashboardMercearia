"use client";

import { useState } from "react";
import { FileText, Edit3, Check, X, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";
import { centavosToBRL, brlToCentavos } from "@/modules/currency";

interface Props {
  mesAno: string;
  totalSaidasCentavos: number;
  totalSaidasBRL: string;
  notaFiscalCentavos: number;
  notaFiscalBRL: string;
  onNotaFiscalUpdated: () => void;
}

export function NotaFiscalCard({
  mesAno,
  totalSaidasCentavos,
  totalSaidasBRL,
  notaFiscalCentavos,
  notaFiscalBRL,
  onNotaFiscalUpdated,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coberturaPercentual =
    totalSaidasCentavos > 0
      ? Math.min(999, Number(((notaFiscalCentavos / totalSaidasCentavos) * 100).toFixed(1)))
      : 0;

  const diferencaCentavos = notaFiscalCentavos - totalSaidasCentavos;
  const diferencaBRL = centavosToBRL(Math.abs(diferencaCentavos));

  const handleStartEdit = () => {
    setInputValue(notaFiscalCentavos > 0 ? (notaFiscalCentavos / 100).toFixed(2).replace(".", ",") : "");
    setError(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const centavos = brlToCentavos(inputValue);
      const res = await fetch("/api/financeiro/notas-fiscais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mesAno,
          valor: centavos,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao salvar nota fiscal.");
      }

      setIsEditing(false);
      onNotaFiscalUpdated();
    } catch (err: any) {
      setError(err?.message || "Erro ao atualizar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Confronto Fiscal: Nota Fiscal de Entrada vs. Saídas de Caixa
            </h3>
            <p className="text-xs text-slate-500">
              Mapeamento fiel da aba &quot;Entradasaida&quot; da sua planilha (Entrada manual de NF-e vs. Saídas totais).
            </p>
          </div>
        </div>

        {!isEditing ? (
          <button
            type="button"
            onClick={handleStartEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Editar Valor de NF</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                R$
              </span>
              <input
                type="text"
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="0,00"
                className="w-32 pl-8 pr-2.5 py-1 text-sm font-bold border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              title="Salvar"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
              title="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-50 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Grid de Confronto */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Entrada com NF */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-indigo-700 mb-1">
            <span className="flex items-center gap-1">
              <ArrowUpRight className="h-4 w-4 text-indigo-600" />
              Entrada com Nota Fiscal
            </span>
            <FileText className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-950">
            {notaFiscalBRL}
          </div>
          <div className="text-xs text-indigo-600 mt-1">
            Informado para o mês de {mesAno}
          </div>
        </div>

        {/* Saídas do Caixa */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-600 mb-1">
            <span className="flex items-center gap-1">
              <ArrowDownRight className="h-4 w-4 text-amber-600" />
              Saídas do Caixa (Vendas)
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {totalSaidasBRL}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Soma acumulada (Cartão + Dinheiro)
          </div>
        </div>

        {/* Cobertura / Relação Fiscal */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500 mb-1">
            Relação NF / Saídas
          </div>
          <div className="text-2xl font-black text-slate-900">
            {coberturaPercentual}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Diferença: {diferencaCentavos >= 0 ? "+" : "-"}{diferencaBRL}
          </div>
        </div>
      </div>
    </div>
  );
}
