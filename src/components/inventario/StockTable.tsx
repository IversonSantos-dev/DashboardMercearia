"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ArrowUpDown,
} from "lucide-react";
import { centavosToBRL } from "@/modules/currency";

interface Produto {
  id: string;
  codigo: string;
  barras: string | null;
  ncm: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitarioCentavos: number;
  totalCentavos: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

interface StockTableProps {
  refreshTrigger?: number;
}

export function StockTable({ refreshTrigger }: StockTableProps) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "em_estoque" | "esgotado">("todos");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState("codigo");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Pagination & Stats from API
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [stats, setStats] = useState({
    totalProdutos: 0,
    totalItensEmEstoque: 0,
    totalItensEsgotados: 0,
    valorTotalEstoqueCentavos: 0,
  });

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1); // Reset to page 1 on query change
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchProdutos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: debouncedQuery,
        status: statusFilter,
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
      });

      const res = await fetch(`/api/inventario/produtos?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao consultar produtos");
      }

      setProdutos(data.produtos);
      setPagination(data.pagination);
      setStats(data.stats);
    } catch (err: any) {
      setError(err.message || "Erro na conexão");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, statusFilter, page, limit, sortBy, sortOrder]);

  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos, refreshTrigger]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      {/* Top Section: Title & High-level Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Catálogo de Estoque Atual</h2>
          <p className="text-sm text-slate-500">
            Produtos persistidos no banco de dados e disponíveis para baixa de caixa
          </p>
        </div>

        {/* Global Stock Stats Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-500">Total: </span>
            <span className="font-bold text-slate-800">{stats.totalProdutos} SKUs</span>
          </div>
          <div className="px-3 py-1 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
            <span className="text-emerald-700">Em Estoque: </span>
            <span className="font-bold text-emerald-900">{stats.totalItensEmEstoque}</span>
          </div>
          <div className="px-3 py-1 bg-rose-50 rounded-xl border border-rose-200 text-xs">
            <span className="text-rose-700">Esgotados: </span>
            <span className="font-bold text-rose-900">{stats.totalItensEsgotados}</span>
          </div>
          <div className="px-3 py-1 bg-slate-100 rounded-xl border border-slate-300 text-xs">
            <span className="text-slate-600">Patrimônio: </span>
            <span className="font-extrabold text-slate-900">{centavosToBRL(stats.valorTotalEstoqueCentavos)}</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código, barras ou descrição..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
          />
        </div>

        {/* Status Filter Tabs & Limit & Refresh */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setStatusFilter("todos"); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === "todos" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("em_estoque"); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === "em_estoque" ? "bg-white shadow-sm text-emerald-800 font-bold" : "text-slate-600 hover:text-slate-900"}`}
            >
              Em Estoque
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("esgotado"); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === "esgotado" ? "bg-white shadow-sm text-rose-800 font-bold" : "text-slate-600 hover:text-slate-900"}`}
            >
              Esgotados
            </button>
          </div>

          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="text-xs py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="10">10 / pág</option>
            <option value="20">20 / pág</option>
            <option value="50">50 / pág</option>
            <option value="100">100 / pág</option>
          </select>

          <button
            type="button"
            onClick={() => fetchProdutos()}
            disabled={isLoading}
            title="Atualizar lista"
            className="p-2 text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      {error ? (
        <div className="flex items-center gap-2 p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
          <p className="text-sm">Carregando catálogo de produtos...</p>
        </div>
      ) : produtos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <Package className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-base font-semibold text-slate-800">Nenhum produto encontrado</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchQuery
              ? `Nenhum item corresponde ao termo "${searchQuery}". Tente outro código ou descrição.`
              : "Não há produtos cadastrados. Realize o upload de uma planilha Modelo P7 acima."}
          </p>
        </div>
      ) : (
        <>
          {/* Visualização Mobile em Cards */}
          <div className="md:hidden space-y-3">
            {produtos.map((p) => {
              const isDisponivel = p.ativo && p.quantidade > 0;
              return (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {p.codigo}
                        </span>
                        {p.barras && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {p.barras}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 mt-1 leading-snug">
                        {p.discriminacao}
                      </h4>
                    </div>
                    {isDisponivel ? (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Em Estoque
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="w-2.5 h-2.5 text-rose-600" /> Esgotado
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Qtd Disp.</span>
                      <span
                        className={`font-black ${
                          p.quantidade > 0 ? "text-slate-900" : "text-rose-600"
                        }`}
                      >
                        {p.quantidade} {p.unidade}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Unitário</span>
                      <span className="font-semibold text-slate-700 font-mono">
                        {centavosToBRL(p.unitarioCentavos)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total</span>
                      <span className="font-black text-emerald-800 font-mono">
                        {centavosToBRL(p.totalCentavos)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold select-none">
              <tr>
                <th
                  onClick={() => handleSort("codigo")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Código</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3">Barras</th>
                <th
                  onClick={() => handleSort("discriminacao")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Discriminação</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-2">Unid</th>
                <th
                  onClick={() => handleSort("quantidade")}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Estoque</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("unitarioCentavos")}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Unitário</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("totalCentavos")}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {produtos.map((p) => {
                const isDisponivel = p.ativo && p.quantidade > 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{p.codigo}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{p.barras || "—"}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{p.discriminacao}</td>
                    <td className="py-2.5 px-2 text-slate-500 uppercase">{p.unidade}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`font-extrabold ${
                          p.quantidade > 0 ? "text-slate-900" : "text-rose-600 bg-rose-50 px-2 py-0.5 rounded"
                        }`}
                      >
                        {p.quantidade}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {centavosToBRL(p.unitarioCentavos)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                      {centavosToBRL(p.totalCentavos)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isDisponivel ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Em Estoque
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" /> Esgotado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    )}

      {/* Pagination Controls */}
      {!isLoading && produtos.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3 pt-2">
          <p>
            Página <span className="font-bold text-slate-800">{pagination.page}</span> de{" "}
            <span className="font-bold text-slate-800">{pagination.totalPages}</span> (
            {pagination.totalCount} produtos encontrados)
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={!pagination.hasPrevPage}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>

            <button
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!pagination.hasNextPage}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
