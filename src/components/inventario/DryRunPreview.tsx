"use client";

import React, { useState } from "react";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  RefreshCw,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Loader2,
  Building2,
} from "lucide-react";
import { centavosToBRL } from "@/modules/currency";

export interface DryRunData {
  success: boolean;
  dryRun: boolean;
  fileName: string;
  administrativeHeader: {
    razaoSocial?: string;
    cnpj?: string;
    dataInventario?: string;
  };
  summary: {
    totalItensLidos: number;
    totalItensValidos: number;
    totalItensQuarentena: number;
    novosProdutosEstimados: number;
    produtosAtualizadosEstimados: number;
    valorTotalGeralCentavos: number;
  };
  quarantine: Array<{
    rowNumber: number;
    codigo?: string;
    discriminacao?: string;
    reason: string;
    severity: "WARNING" | "ERROR";
    rawContent?: string;
  }>;
  itemsPreview: Array<{
    codigo: string;
    barras: string | null;
    ncm: string | null;
    discriminacao: string;
    unidade: string;
    quantidade: number;
    unitarioCentavos: number;
    totalCentavos: number;
  }>;
}

interface DryRunPreviewProps {
  data: DryRunData;
  onConfirm: () => void;
  onCancel: () => void;
  isCommitting: boolean;
}

export function DryRunPreview({ data, onConfirm, onCancel, isCommitting }: DryRunPreviewProps) {
  const [isQuarantineOpen, setIsQuarantineOpen] = useState(data.quarantine.length > 0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { administrativeHeader, summary, quarantine, itemsPreview } = data;

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      {/* Header & Meta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Modo Pré-visualização (Dry Run)
            </span>
            <span className="text-xs text-slate-500 font-mono">{data.fileName}</span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            Resumo do Processamento Modelo P7
          </h3>
        </div>

        {/* Administrative Header Info */}
        {(administrativeHeader.razaoSocial || administrativeHeader.cnpj) && (
          <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <Building2 className="w-4 h-4 text-slate-400" />
            <div>
              {administrativeHeader.razaoSocial && (
                <p className="font-semibold">{administrativeHeader.razaoSocial}</p>
              )}
              <p className="text-slate-500">
                CNPJ: {administrativeHeader.cnpj || "Não identificado"} &bull; Data:{" "}
                {administrativeHeader.dataInventario || "Não informada"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 6 Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            Lidos
          </div>
          <p className="mt-1 text-xl font-extrabold text-slate-800">{summary.totalItensLidos}</p>
        </div>

        <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Válidos
          </div>
          <p className="mt-1 text-xl font-extrabold text-emerald-800">{summary.totalItensValidos}</p>
        </div>

        <div className={`p-3.5 rounded-xl border ${quarantine.length > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${quarantine.length > 0 ? "text-amber-700" : "text-slate-500"}`}>
            <AlertTriangle className={`w-4 h-4 ${quarantine.length > 0 ? "text-amber-600" : "text-slate-400"}`} />
            Quarentena
          </div>
          <p className={`mt-1 text-xl font-extrabold ${quarantine.length > 0 ? "text-amber-800" : "text-slate-800"}`}>
            {summary.totalItensQuarentena}
          </p>
        </div>

        <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
            <PlusCircle className="w-4 h-4 text-blue-600" />
            Novos
          </div>
          <p className="mt-1 text-xl font-extrabold text-blue-800">{summary.novosProdutosEstimados}</p>
        </div>

        <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700">
            <RefreshCw className="w-4 h-4 text-indigo-600" />
            Atualizações
          </div>
          <p className="mt-1 text-xl font-extrabold text-indigo-800">{summary.produtosAtualizadosEstimados}</p>
        </div>

        <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Total Geral
          </div>
          <p className="mt-1 text-lg font-black text-emerald-900 truncate">
            {centavosToBRL(summary.valorTotalGeralCentavos)}
          </p>
        </div>
      </div>

      {/* Quarantine Warnings Accordion */}
      {quarantine.length > 0 ? (
        <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/30">
          <button
            type="button"
            onClick={() => setIsQuarantineOpen(!isQuarantineOpen)}
            className="flex items-center justify-between w-full px-4 py-3 bg-amber-100/60 text-amber-900 font-semibold text-sm hover:bg-amber-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              Ocorrências em Quarentena ({quarantine.length} itens com alertas ou ignorados)
            </span>
            {isQuarantineOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isQuarantineOpen && (
            <div className="max-h-60 overflow-y-auto p-4 divide-y divide-amber-100 bg-white">
              {quarantine.map((item, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 last:pb-0 text-xs flex items-start gap-3">
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      item.severity === "ERROR"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {item.severity}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      Linha #{item.rowNumber > 0 ? item.rowNumber : "N/A"}{" "}
                      {item.codigo && <span className="font-mono text-slate-500">[{item.codigo}]</span>}{" "}
                      {item.discriminacao && <span>- {item.discriminacao}</span>}
                    </p>
                    <p className="text-slate-600 mt-0.5">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 bg-emerald-50 rounded-xl border border-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Nenhuma inconformidade encontrada! Todas as linhas da planilha foram validadas com sucesso.</span>
        </div>
      )}

      {/* Preview Table Collapsible */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsPreviewOpen(!isPreviewOpen)}
          className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors"
        >
          <span>Visualizar Itens Válidos ({itemsPreview.length} primeiros registros)</span>
          {isPreviewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isPreviewOpen && (
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3">Barras</th>
                  <th className="py-2.5 px-3">Discriminação</th>
                  <th className="py-2.5 px-3">Unid</th>
                  <th className="py-2.5 px-3 text-right">Qtd</th>
                  <th className="py-2.5 px-3 text-right">Unitário</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsPreview.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-semibold text-slate-800">{item.codigo}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{item.barras || "—"}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{item.discriminacao}</td>
                    <td className="py-2 px-3 text-slate-500 uppercase">{item.unidade}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-800">{item.quantidade}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">{centavosToBRL(item.unitarioCentavos)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">{centavosToBRL(item.totalCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commit & Cancel Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCommitting}
          className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition"
        >
          Descartar / Cancelar
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={isCommitting}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow transition disabled:opacity-50"
        >
          {isCommitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Gravando no Banco de Dados...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Importação de Estoque</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
