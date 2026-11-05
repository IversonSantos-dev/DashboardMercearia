import Link from "next/link";
import {
  ShoppingCart,
  Package,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-12 space-y-12">
      {/* Hero Header */}
      <header className="text-center sm:text-left space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
          <Sparkles className="h-3.5 w-3.5" />
          Sistema de Gestão &amp; Automação Fiscal Mercearia
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900">
          Controle de Caixa &amp; Estoque Modelo P7
        </h1>
        <p className="text-base sm:text-lg text-slate-600 max-w-3xl">
          Controle diário de vendas discriminadas (Cartão vs. Dinheiro), algoritmo de baixa inteligente por valor alvo e consolidação contábil Modelo P7 com precisão monetária estrita.
        </p>
      </header>

      {/* Main Hub Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Frente de Caixa (POS) */}
        <Link
          href="/caixa"
          className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg hover:border-blue-500 flex flex-col justify-between"
        >
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                Operacional
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
              Frente de Caixa (POS)
            </h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Lançamento ágil de vendas com algoritmo multi-tier de baixa inteligente de estoque, catálogo assistido e modal de conferência fiscal.
            </p>
          </div>
          <div className="mt-6 flex items-center text-sm font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
            Abrir Frente de Caixa <ArrowRight className="ml-1.5 h-4 w-4" />
          </div>
        </Link>

        {/* Card Inventário Modelo P7 */}
        <Link
          href="/inventario"
          className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg hover:border-emerald-500 flex flex-col justify-between"
        >
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Package className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Estoque
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
              Inventário Modelo P7
            </h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Importador (.xlsx, .csv) com detecção dinâmica de cabeçalhos, prévia segura em modo Dry Run, quarentena e catálogo de produtos em tempo real.
            </p>
          </div>
          <div className="mt-6 flex items-center text-sm font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
            Gerenciar Inventário <ArrowRight className="ml-1.5 h-4 w-4" />
          </div>
        </Link>

        {/* Card Painel Financeiro */}
        <Link
          href="/financeiro"
          className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg hover:border-violet-500 flex flex-col justify-between"
        >
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600 mb-4 group-hover:bg-violet-600 group-hover:text-white transition-colors">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                Gestão &amp; DRE
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 group-hover:text-violet-600 transition-colors">
              Painel Financeiro
            </h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Fechamento diário (Cartão vs. Dinheiro), consolidação mensal acumulada, gestão de despesas categorizadas e confronto de saldo líquido.
            </p>
          </div>
          <div className="mt-6 flex items-center text-sm font-bold text-violet-600 group-hover:translate-x-1 transition-transform">
            Acessar Financeiro <ArrowRight className="ml-1.5 h-4 w-4" />
          </div>
        </Link>
      </div>

      {/* Architecture & Guarantees Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          Garantias de Integridade &amp; Precisão do Sistema
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-slate-600">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800">Precisão Monetária Universal</p>
              <p className="mt-0.5 text-slate-500">
                Operações aritméticas estritamente em centavos inteiros (Int), eliminando qualquer desvio de ponto flutuante IEEE-754.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800">Atomicidade Transacional ACID</p>
              <p className="mt-0.5 text-slate-500">
                Débito de estoque, desativação de produto zerado, lançamento diário e auditoria executados em transação SQLite WAL única.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800">Conformidade Modelo P7</p>
              <p className="mt-0.5 text-slate-500">
                Reconhecimento inteligente de âncoras fiscais, isolamento de preâmbulos administrativos e quarentena de linhas corrompidas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
