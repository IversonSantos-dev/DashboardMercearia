"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  X,
  CreditCard,
  Banknote,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Printer,
  Copy,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { FormaPagamento, ItemBaixaUI, ExecucaoReceiptUI } from "./types";
import { centavosToBRL } from "@/modules/currency";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  formaPagamento: FormaPagamento;
  dataLancamento: string;
  valorAlvoCentavos: number;
  itens: ItemBaixaUI[];
  totalDebitarCentavos: number;
  deltaCentavos: number;
  onSuccess: (receipt: ExecucaoReceiptUI) => void;
  onResetForm: () => void;
}

export function PreviewModal({
  isOpen,
  onClose,
  formaPagamento,
  dataLancamento,
  valorAlvoCentavos,
  itens,
  totalDebitarCentavos,
  deltaCentavos,
  onSuccess,
  onResetForm,
}: PreviewModalProps) {
  const [observacoes, setObservacoes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ExecucaoReceiptUI | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  async function handleConfirmarBaixa() {
    // Trava estrita contra duplo clique
    if (isSubmitting || itens.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        formaPagamento,
        data: dataLancamento,
        valorAlvoCentavos,
        itens: itens.map((item) => ({
          produtoId: item.produtoId,
          quantidadeDebitar: item.quantidadeDebitar,
        })),
        observacoes: observacoes.trim() || undefined,
      };

      const res = await fetch("/api/baixa/executar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao executar transação de baixa.");
      }

      setReceipt(data);
      onSuccess(data);
    } catch (err: any) {
      setSubmitError(err.message || "Erro inesperado ao executar baixa.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCopyId(id: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  }

  function handleNovaVenda() {
    setReceipt(null);
    setObservacoes("");
    setSubmitError(null);
    onResetForm();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {receipt ? "Comprovante Fiscal de Baixa" : "Conferência e Confirmação de Baixa"}
              </h2>
              <p className="text-xs text-slate-500">
                {receipt
                  ? "Transação executada e registrada com sucesso"
                  : "Verifique os dados discriminados antes de gravar a transação"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* RECEIPT VIEW (Post-Execution Success State) */}
          {receipt ? (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                <h3 className="text-lg font-bold text-emerald-900">
                  Baixa de Caixa Concluída com Sucesso!
                </h3>
                <p className="text-xs text-emerald-700 max-w-md mx-auto">
                  O estoque foi decrementado atomicamente e o valor foi contabilizado no Livro
                  Diário de Vendas.
                </p>
              </div>

              {/* Receipt Summary Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-sans">ID do Lançamento:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{receipt.lancamentoId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(receipt.lancamentoId)}
                      className="text-slate-400 hover:text-blue-600 p-1"
                      title="Copiar ID"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {copiedId && <span className="text-[10px] text-blue-600">Copiado!</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-sans">Data Fiscal:</span>
                  <span className="font-bold text-slate-800">{receipt.dataLancamento}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-sans">Forma de Pagamento:</span>
                  <span className="font-bold text-slate-800 uppercase">
                    {receipt.formaPagamento}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-500 font-sans font-bold">Total Lançado no Caixa:</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {receipt.totalDebitadoBRL}
                  </span>
                </div>
              </div>

              {/* Updated Inventory State Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Saldo Restante no Estoque
                </h4>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Discriminação</th>
                        <th className="py-2 px-3 text-center">Qtd Baixada</th>
                        <th className="py-2 px-3 text-center">Saldo Restante</th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receipt.detalhesItens.map((d) => (
                        <tr key={d.produtoId}>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                            {d.codigo}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">{d.discriminacao}</td>
                          <td className="py-2 px-3 text-center font-bold text-slate-800">
                            {d.quantidadeDebitada}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-blue-700">
                            {d.quantidadeRestante}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                d.ativo
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-red-50 text-red-700 border border-red-200"
                              }`}
                            >
                              {d.ativo ? "Em Estoque" : "Esgotado / Inativo"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* PREVIEW CONFIRMATION VIEW (Pre-Execution Modal) */
            <div className="space-y-6">
              {/* Fiscal Context Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[10px]">
                    Forma de Pagamento
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 font-bold text-slate-800">
                    {formaPagamento === "CARTAO" ? (
                      <>
                        <CreditCard className="h-4 w-4 text-blue-600" />
                        <span>CARTÃO</span>
                      </>
                    ) : (
                      <>
                        <Banknote className="h-4 w-4 text-emerald-600" />
                        <span>DINHEIRO</span>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[10px]">
                    Data Fiscal
                  </span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {dataLancamento}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[10px]">
                    Valor Alvo
                  </span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {centavosToBRL(valorAlvoCentavos)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[10px]">
                    Diferença (Delta)
                  </span>
                  <span
                    className={`font-bold mt-0.5 block ${
                      deltaCentavos === 0 ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {deltaCentavos === 0 ? "R$ 0,00" : centavosToBRL(deltaCentavos)}
                  </span>
                </div>
              </div>

              {/* Items Table - Strict Contract Display (R3, F21) */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Discriminação dos Itens para Débito
                </h4>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Código de Barras</th>
                        <th className="py-2.5 px-3">Discriminação</th>
                        <th className="py-2.5 px-3 text-center">Qtd Debitar</th>
                        <th className="py-2.5 px-3 text-right">Preço Unitário</th>
                        <th className="py-2.5 px-3 text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itens.map((item) => (
                        <tr key={item.produtoId}>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                            {item.codigo}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-500">
                            {item.barras || "—"}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {item.discriminacao}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-900">
                            {item.quantidadeDebitar} {item.unidade}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-slate-600">
                            {item.unitarioBRL}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            {item.totalItemBRL}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                      <tr>
                        <td colSpan={3} className="py-2.5 px-3 uppercase text-[11px] text-slate-500">
                          Total da Baixa
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {itens.reduce((acc, i) => acc + i.quantidadeDebitar, 0)} un
                        </td>
                        <td></td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 text-sm">
                          {centavosToBRL(totalDebitarCentavos)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Optional Operator Notes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Observações do Operador (Opcional)
                </label>
                <input
                  type="text"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex: Venda sem nota / ajuste de balcão"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Submission Error Banner */}
              {submitError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-xs text-red-800">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
          {receipt ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
              >
                <Printer className="h-4 w-4" />
                Imprimir Comprovante
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleNovaVenda();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition shadow-sm"
                >
                  <X className="h-4 w-4" />
                  Fechar
                </button>
                <Link
                  href={`/financeiro?data=${receipt.dataLancamento}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-blue-600 text-xs font-semibold transition"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver no Caixa Diário
                </Link>
                <button
                  type="button"
                  onClick={handleNovaVenda}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
                >
                  <RotateCcw className="h-4 w-4" />
                  Nova Baixa
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
              >
                Voltar e Ajustar
              </button>
              <button
                type="button"
                disabled={isSubmitting || itens.length === 0}
                onClick={handleConfirmarBaixa}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold transition shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processando transação atômica...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Confirmar Baixa e Gravar Caixa</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
