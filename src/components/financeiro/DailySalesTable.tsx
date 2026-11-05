"use client";

import { useState } from "react";
import { Calendar, Eye } from "lucide-react";

interface DailyItem {
  data: string;
  totalCartaoCentavos: number;
  totalCartaoBRL: string;
  totalDinheiroCentavos: number;
  totalDinheiroBRL: string;
  totalGeralCentavos: number;
  totalGeralBRL: string;
  quantidadeLancamentos: number;
}

interface Props {
  dias: DailyItem[];
  onSelectDate?: (data: string) => void;
}

export function DailySalesTable({ dias, onSelectDate }: Props) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const toggleExpand = (data: string) => {
    setExpandedDate(expandedDate === data ? null : data);
    if (onSelectDate) onSelectDate(data);
  };

  const formatDateLabel = (isoDate: string) => {
    try {
      const [year, month, day] = isoDate.split("-");
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d);
      return `${day}/${month}/${year} (${diaSemana.toUpperCase()})`;
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4">
        <h3 className="text-base font-bold text-slate-800">
          Detalhamento Diário de Vendas (Cartão vs. Dinheiro)
        </h3>
        <p className="text-xs text-slate-500">
          Regra Fiscal R1: Total Diário = Cartão + Dinheiro com fidelidade numérica estrita sem truncamento.
        </p>
      </div>

      {/* Visualização Mobile em Cards */}
      <div className="md:hidden divide-y divide-slate-100">
        {dias.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">
            Nenhum lançamento de vendas registrado no período selecionado.
          </div>
        ) : (
          dias.map((d) => (
            <div
              key={d.data}
              className="p-4 space-y-2.5 active:bg-slate-50 transition-colors"
              onClick={() => toggleExpand(d.data)}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  {formatDateLabel(d.data)}
                </span>
                <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {d.quantidadeLancamentos} {d.quantidadeLancamentos === 1 ? "venda" : "vendas"}
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <span className="text-xs text-slate-500 font-medium">Total Diário:</span>
                <span className="text-xl font-black text-slate-900 font-mono">
                  {d.totalGeralBRL}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div className="rounded-lg bg-blue-50/70 border border-blue-100 px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-blue-700 font-medium">Cartão</span>
                  <span className="font-bold text-blue-900 font-mono">{d.totalCartaoBRL}</span>
                </div>
                <div className="rounded-lg bg-emerald-50/70 border border-emerald-100 px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-emerald-700 font-medium">Dinheiro</span>
                  <span className="font-bold text-emerald-900 font-mono">{d.totalDinheiroBRL}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabela Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-100/50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-6 py-3.5">Data</th>
              <th className="px-6 py-3.5 text-right">Vendas em Cartão</th>
              <th className="px-6 py-3.5 text-right">Vendas em Dinheiro</th>
              <th className="px-6 py-3.5 text-right text-slate-900 font-bold">
                Total Diário
              </th>
              <th className="px-6 py-3.5 text-center">Lançamentos</th>
              <th className="px-6 py-3.5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dias.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                  Nenhum lançamento de vendas registrado no período selecionado.
                </td>
              </tr>
            ) : (
              dias.map((d) => (
                <tr
                  key={d.data}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(d.data)}
                >
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span>{formatDateLabel(d.data)}</span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-blue-700">
                    {d.totalCartaoBRL}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-emerald-700">
                    {d.totalDinheiroBRL}
                  </td>
                  <td className="px-6 py-4 text-right font-extrabold text-slate-900">
                    {d.totalGeralBRL}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {d.quantidadeLancamentos}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Visualizar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
