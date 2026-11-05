# Handoff Report: M4 Explorer 1 (POS Frente de Caixa & Deduction Preview Modal)

**Agent**: M4 Explorer 1  
**Working Directory**: `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_1`  
**Target Milestone**: M4 (User Interface & Financial Dashboard)  
**Features Covered**: F20 (Front of Store POS UI) & F21 (Interactive Deduction Preview Modal)

---

## 1. Observation

### 1.1 Existing APIs & Integration Endpoints
- **Suggestion Endpoint (`POST /api/baixa/sugestao`)**:
  - Located at `src/app/api/baixa/sugestao/route.ts` (lines 8–216).
  - Accepts payload:
    ```typescript
    {
      valorAlvoCentavos?: number;     // e.g. 2550 (R$ 25,50)
      valorAlvoBRL?: string;          // e.g. "R$ 25,50" or "25,50"
      formaPagamento: "CARTAO" | "DINHEIRO";
      data?: string;                  // ISO "YYYY-MM-DD"
      limiteAlternativas?: number;    // default 20, max 50
    }
    ```
  - Returns `200 OK` with JSON structure:
    ```typescript
    {
      success: true,
      sugestao: {
        estrategia: "EXACT_UNIT" | "EXACT_MULTIPLE" | "EXACT_COMBINATION" | "PROXIMITY_COMBINATION" | "ASSISTED_CATALOG" | "SEM_ESTOQUE",
        valorAlvoCentavos: number,
        valorAlvoBRL: string,
        valorSugeridoCentavos: number,
        valorSugeridoBRL: string,
        deltaCentavos: number,
        deltaBRL: string,
        itens: Array<{
          produtoId: string,
          codigo: string,
          barras: string | null,
          discriminacao: string,
          unidade: string,
          quantidadeDisponivel: number,
          quantidadeDebitar: number,
          unitarioCentavos: number,
          unitarioBRL: string,
          totalItemCentavos: number,
          totalItemBRL: string
        }>
      },
      catalogoProximidade: Array<{
        produtoId: string,
        codigo: string,
        barras: string | null,
        discriminacao: string,
        unidade: string,
        quantidadeDisponivel: number,
        unitarioCentavos: number,
        unitarioBRL: string,
        deltaCentavos: number
      }>,
      tempoExecucaoMs: number
    }
    ```
  - Gracefully handles empty inventory with strategy `"SEM_ESTOQUE"` and HTTP 200 (lines 132–153).

- **Execution Endpoint (`POST /api/baixa/executar`)**:
  - Located at `src/app/api/baixa/executar/route.ts` (lines 14–200).
  - Accepts payload:
    ```typescript
    {
      formaPagamento: "CARTAO" | "DINHEIRO",
      data: string, // "YYYY-MM-DD" mandatory
      valorAlvoCentavos?: number,
      itens: Array<{
        produtoId: string,
        quantidadeDebitar: number
      }>,
      observacoes?: string
    }
    ```
  - Returns `200 OK` with atomic receipt details:
    ```typescript
    {
      success: true,
      lancamentoId: string,
      totalDebitadoCentavos: number,
      totalDebitadoBRL: string,
      formaPagamento: "CARTAO" | "DINHEIRO",
      dataLancamento: string,
      itensBaixados: number,
      historicoIds: string[],
      detalhesItens: Array<{
        produtoId: string,
        codigo: string,
        discriminacao: string,
        quantidadeDebitada: number,
        quantidadeRestante: number,
        unitarioCentavos: number,
        totalItemCentavos: number,
        ativo: boolean
      }>
    }
    ```
  - Explicit error mappings:
    - HTTP 400: `DeductionValidationError` (invalid date, zero items, negative quantity).
    - HTTP 404: `ProductNotFoundError` (product ID not found).
    - HTTP 409: `ConcurrencyConflictError` (stock changed concurrently).
    - HTTP 422: `ProductInactiveError` or `InsufficientStockError` (requested > available).

### 1.2 Currency Utilities & Precision
- Module `src/modules/currency/index.ts` provides:
  - `brlToCentavos(val: string | number): number` (parses BRL strings like "R$ 1.234,56", "25,50", 25.5).
  - `centavosToBRL(centavos: number): string` (formats "R$ 1.234,56").
  - `formatDecimalBRL(centavos: number): string` (formats "1234,56" for inputs).
  - `addMoney`, `subtractMoney`, `multiplyMoney` strictly avoiding floating-point drift.

### 1.3 Target Files in Codebase
- Direct directory check shows `src/app/caixa/` does not yet exist.
- Directory `src/components/caixa/` does not yet exist.
- Directory `src/components/ui/` has not yet been populated with button/dialog/card primitives; components can utilize standard Tailwind classes and Lucide React icons.
- Package dependencies in `package.json`: `react@19.0.0`, `next@15.2.0`, `lucide-react@^1.68.0`, `tailwind-merge@^3.0.1`, `clsx@^2.1.1`.
- Vitest suite check (`npm run test`): 15 test files passed, 264 tests passed out of 264 tests.

---

## 2. Logic Chain

1. **User Requirement Mapping**:
   - R3 requires an operational POS interface where the operator inputs Target Value (R$), Payment Method (Cartão vs Dinheiro), and Fiscal Date (today by default, allowing retroactive selection).
   - R3 requires an intelligent deduction suggestion engine finding exact combinations or proximity matches, displaying Código, Barras, Discriminação, Qtd a Debitar, Unitário, and Total before confirmation.
   - R4 requires atomic database execution decrementing stock, setting `ativo = false` on zero balance, creating daily sales entry, and logging audit history.
   - F20 covers the Front of Store POS UI (`src/app/caixa/page.tsx`).
   - F21 covers the Interactive Deduction Preview Modal (`src/components/caixa/PreviewModal.tsx`).

2. **Operator Usability in Retail Environment**:
   - Cashiers operate at high speed; monetary inputs must feel responsive. A masked input that shifts centavos from right to left (typing `2`, `5`, `5`, `0` produces `R$ 25,50`) eliminates manual dot/comma confusion.
   - Denomination shortcut buttons (`+R$ 5`, `+R$ 10`, `+R$ 20`, `+R$ 50`, `+R$ 100`, `Limpar`) speed up cashier testing and rapid entry.
   - Payment method toggle must be large, high-contrast, and keyboard accessible (`Alt+C` for Cartão, `Alt+D` for Dinheiro).
   - Retroactive date selection requires immediate visual feedback (e.g. amber badge "Data Retroativa: DD/MM/AAAA") so the operator knows they are logging to a previous fiscal day (as verified by test `T1-F20-3`).

3. **Deduction Suggestion & Assisted Workflow**:
   - Calling `POST /api/baixa/sugestao` returns both the automated combination (`sugestao.itens`) and proximity alternatives (`catalogoProximidade`).
   - The operator needs full agency:
     - The ability to adjust quantities (`+` / `-`) or remove suggested items.
     - The ability to add products from the assisted catalog to balance out a sale or override an automated suggestion.
     - Live delta calculation: `delta = currentTotalCentavos - valorAlvoCentavos`.
     - Visual badge indicating matching status: Exact match (green), Surplus (amber), Deficit (amber).

4. **Confirmation Modal as Strict Fiscal Gatekeeper (F21)**:
   - Clicking "Revisar e Confirmar Baixa" opens `PreviewModal`.
   - The modal verifies all 6 mandatory columns: Código, Código de Barras, Discriminação, Quantidade a Debitar, Preço Unitário, and Total do Item.
   - Prevents submission if quantity exceeds available stock or if no items are selected.
   - Upon confirming, calls `POST /api/baixa/executar`.
   - Transitions directly into an immutable digital receipt view with the generated `lancamentoId`, total debit, and post-deduction remaining stock counts (`quantidadeRestante`), with actions to print the receipt, start a new sale, or view the entry in the financial dashboard.

---

## 3. Caveats

1. **No External UI Component Library**: The project does not install a heavy shadcn/Radix dependency tree; it uses clean, native React 19 + Tailwind CSS + Lucide icons. Modals should be built as accessible React overlays with `aria-modal="true"`, background backdrop, and `Esc` key handling.
2. **Local Timezone Consistency**: When defaulting the date input to today, `new Date().toISOString().split('T')[0]` can shift to yesterday if run in UTC-3 near midnight. The implementation must use local date formatting (`year`, `month`, `day` via `toLocaleDateString("sv-SE")` or local getters) to guarantee exact local date representation.
3. **Empty Inventory State**: If the database contains no active stock items, `POST /api/baixa/sugestao` returns `estrategia: "SEM_ESTOQUE"`. The UI must handle this gracefully with a call-to-action redirecting to `/inventario` rather than crashing or showing empty tables.

---

## 4. Conclusion & Component Blueprints

The POS Frente de Caixa and Preview Modal subsystem should be implemented across 4 primary files:
1. `src/app/caixa/page.tsx` — Main POS Shell & State Orchestrator
2. `src/components/caixa/BaixaForm.tsx` — Input Panel (Target Value, Payment Toggle, Retroactive Date)
3. `src/components/caixa/SuggestionCard.tsx` — Results Panel, Strategy Badges, Interactive Item Editor & Assisted Catalog
4. `src/components/caixa/PreviewModal.tsx` — Deduction Confirmation Dialog (F21) & Post-Execution Digital Receipt

### Complete Architectural Blueprint

#### 1. TypeScript Types & State Contracts (`src/components/caixa/types.ts`)

```typescript
export type FormaPagamento = "CARTAO" | "DINHEIRO";

export interface ItemBaixaUI {
  produtoId: string;
  codigo: string;
  barras: string | null;
  discriminacao: string;
  unidade: string;
  quantidadeDisponivel: number;
  quantidadeDebitar: number;
  unitarioCentavos: number;
  unitarioBRL: string;
  totalItemCentavos: number;
  totalItemBRL: string;
}

export interface AlternativaCatalogoUI {
  produtoId: string;
  codigo: string;
  barras: string | null;
  discriminacao: string;
  unidade: string;
  quantidadeDisponivel: number;
  unitarioCentavos: number;
  unitarioBRL: string;
  deltaCentavos: number;
}

export interface SugestaoResponseUI {
  estrategia:
    | "EXACT_UNIT"
    | "EXACT_MULTIPLE"
    | "EXACT_COMBINATION"
    | "PROXIMITY_COMBINATION"
    | "ASSISTED_CATALOG"
    | "SEM_ESTOQUE";
  valorAlvoCentavos: number;
  valorAlvoBRL: string;
  valorSugeridoCentavos: number;
  valorSugeridoBRL: string;
  deltaCentavos: number;
  deltaBRL: string;
  itens: ItemBaixaUI[];
}

export interface ExecucaoDetalheItemUI {
  produtoId: string;
  codigo: string;
  discriminacao: string;
  quantidadeDebitada: number;
  quantidadeRestante: number;
  unitarioCentavos: number;
  totalItemCentavos: number;
  ativo: boolean;
}

export interface ExecucaoReceiptUI {
  lancamentoId: string;
  totalDebitadoCentavos: number;
  totalDebitadoBRL: string;
  formaPagamento: FormaPagamento;
  dataLancamento: string;
  itensBaixados: number;
  historicoIds: string[];
  detalhesItens: ExecucaoDetalheItemUI[];
}
```

---

#### 2. Root POS Page (`src/app/caixa/page.tsx`)

```tsx
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingCart, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
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
  const [receiptData, setReceiptData] = useState<ExecucaoReceiptUI | null>(null);

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
      {/* Top Bar Navigation */}
      <header className="border-b border-slate-200 bg-white">
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
```

---

#### 3. Operational Input Panel (`src/components/caixa/BaixaForm.tsx`)

```tsx
"use client";

import React from "react";
import { CreditCard, Banknote, Calendar, Search, Loader2, Sparkles } from "lucide-react";
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
  // Handle currency input via right-to-left digit entry
  function handleCurrencyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onBuscarSugestao();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      setValorAlvoCentavos(Math.floor(valorAlvoCentavos / 10));
      return;
    }
    if (e.key === "Delete" || e.key === "Escape") {
      e.preventDefault();
      setValorAlvoCentavos(0);
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const next = valorAlvoCentavos * 10 + parseInt(e.key, 10);
      if (next <= 100_000_000) {
        setValorAlvoCentavos(next);
      }
    }
  }

  // Denomination Quick Adders
  function addCentavos(add: number) {
    const next = valorAlvoCentavos + add;
    if (next <= 100_000_000) {
      setValorAlvoCentavos(next);
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
            readOnly
            value={centavosToBRL(valorAlvoCentavos)}
            onKeyDown={handleCurrencyKeyDown}
            placeholder="R$ 0,00"
            className="w-full text-3xl font-extrabold text-blue-900 tracking-tight px-4 py-3 bg-blue-50/50 border-2 border-blue-200 rounded-xl focus:outline-none focus:border-blue-600 focus:bg-white transition-all text-right font-mono cursor-pointer"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-400 uppercase">
            BRL
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 flex justify-between">
          <span>Digite os números (ex: 2, 5, 5, 0 = R$ 25,50)</span>
          <button
            type="button"
            onClick={() => setValorAlvoCentavos(0)}
            className="text-blue-600 hover:underline font-semibold"
          >
            Limpar (Esc)
          </button>
        </p>

        {/* Denomination Presets */}
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
              className="px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-xs font-semibold text-slate-700 transition"
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
```

---

#### 4. Suggestion Card & Assisted Catalog (`src/components/caixa/SuggestionCard.tsx`)

```tsx
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
          <div className="overflow-x-auto rounded-xl border border-slate-200">
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
```

---

#### 5. Interactive Deduction Preview Modal & Digital Receipt (`src/components/caixa/PreviewModal.tsx`)

```tsx
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
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
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
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
              >
                <Printer className="h-4 w-4" />
                Imprimir Comprovante
              </button>
              <div className="flex items-center gap-2">
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
```

---

## 5. Verification Method

To independently verify this specification and its readiness for the M4 implementation worker:

1. **Static Type & Contract Verification**:
   - Verify that all request and response fields match `src/app/api/baixa/sugestao/route.ts` and `src/app/api/baixa/executar/route.ts`.
   - Confirm that `valorAlvoCentavos` is treated as an integer in all components.
   - Confirm that `multiplyMoney` and `centavosToBRL` are imported from `@/modules/currency`.

2. **Automated Test Suite Compatibility**:
   - Run the complete project test suite:
     ```bash
     npm run test
     ```
   - Verify that existing E2E contracts in `tests/e2e/tier1-feature-coverage.test.ts` (specifically `T1-F20-1`, `T1-F20-2`, `T1-F20-3`, `T1-F21-4`, `T1-F21-5`) pass cleanly without disruption.

3. **Runtime Component Build Check**:
   - Once the worker creates the files:
     ```bash
     npx tsc --noEmit
     npm run build
     ```
   - Invalidation conditions: Any compile errors in React 19 / Next.js 15 client hooks, unresolved type imports, or floating-point arithmetic regressions.
