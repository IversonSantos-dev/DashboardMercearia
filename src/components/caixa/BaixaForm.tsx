"use client";

import React from "react";
import { CreditCard, Banknote, Loader2, Sparkles } from "lucide-react";
import { FormaPagamento } from "./types";
import { centavosToBRL } from "@/modules/currency";

interface BaixaFormProps {
  valorAlvoCentavos: number;
  setValorAlvoCentavos: (val: number) => void;
  formaPagamento: FormaPagamento;
  setFormaPagamento: (forma: FormaPagamento) => void;
  dataLancamento: string;
  setDataLancamento: (date: string) => void;
  onBuscarSugestao: () => void;
  isLoading: boolean;
}

export function BaixaForm({
  valorAlvoCentavos,
  setValorAlvoCentavos,
  formaPagamento,
  setFormaPagamento,
  dataLancamento,
  setDataLancamento,
  onBuscarSugestao,
  isLoading,
}: BaixaFormProps) {
  // Live text input for standard and mobile numerical keyboards
  const [displayValue, setDisplayValue] = React.useState<string>(() => {
    return valorAlvoCentavos > 0 ? (valorAlvoCentavos / 100).toFixed(2).replace(".", ",") : "";
  });

  // Sync display value when valorAlvoCentavos changes externally
  React.useEffect(() => {
    if (valorAlvoCentavos === 0) {
      setDisplayValue("");
    } else {
      setDisplayValue((valorAlvoCentavos / 100).toFixed(2).replace(".", ","));
    }
  }, [valorAlvoCentavos]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Only keep numeric digits from input
    const rawDigits = e.target.value.replace(/\D/g, "");
    if (!rawDigits || rawDigits === "0") {
      setValorAlvoCentavos(0);
      setDisplayValue("");
      return;
    }
    const cents = parseInt(rawDigits, 10);
    if (cents <= 100_000_000) {
      setValorAlvoCentavos(cents);
      setDisplayValue((cents / 100).toFixed(2).replace(".", ","));
    }
  }

  function handleClear() {
    setValorAlvoCentavos(0);
    setDisplayValue("");
  }

  function handleCurrencyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onBuscarSugestao();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleClear();
      return;
    }
  }

  // Denomination Quick Adders
  function addCentavos(add: number) {
    const next = valorAlvoCentavos + add;
    if (next <= 100_000_000) {
      setValorAlvoCentavos(next);
      setDisplayValue((next / 100).toFixed(2).replace(".", ","));
    }
  }

  // Local date helper
  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const isRetroactive = dataLancamento < todayISO;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-900">1. Lançamento da Venda</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Informe o valor alvo e as condições fiscais do caixa.
        </p>
      </div>

      {/* Target Value Input (BRL) */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
          Valor Alvo da Baixa (R$)
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={displayValue ? `R$ ${displayValue}` : ""}
            onChange={handleInputChange}
            onKeyDown={handleCurrencyKeyDown}
            placeholder="R$ 0,00"
            className="w-full text-3xl font-extrabold text-blue-900 tracking-tight px-4 py-3 bg-blue-50/50 border-2 border-blue-200 rounded-xl focus:outline-none focus:border-blue-600 focus:bg-white transition-all text-right font-mono"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-400 uppercase">
            BRL
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
          <span>Digite no teclado ou use os botões rápidos</span>
          {valorAlvoCentavos > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="text-blue-600 hover:underline font-semibold"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Denomination Quick Adders */}
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {[
            { label: "+R$ 5", val: 500 },
            { label: "+R$ 10", val: 1000 },
            { label: "+R$ 20", val: 2000 },
            { label: "+R$ 50", val: 5000 },
            { label: "+R$ 100", val: 10000 },
            { label: "+R$ 200", val: 20000 },
          ].map((denom) => (
            <button
              key={denom.val}
              type="button"
              onClick={() => addCentavos(denom.val)}
              className="px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-xs font-bold text-slate-700 transition select-none"
            >
              {denom.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payment Method Toggle (Cartão vs Dinheiro) */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
          Forma de Pagamento
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFormaPagamento("CARTAO")}
            className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border-2 font-bold text-sm transition-all ${
              formaPagamento === "CARTAO"
                ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <CreditCard className="h-5 w-5" />
            <span>Cartão</span>
          </button>

          <button
            type="button"
            onClick={() => setFormaPagamento("DINHEIRO")}
            className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border-2 font-bold text-sm transition-all ${
              formaPagamento === "DINHEIRO"
                ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <Banknote className="h-5 w-5" />
            <span>Dinheiro</span>
          </button>
        </div>
      </div>

      {/* Date Picker (with Retroactive Badge) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Data Fiscal do Lançamento
          </label>
          {isRetroactive && (
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              ⚠️ Retroativo
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type="date"
            value={dataLancamento}
            onChange={(e) => setDataLancamento(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => setDataLancamento(todayISO)}
            className="text-xs text-slate-500 hover:text-blue-600 font-medium underline"
          >
            Hoje
          </button>
          <span className="text-slate-300">&bull;</span>
          <button
            type="button"
            onClick={() => {
              const y = new Date();
              y.setDate(y.getDate() - 1);
              setDataLancamento(
                `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`
              );
            }}
            className="text-xs text-slate-500 hover:text-blue-600 font-medium underline"
          >
            Ontem
          </button>
        </div>
      </div>

      {/* Trigger Button: Buscar Sugestão */}
      <button
        type="button"
        disabled={valorAlvoCentavos <= 0 || isLoading}
        onClick={onBuscarSugestao}
        className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-sm hover:shadow transition flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Calculando melhor combinação...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span>Buscar Sugestão de Baixa (Enter)</span>
          </>
        )}
      </button>
    </div>
  );
}
