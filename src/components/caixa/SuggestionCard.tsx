"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  XCircle,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  Search,
} from "lucide-react";
import { ItemBaixaUI, AlternativaCatalogoUI, SugestaoResponseUI } from "./types";
import { centavosToBRL } from "@/modules/currency";

interface SuggestionCardProps {
  sugestao: SugestaoResponseUI;
  itens: ItemBaixaUI[];
  catalogoProximidade: AlternativaCatalogoUI[];
  tempoExecucaoMs: number | null;
  valorAlvoCentavos: number;
  totalDebitarCentavos: number;
  deltaCentavos: number;
  onUpdateQuantity: (produtoId: string, novaQtd: number) => void;
  onRemoveItem: (produtoId: string) => void;
  onAddFromCatalog: (alt: AlternativaCatalogoUI) => void;
  onAbrirPreview: () => void;
}

export function SuggestionCard({
  sugestao,
  itens,
  catalogoProximidade,
  tempoExecucaoMs,
  valorAlvoCentavos,
  totalDebitarCentavos,
  deltaCentavos,
  onUpdateQuantity,
  onRemoveItem,
  onAddFromCatalog,
  onAbrirPreview,
}: SuggestionCardProps) {
  const [catalogSearch, setCatalogSearch] = useState("");

  // Strategy Badge Configuration
  const strategyConfig = {
    EXACT_UNIT: {
      label: "Múltiplo Exato Unitário",
      desc: "1 unidade de valor idêntico ao alvo",
      icon: CheckCircle2,
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    EXACT_MULTIPLE: {
      label: "Múltiplo Exato de Quantidade",
      desc: "N unidades do mesmo item cobrem 100% do valor",
      icon: CheckCircle2,
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    EXACT_COMBINATION: {
      label: "Combinação Multi-Item Exata",
      desc: "Soma exata encontrada pelo algoritmo subset-sum",
      icon: Sparkles,
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    },
    PROXIMITY_COMBINATION: {
      label: "Combinação Mais Próxima",
      desc: "Menor diferença possível de estoque encontrada",
      icon: AlertTriangle,
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    },
    ASSISTED_CATALOG: {
      label: "Seleção Assistida do Catálogo",
      desc: "Itens sugeridos por proximidade de preço unitário",
      icon: Layers,
      badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    },
    SEM_ESTOQUE: {
      label: "Estoque Zerado / Inativo",
      desc: "Não há produtos disponíveis para baixa",
      icon: XCircle,
      badgeClass: "bg-red-50 text-red-700 border-red-200",
    },
  }[sugestao.estrategia] || {
    label: sugestao.estrategia,
    desc: "",
    icon: Sparkles,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const StrategyIcon = strategyConfig.icon;

  if (sugestao.estrategia === "SEM_ESTOQUE") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center space-y-4">
        <XCircle className="h-12 w-12 text-red-500 mx-auto" />
        <h3 className="text-lg font-bold text-red-900">Estoque Indisponível</h3>
        <p className="text-sm text-red-700 max-w-md mx-auto">
          Não há itens ativos com quantidade maior que zero no estoque para realizar baixas.
          Importe uma nova planilha do Modelo P7 no módulo de inventário.
        </p>
        <Link
          href="/inventario"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition"
        >
          Ir para Importação de Inventário
        </Link>
      </div>
    );
  }

  // Filter Proximity Catalog
  const filteredCatalog = catalogoProximidade.filter((alt) => {
    if (!catalogSearch.trim()) return true;
    const q = catalogSearch.toLowerCase();
    return (
      alt.codigo.toLowerCase().includes(q) ||
      alt.discriminacao.toLowerCase().includes(q) ||
      (alt.barras && alt.barras.includes(q))
    );
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      {/* Strategy Header & Latency */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${strategyConfig.badgeClass}`}
          >
            <StrategyIcon className="h-3.5 w-3.5" />
            {strategyConfig.label}
          </span>
          <span className="text-xs text-slate-500">{strategyConfig.desc}</span>
        </div>
        {tempoExecucaoMs !== null && (
          <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            ⚡ {tempoExecucaoMs}ms
          </span>
        )}
      </div>

      {/* Metrics Comparison Bar */}
      <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-400">Valor Alvo</span>
          <p className="text-lg font-extrabold text-slate-800">
            {centavosToBRL(valorAlvoCentavos)}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-400">Total Sugerido</span>
          <p className="text-lg font-extrabold text-blue-700">
            {centavosToBRL(totalDebitarCentavos)}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-400">Diferença (Delta)</span>
          <p
            className={`text-lg font-extrabold ${
              deltaCentavos === 0
                ? "text-emerald-600"
                : deltaCentavos > 0
                ? "text-amber-600"
                : "text-amber-600"
            }`}
          >
            {deltaCentavos === 0
              ? "Exato (R$ 0,00)"
              : `${deltaCentavos > 0 ? "+" : ""}${centavosToBRL(deltaCentavos)}`}
          </p>
        </div>
      </div>

      {/* Suggested Items Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-800">
            Itens Selecionados para Baixa ({itens.length})
          </h3>
          <span className="text-xs text-slate-400">
            Você pode ajustar as quantidades antes de confirmar
          </span>
        </div>

        {itens.length === 0 ? (
          <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
            Nenhum item selecionado. Adicione itens do catálogo assistido abaixo.
          </div>
        ) : (
          <>
            {/* Visualização Mobile em Cards */}
            <div className="md:hidden space-y-3">
              {itens.map((item) => (
                <div
                  key={item.produtoId}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-slate-400 block uppercase">
                        Cód: {item.codigo} {item.barras ? `• GTIN: ${item.barras}` : ""}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">
                        {item.discriminacao}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.produtoId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="text-xs">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Unitário</span>
                      <span className="font-semibold text-slate-700">{item.unitarioBRL}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuantity(item.produtoId, item.quantidadeDebitar - 1)
                          }
                          disabled={item.quantidadeDebitar <= 1}
                          className="h-8 w-8 rounded-md bg-white text-slate-800 hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center font-bold text-base shadow-sm transition"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center font-bold text-slate-900 text-sm font-mono">
                          {item.quantidadeDebitar}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuantity(item.produtoId, item.quantidadeDebitar + 1)
                          }
                          disabled={item.quantidadeDebitar >= item.quantidadeDisponivel}
                          className="h-8 w-8 rounded-md bg-white text-slate-800 hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center font-bold text-base shadow-sm transition"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total</span>
                      <span className="font-black text-slate-900 text-sm font-mono">{item.totalItemBRL}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabela Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Discriminação</th>
                    <th className="py-2.5 px-3 text-center">Disp.</th>
                    <th className="py-2.5 px-3 text-center">Qtd Debitar</th>
                    <th className="py-2.5 px-3 text-right">Unitário</th>
                    <th className="py-2.5 px-3 text-right">Total Item</th>
                    <th className="py-2.5 px-2 text-center">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itens.map((item) => (
                    <tr key={item.produtoId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-mono text-slate-600 font-semibold">
                        {item.codigo}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-xs truncate">
                        {item.discriminacao}
                        {item.barras && (
                          <span className="block text-[10px] font-mono text-slate-400">
                            GTIN: {item.barras}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-500 font-semibold">
                        {item.quantidadeDisponivel} {item.unidade}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateQuantity(item.produtoId, item.quantidadeDebitar - 1)
                            }
                            disabled={item.quantidadeDebitar <= 1}
                            className="p-1 rounded bg-white text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-bold text-slate-800 text-xs">
                            {item.quantidadeDebitar}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateQuantity(item.produtoId, item.quantidadeDebitar + 1)
                            }
                            disabled={item.quantidadeDebitar >= item.quantidadeDisponivel}
                            className="p-1 rounded bg-white text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-slate-600">
                        {item.unitarioBRL}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {item.totalItemBRL}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.produtoId)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Action: Open Preview Modal */}
      <div className="pt-2">
        <button
          type="button"
          disabled={itens.length === 0 || totalDebitarCentavos <= 0}
          onClick={onAbrirPreview}
          className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-sm hover:shadow transition flex items-center justify-center gap-2"
        >
          <span>Revisar e Confirmar Baixa</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Assisted Proximity Catalog Section */}
      {catalogoProximidade.length > 0 && (
        <div className="border-t border-slate-100 pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Catálogo Assistido (Alternativas por Proximidade)
              </h4>
              <p className="text-[11px] text-slate-400">
                Itens com valor unitário próximo ao alvo para adicionar ou substituir
              </p>
            </div>
            <div className="relative w-48">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Filtrar alternativas..."
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200 uppercase font-semibold">
                <tr>
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Discriminação</th>
                  <th className="py-2 px-3 text-center">Disp.</th>
                  <th className="py-2 px-3 text-right">Unitário</th>
                  <th className="py-2 px-3 text-right">Delta p/ Alvo</th>
                  <th className="py-2 px-3 text-center">Adicionar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCatalog.map((alt) => (
                  <tr key={alt.produtoId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-1.5 px-3 font-mono text-slate-600">{alt.codigo}</td>
                    <td className="py-1.5 px-3 font-medium text-slate-800">{alt.discriminacao}</td>
                    <td className="py-1.5 px-3 text-center text-slate-500">
                      {alt.quantidadeDisponivel} {alt.unidade}
                    </td>
                    <td className="py-1.5 px-3 text-right font-semibold text-slate-700">
                      {alt.unitarioBRL}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[11px] text-slate-500">
                      {alt.deltaCentavos > 0 ? `+` : ``}
                      {centavosToBRL(alt.deltaCentavos)}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onAddFromCatalog(alt)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white font-semibold text-[11px] transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
