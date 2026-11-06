import type { Metadata } from "next";
import Link from "next/link";
import {
  ShoppingCart,
  Package,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Smartphone,
  Cpu,
  Layers,
  Database,
  Lock,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard Mercearia & POS Inteligente | Controle Financeiro & Estoque P7",
  description:
    "Sistema Full-Stack completo de automação comercial para varejo: Frente de Caixa (POS) com baixa inteligente de estoque Modelo P7, fechamento diário Cartão vs. Dinheiro e conciliação fiscal DRE.",
  keywords: [
    "Frente de Caixa",
    "POS Inteligente",
    "Inventário Modelo P7",
    "Controle Financeiro Mercearia",
    "Next.js Portfolio",
    "Automação Comercial",
    "Iverson Santos",
  ],
  authors: [{ name: "Iverson Santos" }],
  openGraph: {
    title: "Dashboard Mercearia & POS Inteligente | Portfolio",
    description:
      "Aplicação web de alta performance para mercearias e varejo com baixa inteligente de estoque e conciliação fiscal.",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <div className="space-y-20 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-8 pb-12 sm:pt-16 sm:pb-20 border-b border-slate-200 bg-gradient-to-b from-blue-50/50 via-white to-white">
        <div className="max-w-6xl mx-auto px-4 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100/80 border border-blue-200 text-blue-800 text-xs font-bold mb-6">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span>Sistema Full-Stack em Produção &bull; Portfolio de Engenharia</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.15]">
                Frente de Caixa Ágil &amp;{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  Baixa Inteligente
                </span>{" "}
                de Estoque
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
                Solução enterprise projetada para varejo de alimentos: conciliação diária discriminada de <strong>Cartão vs. Dinheiro</strong>, algoritmo de baixa assistida por aproximação e auditoria contábil <strong>Modelo P7</strong> com precisão monetária estrita em centavos.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all hover:scale-105 active:scale-95"
                >
                  <Lock className="h-4 w-4" />
                  <span>Acessar Painel do Sistema</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#recursos"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition"
                >
                  <span>Conhecer Recursos</span>
                </a>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-6 pt-4 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Mobile First Touch
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Sincronização Nuvem
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Zero Drift Monetário
                </span>
              </div>
            </div>

            {/* Quick Preview Card */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/60 relative">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-rose-400" />
                    <span className="h-3 w-3 rounded-full bg-amber-400" />
                    <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                    Motor P7 Ativo
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <span className="text-xs text-slate-500 font-semibold block">Vendas Consolidadas</span>
                    <span className="text-2xl font-black text-slate-900 mt-1 block">R$ 160.000+ em Movimento</span>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600 font-medium">
                      <span>160+ fechamentos fiscais</span>
                      <span className="text-emerald-600 font-bold">100% Auditado</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl border border-slate-100 bg-blue-50/50">
                      <span className="text-[11px] font-bold text-blue-700 block">Frente de Caixa</span>
                      <span className="text-xs text-slate-500 mt-0.5 block">Teclado numérico nativo</span>
                    </div>
                    <div className="p-3.5 rounded-xl border border-slate-100 bg-emerald-50/50">
                      <span className="text-[11px] font-bold text-emerald-700 block">Estoque P7</span>
                      <span className="text-xs text-slate-500 mt-0.5 block">850+ SKUs catalogados</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid Section */}
      <section id="recursos" className="max-w-6xl mx-auto px-4 space-y-12">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            Arquitetura &amp; Funcionalidades
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Engenharia Robusta do Balcão à Conciliação Fiscal
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Concebido para resolver as dores reais do pequeno e médio comércio varejista: agilidade na ponta do caixa e conformidade nos livros contábeis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="p-6 rounded-3xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-lg transition space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Frente de Caixa Touch</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Interface desenhada para smartphones e PDV touch. Abre o teclado numérico nativo, atalhos de cédulas rápidas e modal de confirmação com proteção rigorosa contra duplo clique.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-6 rounded-3xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-lg transition space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Cpu className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Algoritmo de Baixa P7</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              O operador informa apenas o valor alvo em R$. O algoritmo varre o estoque e calcula combinações exatas ou unitárias perfeitas para dar baixa no estoque automaticamente.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-6 rounded-3xl border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-lg transition space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Dashboard &amp; DRE Mensal</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Confronto mensal das saídas de mercadoria com a entrada de notas fiscais, controle de despesas operacionais e cálculo instantâneo de cobertura fiscal.
            </p>
          </div>
        </div>

        {/* Technical Highlights */}
        <div className="p-8 rounded-3xl bg-slate-900 text-white space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest block">
                Stack Tecnológica
              </span>
              <h3 className="text-xl font-bold mt-1">Alta Performance &amp; Resiliência de Dados</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300">Next.js 15 (App Router)</span>
              <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300">React 19</span>
              <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300">Prisma ORM</span>
              <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300">Supabase Cloud</span>
              <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300">Tailwind CSS</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
            <div>
              <Database className="h-5 w-5 text-blue-400 mb-2" />
              <h4 className="font-bold text-white">Redundância Híbrida</h4>
              <p className="text-xs text-slate-400 mt-1">Armazenamento local rápido e replicação na nuvem Supabase.</p>
            </div>
            <div>
              <Layers className="h-5 w-5 text-emerald-400 mb-2" />
              <h4 className="font-bold text-white">Aritmética Inteira</h4>
              <p className="text-xs text-slate-400 mt-1">Sem erros de ponto flutuante (IEEE-754); valores cravados ao centavo.</p>
            </div>
            <div>
              <Smartphone className="h-5 w-5 text-amber-400 mb-2" />
              <h4 className="font-bold text-white">Mobile-First Nativo</h4>
              <p className="text-xs text-slate-400 mt-1">Touch targets ergonômicos e dock inferior para operação ágil.</p>
            </div>
            <div>
              <ShieldCheck className="h-5 w-5 text-purple-400 mb-2" />
              <h4 className="font-bold text-white">Trilha de Auditoria</h4>
              <p className="text-xs text-slate-400 mt-1">Registro imutável de cada item debitado com carimbo de data e hora.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Developer Portfolio Banner */}
      <section className="max-w-6xl mx-auto px-4 text-center">
        <div className="p-8 sm:p-12 rounded-3xl bg-blue-50 border border-blue-200 space-y-4">
          <h3 className="text-xl sm:text-2xl font-black text-slate-900">
            Desenvolvido por Iverson Santos
          </h3>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">
            Engenharia de software focada em produtos digitais de alta escala, arquiteturas resilientes e interfaces de impacto.
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition"
            >
              <Lock className="h-4 w-4" />
              <span>Acessar Demonstração do Sistema (Admin)</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
