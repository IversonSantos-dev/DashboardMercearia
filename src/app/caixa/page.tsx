"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingCart, Sparkles, AlertCircle } from "lucide-react";
import { BaixaForm } from "@/components/caixa/BaixaForm";
import { SuggestionCard } from "@/components/caixa/SuggestionCard";
import { PreviewModal } from "@/components/caixa/PreviewModal";
import {
  FormaPagamento,
  ItemBaixaUI,
  AlternativaCatalogoUI,
  SugestaoResponseUI,
  ExecucaoReceiptUI,
} from "@/components/caixa/types";
import { centavosToBRL, multiplyMoney } from "@/modules/currency";

export default function CaixaPage() {
  // Input State
  const [valorAlvoCentavos, setValorAlvoCentavos] = useState<number>(0);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("CARTAO");
  const [dataLancamento, setDataLancamento] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // Suggestion & Editing State
  const [isLoadingSugestao, setIsLoadingSugestao] = useState<boolean>(false);
  const [errorSugestao, setErrorSugestao] = useState<string | null>(null);
  const [sugestaoMeta, setSugestaoMeta] = useState<SugestaoResponseUI | null>(null);
  const [itensBaixa, setItensBaixa] = useState<ItemBaixaUI[]>([]);
  const [catalogoProximidade, setCatalogoProximidade] = useState<AlternativaCatalogoUI[]>([]);
  const [tempoExecucaoMs, setTempoExecucaoMs] = useState<number | null>(null);

  // Modal & Receipt State
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [, setReceiptData] = useState<ExecucaoReceiptUI | null>(null);

  // Live Recalculation
  const totalDebitarCentavos = useMemo(() => {
    return itensBaixa.reduce((acc, item) => acc + item.totalItemCentavos, 0);
  }, [itensBaixa]);

  const deltaCentavos = totalDebitarCentavos - valorAlvoCentavos;

  // Handler: Buscar Sugestão
  async function handleBuscarSugestao() {
    if (valorAlvoCentavos <= 0) {
      setErrorSugestao("Informe um valor alvo maior que zero para buscar a sugestão.");
      return;
    }

    setIsLoadingSugestao(true);
    setErrorSugestao(null);
    setReceiptData(null);

    try {
      const res = await fetch("/api/baixa/sugestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valorAlvoCentavos,
          formaPagamento,
          data: dataLancamento,
          limiteAlternativas: 20,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao consultar sugestão de baixa.");
      }

      setSugestaoMeta(data.sugestao);
      setItensBaixa(data.sugestao.itens || []);
      setCatalogoProximidade(data.catalogoProximidade || []);
      setTempoExecucaoMs(data.tempoExecucaoMs ?? null);

      // Abre automaticamente o pop-up com os valores, quantidades e botão de debitar
      if (data.sugestao?.itens && data.sugestao.itens.length > 0) {
        setIsPreviewOpen(true);
      }
    } catch (err: any) {
      setErrorSugestao(err.message || "Erro inesperado ao buscar sugestão.");
      setSugestaoMeta(null);
      setItensBaixa([]);
      setCatalogoProximidade([]);
    } finally {
      setIsLoadingSugestao(false);
    }
  }

  // Handler: Item Adjustments
  function handleUpdateQuantity(produtoId: string, novaQtd: number) {
    setItensBaixa((prev) =>
      prev.map((item) => {
        if (item.produtoId === produtoId) {
          const clampedQtd = Math.max(1, Math.min(novaQtd, item.quantidadeDisponivel));
          const totalItemCentavos = multiplyMoney(item.unitarioCentavos, clampedQtd);
          return {
            ...item,
            quantidadeDebitar: clampedQtd,
            totalItemCentavos,
            totalItemBRL: centavosToBRL(totalItemCentavos),
          };
        }
        return item;
      })
    );
  }

  function handleRemoveItem(produtoId: string) {
    setItensBaixa((prev) => prev.filter((item) => item.produtoId !== produtoId));
  }

  function handleAddFromCatalog(alt: AlternativaCatalogoUI) {
    setItensBaixa((prev) => {
      const existing = prev.find((i) => i.produtoId === alt.produtoId);
      if (existing) {
        const nextQtd = Math.min(existing.quantidadeDebitar + 1, existing.quantidadeDisponivel);
        const totalItemCentavos = multiplyMoney(existing.unitarioCentavos, nextQtd);
        return prev.map((item) =>
          item.produtoId === alt.produtoId
            ? {
                ...item,
                quantidadeDebitar: nextQtd,
                totalItemCentavos,
                totalItemBRL: centavosToBRL(totalItemCentavos),
              }
            : item
        );
      }
      const initialTotal = alt.unitarioCentavos;
      return [
        ...prev,
        {
          produtoId: alt.produtoId,
          codigo: alt.codigo,
          barras: alt.barras,
          discriminacao: alt.discriminacao,
          unidade: alt.unidade,
          quantidadeDisponivel: alt.quantidadeDisponivel,
          quantidadeDebitar: 1,
          unitarioCentavos: alt.unitarioCentavos,
          unitarioBRL: alt.unitarioBRL,
          totalItemCentavos: initialTotal,
          totalItemBRL: centavosToBRL(initialTotal),
        },
      ];
    });
  }

  function handleResetForm() {
    setValorAlvoCentavos(0);
    setSugestaoMeta(null);
    setItensBaixa([]);
    setCatalogoProximidade([]);
    setReceiptData(null);
    setErrorSugestao(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      {/* Top Bar Navigation (desktop only) */}
      <header className="border-b border-slate-200 bg-white hidden md:block">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Início
            </Link>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <h1 className="text-lg font-bold text-slate-800">Frente de Caixa (POS)</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              ● Sistema Operacional Ativo
            </span>
            <Link
              href="/inventario"
              className="text-slate-600 hover:text-blue-600 font-medium transition-colors"
            >
              Estoque
            </Link>
            <Link
              href="/financeiro"
              className="text-slate-600 hover:text-blue-600 font-medium transition-colors"
            >
              Livro Caixa
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Input Form (5 cols) */}
          <div className="lg:col-span-5">
            <BaixaForm
              valorAlvoCentavos={valorAlvoCentavos}
              setValorAlvoCentavos={setValorAlvoCentavos}
              formaPagamento={formaPagamento}
              setFormaPagamento={setFormaPagamento}
              dataLancamento={dataLancamento}
              setDataLancamento={setDataLancamento}
              onBuscarSugestao={handleBuscarSugestao}
              isLoading={isLoadingSugestao}
            />

            {errorSugestao && (
              <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-sm">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Erro ao buscar sugestão</p>
                  <p className="mt-0.5 text-red-700">{errorSugestao}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Suggestion Results & Catalog (7 cols) */}
          <div className="lg:col-span-7">
            {sugestaoMeta ? (
              <SuggestionCard
                sugestao={sugestaoMeta}
                itens={itensBaixa}
                catalogoProximidade={catalogoProximidade}
                tempoExecucaoMs={tempoExecucaoMs}
                valorAlvoCentavos={valorAlvoCentavos}
                totalDebitarCentavos={totalDebitarCentavos}
                deltaCentavos={deltaCentavos}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onAddFromCatalog={handleAddFromCatalog}
                onAbrirPreview={() => setIsPreviewOpen(true)}
              />
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white flex flex-col items-center justify-center min-h-[360px]">
                <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="text-base font-bold text-slate-700">Aguardando Valor Alvo</h3>
                <p className="mt-1 text-sm text-slate-500 max-w-sm">
                  Informe o valor alvo da venda e a forma de pagamento ao lado. Clique em &quot;Buscar Sugestão&quot; para calcular os itens de estoque ideais.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal (F21) & Digital Receipt */}
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        formaPagamento={formaPagamento}
        dataLancamento={dataLancamento}
        valorAlvoCentavos={valorAlvoCentavos}
        itens={itensBaixa}
        totalDebitarCentavos={totalDebitarCentavos}
        deltaCentavos={deltaCentavos}
        onSuccess={(receipt) => {
          setReceiptData(receipt);
        }}
        onResetForm={handleResetForm}
      />
    </main>
  );
}
