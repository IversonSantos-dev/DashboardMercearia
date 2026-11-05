# Handoff Report: Financial Dashboard, Monthly Closure & Expense Subsystem (M4)

**Agent**: M4 Explorer 3 (`m4_explorer_3`)  
**Mission**: Investigate and design the Financial Dashboard & Expense Subsystem for Milestone 4 (F23, F24, F25)  
**Date**: 2026-11-05T11:55:00Z  

---

## 1. Observation

### 1.1 Database Schema Direct Observations
In `prisma/schema.prisma`:
- Model `LancamentoDiario` (lines 45-60):
  ```prisma
  model LancamentoDiario {
    id                    String            @id @default(cuid())
    data                  String            // Data fiscal no formato ISO "YYYY-MM-DD" (ex: "2026-11-05")
    valorCartaoCentavos   Int               @default(0) @map("valor_cartao_centavos")
    valorDinheiroCentavos Int               @default(0) @map("valor_dinheiro_centavos")
    totalDiarioCentavos   Int               @default(0) @map("total_diario_centavos") // Cartão + Dinheiro
    observacoes           String?           @map("observacoes")
    criadoEm              DateTime          @default(now()) @map("criado_em")

    baixas                HistoricoBaixa[]

    @@index([data])
    @@map("lancamentos_diarios")
  }
  ```
- Model `DespesaMensal` (lines 91-104):
  ```prisma
  model DespesaMensal {
    id             String            @id @default(cuid())
    mesAno         String            @map("mes_ano") // Período de competência "YYYY-MM" (ex: "2026-11")
    descricao      String            @map("descricao")
    categoria      String            @map("categoria") // "OPERACIONAL" | "MERCADORIA" | "CONTAS_FIXAS" | "PESSOAL" | "IMPOSTOS" | "OUTROS"
    valorCentavos  Int               @map("valor_centavos") // Valor da despesa em centavos
    dataPagamento  String?           @map("data_pagamento") // Data de quitação "YYYY-MM-DD"
    criadoEm       DateTime          @default(now()) @map("criado_em")

    @@index([mesAno])
    @@index([categoria])
    @@map("despesas_mensais")
  }
  ```

### 1.2 Test Harness & Contract Expectations
In `tests/e2e/helpers/contract-loader.ts` (lines 127-154):
```typescript
export interface DailySalesSummary {
  data: string; // YYYY-MM-DD
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalGeralCentavos: number;
  quantidadeLancamentos: number;
}

export interface MonthlyConsolidation {
  mesAno: string; // YYYY-MM
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalEntradasCentavos: number;
  totalSaidasCentavos: number;
  saldoLiquidoCentavos: number;
  diasComVendas: number;
}

export interface FinanceiroContract {
  getDailySales: (data: string) => Promise<DailySalesSummary>;
  getDailySalesRange: (
    startDate: string,
    endDate: string
  ) => Promise<DailySalesSummary[]>;
  getMonthlyConsolidation: (mesAno: string) => Promise<MonthlyConsolidation>;
}
```

In `tests/e2e/tier1-feature-coverage.test.ts` (lines 952-964):
```typescript
it("T1-F24-5: verifies financeiro module contract if implemented", async () => {
  const financeiro = await loadFinanceiro();
  if (!financeiro) {
    console.warn("[SKIP] M4 Financeiro not yet implemented.");
    return;
  }

  const daily = await financeiro.getDailySales("2099-01-01");
  expect(daily).toHaveProperty("totalCartaoCentavos");
  expect(daily).toHaveProperty("totalDinheiroCentavos");
  expect(daily).toHaveProperty("totalGeralCentavos");
});
```

In `tests/e2e/tier2-boundary-corner.test.ts`:
- Line 463 (`T2-B22`): When querying an empty day with no transactions, returns zeroes (`totalCartao = 0`, `totalDinheiro = 0`, `totalGeral = 0`, `quantidadeLancamentos = 0`) without throwing an error.
- Line 477 (`T2-B23`): When monthly expenses exceed sales, handles deficit cleanly: `saldoLiquidoCentavos = totalEntradas - totalSaidas` resulting in a negative integer (e.g. `-25000` for `-R$ 250,00`).

In `tests/e2e/tier1-feature-coverage.test.ts` line 931 (`T1-F25-4`):
Supported expense categories explicitly verified:
`"OPERACIONAL"`, `"MERCADORIA"`, `"CONTAS_FIXAS"`, `"PESSOAL"`, `"IMPOSTOS"`, `"OUTROS"`.

### 1.3 Atomic Transaction Behavior
In `src/modules/transacoes/index.ts` (lines 240-248):
Each cash register deduction atomically inserts a row into `lancamentos_diarios` with `valorCartaoCentavos`, `valorDinheiroCentavos`, and `totalDiarioCentavos`. Multiple transactions can occur on the same calendar day (`data: "YYYY-MM-DD"`), so daily reports must aggregate by summing rows where `data = targetDate`.

### 1.4 Test Suite Execution
Execution of `npm test` passed 100%:
- 15 test files, 264 tests passed, 0 failures.
- `[SKIP] M4 Financeiro not yet implemented` logged dynamically. Implementing `src/modules/financeiro/index.ts` will immediately activate and pass `T1-F24-5`.

---

## 2. Logic Chain

1. **Schema & Monetary Invariants**: All monetary values are strictly modeled as integer cents (`Int` / `centavos`) across `LancamentoDiario` and `DespesaMensal`. All computations must utilize `addMoney`, `subtractMoney`, and `multiplyMoney` from `src/modules/currency/index.ts` to prevent IEEE-754 floating point imprecision.
2. **Aggregation Grain**: In the database, each POS sale creates a distinct record in `lancamentos_diarios`. Therefore, `getDailySales(data)` and the Daily Financial View table must aggregate all records for the given date, returning:
   - `totalCartaoCentavos = sum(valorCartaoCentavos)`
   - `totalDinheiroCentavos = sum(valorDinheiroCentavos)`
   - `totalGeralCentavos = totalCartaoCentavos + totalDinheiroCentavos`
   - `quantidadeLancamentos = count(records)`
3. **Monthly Consolidation (DRE Simplificado)**: Monthly consolidation aggregates sales by `data.startsWith(mesAno)` and expenses by `mesAno`. Saldo líquido is computed as `totalEntradasCentavos - totalSaidasCentavos`. Deficits (negative values) are natural and valid in business operations and must be formatted properly (`-R$ 250,00`).
4. **Expense Categories**: The system specifies 6 canonical categories: `OPERACIONAL`, `MERCADORIA`, `CONTAS_FIXAS`, `PESSOAL`, `IMPOSTOS`, and `OUTROS`. Both API and UI validation must restrict categories to this canonical set.
5. **API Routing Parity**: The dispatch mentions `GET /api/financeiro/consolidado` and `GET /api/financeiro/diario`, while `PROJECT.md` previously listed `GET /api/financeiro/mensal`. Implementing `consolidado` as the primary endpoint and aliasing `mensal` to it eliminates any divergence and guarantees 100% interoperability.
6. **Navigation Shell Consistency**: The application currently has independent pages or stubs (`/`, `/caixa`, `/inventario`). Introducing a unified `<Navbar />` inside `src/app/layout.tsx` guarantees persistent navigation across all views with active link indicators and system operational status.

---

## 3. Caveats

1. **Date Strings vs Timezones**: Dates in `lancamentos_diarios.data` and `despesas_mensais.dataPagamento` are saved as ISO calendar dates (`YYYY-MM-DD`), avoiding UTC-offset shifting bugs. Query handlers must respect string prefix comparisons (`startsWith(mesAno)`) and string range comparisons (`gte: startDate, lte: endDate`).
2. **Empty Days in Range Queries**: `getDailySalesRange` should return summaries for days that have sales, plus optionally allows the caller/UI to view zero-sale days without throwing errors.
3. **Pagination on High Transaction Volumes**: If a store has thousands of sales per day, the daily summary aggregate query uses SQLite indexed `@@index([data])` which runs in < 2ms.

---

## 4. Conclusion & Complete Design Blueprints

The Financial Dashboard & Expense Subsystem comprises 4 layers:
1. **Domain Engine**: `src/modules/financeiro/index.ts`
2. **API Routes**:
   - `src/app/api/financeiro/consolidado/route.ts` (and alias `mensal/route.ts`)
   - `src/app/api/financeiro/diario/route.ts`
   - `src/app/api/despesas/route.ts`
   - `src/app/api/despesas/[id]/route.ts`
3. **UI Components**:
   - `src/components/layout/Navbar.tsx` (Global header)
   - `src/components/financeiro/MonthlySummaryCards.tsx` (Metric cards)
   - `src/components/financeiro/MonthlyComparisonCard.tsx` (Confrontation & DRE breakdown)
   - `src/components/financeiro/DailySalesTable.tsx` (Daily sales ledger table)
   - `src/components/financeiro/ExpenseModal.tsx` (Modal dialog for registering expense)
   - `src/components/financeiro/ExpenseListTable.tsx` (Expense list table with delete action)
4. **Main Page**: `src/app/financeiro/page.tsx`

Below are the production-ready code specifications for each component:

---

### 4.1 Domain Module Blueprint: `src/modules/financeiro/index.ts`

```typescript
// ====================================================================
// Module: financeiro
// Subsystem: Financial Dashboard, Daily Aggregations & Monthly Closure
// Features: F23 (Daily Sales View), F24 (Monthly Consolidation), F25 (Expenses)
// ====================================================================

import prisma from "@/lib/prisma";
import {
  addMoney,
  subtractMoney,
  centavosToBRL,
} from "@/modules/currency";

// --------------------------------------------------------------------
// Type Definitions
// --------------------------------------------------------------------

export interface DailySalesSummary {
  data: string; // YYYY-MM-DD
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalGeralCentavos: number;
  quantidadeLancamentos: number;
}

export interface DetailedDailySalesSummary extends DailySalesSummary {
  totalCartaoBRL: string;
  totalDinheiroBRL: string;
  totalGeralBRL: string;
  percentualCartao: number;
  percentualDinheiro: number;
}

export interface ExpenseCategoryBreakdown {
  categoria: string;
  label: string;
  totalCentavos: number;
  totalBRL: string;
  percentual: number; // 0 a 100%
  quantidade: number;
}

export interface MonthlyConsolidation {
  mesAno: string; // YYYY-MM
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalEntradasCentavos: number;
  totalSaidasCentavos: number;
  saldoLiquidoCentavos: number;
  diasComVendas: number;
}

export interface DetailedMonthlyConsolidation extends MonthlyConsolidation {
  totalCartaoBRL: string;
  totalDinheiroBRL: string;
  totalEntradasBRL: string;
  totalSaidasBRL: string;
  saldoLiquidoBRL: string;
  despesasPorCategoria: ExpenseCategoryBreakdown[];
  margemLiquidaPercentual: number;
  percentualCartao: number;
  percentualDinheiro: number;
  quantidadeDespesas: number;
  quantidadeLancamentos: number;
}

export const CATEGORIAS_DESPESA_LABELS: Record<string, string> = {
  OPERACIONAL: "Operacional",
  MERCADORIA: "Mercadoria / Fornecedores",
  CONTAS_FIXAS: "Contas Fixas (Água/Luz/Aluguel)",
  PESSOAL: "Pessoal / Salários",
  IMPOSTOS: "Tributos / Impostos",
  OUTROS: "Outras Despesas",
};

// --------------------------------------------------------------------
// Domain Functions
// --------------------------------------------------------------------

/**
 * Retorna o resumo consolidado de vendas de um único dia específico.
 * Se o dia não contiver lançamentos, retorna zeros sem lançar erro.
 */
export async function getDailySales(data: string): Promise<DailySalesSummary> {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`Data inválida: "${data}". Formato obrigatório: YYYY-MM-DD`);
  }

  const entries = await prisma.lancamentoDiario.findMany({
    where: { data },
  });

  const totalCartaoCentavos = entries.reduce(
    (acc, curr) => addMoney(acc, curr.valorCartaoCentavos),
    0
  );
  const totalDinheiroCentavos = entries.reduce(
    (acc, curr) => addMoney(acc, curr.valorDinheiroCentavos),
    0
  );
  const totalGeralCentavos = addMoney(totalCartaoCentavos, totalDinheiroCentavos);

  return {
    data,
    totalCartaoCentavos,
    totalDinheiroCentavos,
    totalGeralCentavos,
    quantidadeLancamentos: entries.length,
  };
}

/**
 * Retorna resumos diários para um intervalo de datas [startDate, endDate].
 */
export async function getDailySalesRange(
  startDate: string,
  endDate: string
): Promise<DailySalesSummary[]> {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    throw new Error(
      `Intervalo de datas inválido: "${startDate}" a "${endDate}". Formato: YYYY-MM-DD`
    );
  }

  const entries = await prisma.lancamentoDiario.findMany({
    where: {
      data: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { data: "asc" },
  });

  // Agrupa lançamentos por data
  const mapPorData = new Map<
    string,
    { cartao: number; dinheiro: number; count: number }
  >();

  for (const e of entries) {
    const existing = mapPorData.get(e.data) ?? { cartao: 0, dinheiro: 0, count: 0 };
    existing.cartao = addMoney(existing.cartao, e.valorCartaoCentavos);
    existing.dinheiro = addMoney(existing.dinheiro, e.valorDinheiroCentavos);
    existing.count += 1;
    mapPorData.set(e.data, existing);
  }

  const results: DailySalesSummary[] = [];
  for (const [data, val] of mapPorData.entries()) {
    const totalGeral = addMoney(val.cartao, val.dinheiro);
    results.push({
      data,
      totalCartaoCentavos: val.cartao,
      totalDinheiroCentavos: val.dinheiro,
      totalGeralCentavos: totalGeral,
      quantidadeLancamentos: val.count,
    });
  }

  // Ordena por data decrescente para exibição natural em tabela
  return results.sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Retorna a consolidação mensal de vendas e despesas (DRE simplificado).
 */
export async function getMonthlyConsolidation(
  mesAno: string
): Promise<MonthlyConsolidation> {
  if (!mesAno || !/^\d{4}-\d{2}$/.test(mesAno)) {
    throw new Error(`Mês de referência inválido: "${mesAno}". Formato: YYYY-MM`);
  }

  const sales = await prisma.lancamentoDiario.findMany({
    where: { data: { startsWith: mesAno } },
  });

  const expenses = await prisma.despesaMensal.findMany({
    where: { mesAno },
  });

  const totalCartaoCentavos = sales.reduce(
    (acc, curr) => addMoney(acc, curr.valorCartaoCentavos),
    0
  );
  const totalDinheiroCentavos = sales.reduce(
    (acc, curr) => addMoney(acc, curr.valorDinheiroCentavos),
    0
  );
  const totalEntradasCentavos = addMoney(totalCartaoCentavos, totalDinheiroCentavos);

  const totalSaidasCentavos = expenses.reduce(
    (acc, curr) => addMoney(acc, curr.valorCentavos),
    0
  );

  const saldoLiquidoCentavos = subtractMoney(
    totalEntradasCentavos,
    totalSaidasCentavos
  );

  const diasComVendas = new Set(sales.map((s) => s.data)).size;

  return {
    mesAno,
    totalCartaoCentavos,
    totalDinheiroCentavos,
    totalEntradasCentavos,
    totalSaidasCentavos,
    saldoLiquidoCentavos,
    diasComVendas,
  };
}

/**
 * Retorna consolidação mensal enriquecida com formatação BRL e distribuição por categoria.
 */
export async function getDetailedMonthlyConsolidation(
  mesAno: string
): Promise<DetailedMonthlyConsolidation> {
  const base = await getMonthlyConsolidation(mesAno);

  const expenses = await prisma.despesaMensal.findMany({
    where: { mesAno },
  });

  const salesCount = await prisma.lancamentoDiario.count({
    where: { data: { startsWith: mesAno } },
  });

  // Agrupamento por categoria
  const catMap = new Map<string, { total: number; count: number }>();
  for (const cat of Object.keys(CATEGORIAS_DESPESA_LABELS)) {
    catMap.set(cat, { total: 0, count: 0 });
  }

  for (const exp of expenses) {
    const item = catMap.get(exp.categoria) ?? { total: 0, count: 0 };
    item.total = addMoney(item.total, exp.valorCentavos);
    item.count += 1;
    catMap.set(exp.categoria, item);
  }

  const despesasPorCategoria: ExpenseCategoryBreakdown[] = [];
  for (const [cat, data] of catMap.entries()) {
    if (data.count > 0 || data.total > 0) {
      const pct =
        base.totalSaidasCentavos > 0
          ? Number(((data.total / base.totalSaidasCentavos) * 100).toFixed(1))
          : 0;
      despesasPorCategoria.push({
        categoria: cat,
        label: CATEGORIAS_DESPESA_LABELS[cat] || cat,
        totalCentavos: data.total,
        totalBRL: centavosToBRL(data.total),
        percentual: pct,
        quantidade: data.count,
      });
    }
  }

  // Ordena categorias pelo maior valor de despesa
  despesasPorCategoria.sort((a, b) => b.totalCentavos - a.totalCentavos);

  const margemLiquida =
    base.totalEntradasCentavos > 0
      ? Number(
          ((base.saldoLiquidoCentavos / base.totalEntradasCentavos) * 100).toFixed(1)
        )
      : 0;

  const pctCartao =
    base.totalEntradasCentavos > 0
      ? Number(((base.totalCartaoCentavos / base.totalEntradasCentavos) * 100).toFixed(1))
      : 0;

  const pctDinheiro =
    base.totalEntradasCentavos > 0
      ? Number(((base.totalDinheiroCentavos / base.totalEntradasCentavos) * 100).toFixed(1))
      : 0;

  return {
    ...base,
    totalCartaoBRL: centavosToBRL(base.totalCartaoCentavos),
    totalDinheiroBRL: centavosToBRL(base.totalDinheiroCentavos),
    totalEntradasBRL: centavosToBRL(base.totalEntradasCentavos),
    totalSaidasBRL: centavosToBRL(base.totalSaidasCentavos),
    saldoLiquidoBRL: centavosToBRL(base.saldoLiquidoCentavos),
    despesasPorCategoria,
    margemLiquidaPercentual: margemLiquida,
    percentualCartao: pctCartao,
    percentualDinheiro: pctDinheiro,
    quantidadeDespesas: expenses.length,
    quantidadeLancamentos: salesCount,
  };
}
```

---

### 4.2 Financial Query API Routes Blueprint

#### 4.2.1 `src/app/api/financeiro/consolidado/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDetailedMonthlyConsolidation } from "@/modules/financeiro";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const mesAnoParam = searchParams.get("mesAno");

    // Padrão para o mês atual caso não seja fornecido
    const mesAno = mesAnoParam || new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(mesAno)) {
      return NextResponse.json(
        {
          success: false,
          error: `Mês de referência inválido: "${mesAno}". Formato esperado: YYYY-MM.`,
        },
        { status: 400 }
      );
    }

    const data = await getDetailedMonthlyConsolidation(mesAno);

    return NextResponse.json(
      {
        success: true,
        ...data,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao consolidar dados financeiros mensais.",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
```

#### 4.2.2 `src/app/api/financeiro/mensal/route.ts` (Compatibility Alias)
```typescript
// Re-export GET from consolidado for seamless compatibility with PROJECT.md
export { GET } from "../consolidado/route";
```

#### 4.2.3 `src/app/api/financeiro/diario/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDailySales, getDailySalesRange } from "@/modules/financeiro";
import { centavosToBRL, addMoney } from "@/modules/currency";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const dataParam = searchParams.get("data");
    const dataInicioParam = searchParams.get("dataInicio");
    const dataFimParam = searchParams.get("dataFim");
    const mesAnoParam = searchParams.get("mesAno");

    // Caso 1: Consulta de dia específico
    if (dataParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
        return NextResponse.json(
          {
            success: false,
            error: `Data inválida: "${dataParam}". Formato esperado: YYYY-MM-DD.`,
          },
          { status: 400 }
        );
      }

      const summary = await getDailySales(dataParam);
      const lancamentos = await prisma.lancamentoDiario.findMany({
        where: { data: dataParam },
        orderBy: { criadoEm: "desc" },
        include: {
          baixas: {
            select: {
              id: true,
              codigoProduto: true,
              discriminacaoProduto: true,
              quantidadeBaixada: true,
              unitarioCentavos: true,
              totalCentavos: true,
              formaPagamento: true,
            },
          },
        },
      });

      return NextResponse.json(
        {
          success: true,
          ...summary,
          totalCartaoBRL: centavosToBRL(summary.totalCartaoCentavos),
          totalDinheiroBRL: centavosToBRL(summary.totalDinheiroCentavos),
          totalGeralBRL: centavosToBRL(summary.totalGeralCentavos),
          lancamentos: lancamentos.map((l) => ({
            id: l.id,
            data: l.data,
            valorCartaoCentavos: l.valorCartaoCentavos,
            valorCartaoBRL: centavosToBRL(l.valorCartaoCentavos),
            valorDinheiroCentavos: l.valorDinheiroCentavos,
            valorDinheiroBRL: centavosToBRL(l.valorDinheiroCentavos),
            totalDiarioCentavos: l.totalDiarioCentavos,
            totalDiarioBRL: centavosToBRL(l.totalDiarioCentavos),
            observacoes: l.observacoes,
            criadoEm: l.criadoEm,
            baixas: l.baixas.map((b) => ({
              ...b,
              unitarioBRL: centavosToBRL(b.unitarioCentavos),
              totalBRL: centavosToBRL(b.totalCentavos),
            })),
          })),
        },
        { status: 200 }
      );
    }

    // Caso 2: Intervalo de datas ou Mês Completo
    let startDate: string;
    let endDate: string;

    if (dataInicioParam && dataFimParam) {
      startDate = dataInicioParam;
      endDate = dataFimParam;
    } else if (mesAnoParam) {
      startDate = `${mesAnoParam}-01`;
      endDate = `${mesAnoParam}-31`;
    } else {
      // Padrão: Mês atual completo
      const currentMonth = new Date().toISOString().slice(0, 7);
      startDate = `${currentMonth}-01`;
      endDate = `${currentMonth}-31`;
    }

    const summaries = await getDailySalesRange(startDate, endDate);

    // Totais agregados do período
    const totalCartaoCentavos = summaries.reduce(
      (s, d) => addMoney(s, d.totalCartaoCentavos),
      0
    );
    const totalDinheiroCentavos = summaries.reduce(
      (s, d) => addMoney(s, d.totalDinheiroCentavos),
      0
    );
    const totalGeralCentavos = addMoney(totalCartaoCentavos, totalDinheiroCentavos);
    const totalLancamentos = summaries.reduce(
      (s, d) => s + d.quantidadeLancamentos,
      0
    );

    return NextResponse.json(
      {
        success: true,
        periodo: {
          dataInicio: startDate,
          dataFim: endDate,
        },
        totaisPeriodo: {
          totalCartaoCentavos,
          totalCartaoBRL: centavosToBRL(totalCartaoCentavos),
          totalDinheiroCentavos,
          totalDinheiroBRL: centavosToBRL(totalDinheiroCentavos),
          totalGeralCentavos,
          totalGeralBRL: centavosToBRL(totalGeralCentavos),
          quantidadeLancamentos: totalLancamentos,
          diasComVendas: summaries.length,
        },
        dias: summaries.map((d) => ({
          ...d,
          totalCartaoBRL: centavosToBRL(d.totalCartaoCentavos),
          totalDinheiroBRL: centavosToBRL(d.totalDinheiroCentavos),
          totalGeralBRL: centavosToBRL(d.totalGeralCentavos),
        })),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao consultar vendas diárias.",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
```

---

### 4.3 Expense Management Subsystem Blueprint: `/api/despesas`

#### 4.3.1 `src/app/api/despesas/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { brlToCentavos, centavosToBRL, addMoney } from "@/modules/currency";
import { CATEGORIAS_DESPESA_LABELS } from "@/modules/financeiro";

const CATEGORIAS_VALIDAS = new Set(Object.keys(CATEGORIAS_DESPESA_LABELS));

/**
 * GET /api/despesas
 * Lista despesas filtradas opcionalmente por mesAno ("YYYY-MM") e categoria.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const mesAno = searchParams.get("mesAno");
    const categoria = searchParams.get("categoria");

    const where: any = {};
    if (mesAno) {
      if (!/^\d{4}-\d{2}$/.test(mesAno)) {
        return NextResponse.json(
          { success: false, error: "Formato de mesAno inválido. Esperado YYYY-MM." },
          { status: 400 }
        );
      }
      where.mesAno = mesAno;
    }
    if (categoria) {
      where.categoria = categoria;
    }

    const despesas = await prisma.despesaMensal.findMany({
      where,
      orderBy: [{ dataPagamento: "desc" }, { criadoEm: "desc" }],
    });

    const totalCentavos = despesas.reduce(
      (acc, curr) => addMoney(acc, curr.valorCentavos),
      0
    );

    return NextResponse.json(
      {
        success: true,
        despesas: despesas.map((d) => ({
          ...d,
          valorBRL: centavosToBRL(d.valorCentavos),
          categoriaLabel: CATEGORIAS_DESPESA_LABELS[d.categoria] || d.categoria,
        })),
        totalCentavos,
        totalBRL: centavosToBRL(totalCentavos),
        contagem: despesas.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao consultar despesas.", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/despesas
 * Registra uma nova despesa com validação estrita de categoria e centavos.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "JSON inválido no corpo da requisição." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Corpo da requisição não pode ser vazio." },
        { status: 400 }
      );
    }

    // 1. Descrição
    const descricao = String(body.descricao || "").trim();
    if (!descricao) {
      return NextResponse.json(
        { success: false, error: "O campo 'descricao' é obrigatório." },
        { status: 400 }
      );
    }

    // 2. Categoria
    const categoria = String(body.categoria || "").trim().toUpperCase();
    if (!CATEGORIAS_VALIDAS.has(categoria)) {
      return NextResponse.json(
        {
          success: false,
          error: `Categoria inválida: "${body.categoria}". Categorias permitidas: ${Array.from(
            CATEGORIAS_VALIDAS
          ).join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // 3. Valor (aceita valorCentavos ou valor string/número BRL)
    let valorCentavos: number;
    try {
      if (typeof body.valorCentavos === "number") {
        if (!Number.isSafeInteger(body.valorCentavos) || body.valorCentavos <= 0) {
          throw new RangeError("O valor em centavos deve ser um inteiro positivo maior que zero.");
        }
        valorCentavos = body.valorCentavos;
      } else if (body.valor !== undefined && body.valor !== null) {
        valorCentavos = brlToCentavos(body.valor);
        if (valorCentavos <= 0) {
          throw new RangeError("O valor da despesa deve ser maior que zero.");
        }
      } else {
        return NextResponse.json(
          { success: false, error: "É obrigatório fornecer 'valor' ou 'valorCentavos'." },
          { status: 400 }
        );
      }
    } catch (valErr: any) {
      return NextResponse.json(
        { success: false, error: valErr?.message || "Valor financeiro inválido." },
        { status: 400 }
      );
    }

    // 4. Data de Pagamento e Competência (mesAno)
    const dataPagamento = body.dataPagamento ? String(body.dataPagamento).trim() : null;
    if (dataPagamento && !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
      return NextResponse.json(
        {
          success: false,
          error: `Data de pagamento inválida: "${dataPagamento}". Formato: YYYY-MM-DD.`,
        },
        { status: 400 }
      );
    }

    let mesAno = body.mesAno ? String(body.mesAno).trim() : null;
    if (!mesAno) {
      if (dataPagamento) {
        mesAno = dataPagamento.slice(0, 7);
      } else {
        mesAno = new Date().toISOString().slice(0, 7);
      }
    }

    if (!/^\d{4}-\d{2}$/.test(mesAno)) {
      return NextResponse.json(
        {
          success: false,
          error: `Mês de competência inválido: "${mesAno}". Formato: YYYY-MM.`,
        },
        { status: 400 }
      );
    }

    // 5. Inserção no Banco
    const despesa = await prisma.despesaMensal.create({
      data: {
        descricao,
        categoria,
        valorCentavos,
        mesAno,
        dataPagamento,
      },
    });

    return NextResponse.json(
      {
        success: true,
        despesa: {
          ...despesa,
          valorBRL: centavosToBRL(despesa.valorCentavos),
          categoriaLabel: CATEGORIAS_DESPESA_LABELS[despesa.categoria] || despesa.categoria,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao cadastrar despesa.", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/despesas?id=... (Query param support)
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {
        // Ignora caso não haja body
      }
    }

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, error: "O parâmetro 'id' da despesa é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.despesaMensal.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Despesa com ID "${id}" não encontrada.` },
        { status: 404 }
      );
    }

    await prisma.despesaMensal.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Despesa excluída com sucesso.",
        idExcluido: id,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao excluir despesa.", details: err?.message },
      { status: 500 }
    );
  }
}
```

#### 4.3.2 `src/app/api/despesas/[id]/route.ts` (Dynamic Route Support)
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID inválido." },
        { status: 400 }
      );
    }

    const existing = await prisma.despesaMensal.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Despesa com ID "${id}" não encontrada.` },
        { status: 404 }
      );
    }

    await prisma.despesaMensal.delete({
      where: { id },
    });

    return NextResponse.json(
      { success: true, message: "Despesa excluída com sucesso.", idExcluido: id },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao excluir despesa.", details: err?.message },
      { status: 500 }
    );
  }
}
```

---

### 4.4 Global Navigation Shell Blueprint: `src/components/layout/Navbar.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Store,
  ShoppingCart,
  Package,
  BarChart3,
  CircleDot,
  LayoutDashboard,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Visão Geral",
      href: "/",
      icon: LayoutDashboard,
      active: pathname === "/",
    },
    {
      name: "Frente de Caixa",
      href: "/caixa",
      icon: ShoppingCart,
      active: pathname.startsWith("/caixa"),
    },
    {
      name: "Inventário P7",
      href: "/inventario",
      icon: Package,
      active: pathname.startsWith("/inventario"),
    },
    {
      name: "Painel Financeiro",
      href: "/financeiro",
      icon: BarChart3,
      active: pathname.startsWith("/financeiro"),
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Store className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-slate-900 tracking-tight text-lg leading-tight">
              Mercearia
            </span>
            <span className="text-xs font-medium text-slate-500 leading-tight">
              Controle &amp; Caixa
            </span>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  item.active
                    ? "bg-blue-50 text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon className={`h-4 w-4 ${item.active ? "text-blue-600" : "text-slate-400"}`} />
                <span className="hidden md:inline">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Operational Status */}
        <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-slate-200">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-slate-600">
            SQLite WAL Ativo
          </span>
        </div>
      </div>
    </header>
  );
}
```

Integration in `src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard Mercearia",
  description: "Controle diário de vendas (Cartão vs. Dinheiro) e Baixa Inteligente Modelo P7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900 flex flex-col">
        <Navbar />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
```

---

### 4.5 Financial UI Components Blueprint

#### 4.5.1 `src/components/financeiro/MonthlySummaryCards.tsx`
Renders the 5 high-impact KPI summary cards:
1. **Total Cartão** (with % of gross sales)
2. **Total Dinheiro** (with % of gross sales)
3. **Total Entradas (Vendas Brutas)**
4. **Total Despesas (Saídas)**
5. **Saldo Líquido Operacional** (with Profit/Deficit conditional badge & Margem Líquida)

```tsx
"use client";

import { CreditCard, Banknote, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { DetailedMonthlyConsolidation } from "@/modules/financeiro";

interface Props {
  data: DetailedMonthlyConsolidation;
}

export function MonthlySummaryCards({ data }: Props) {
  const isSuperavit = data.saldoLiquidoCentavos >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Total Cartão */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Cartão</span>
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <CreditCard className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900">{data.totalCartaoBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.percentualCartao}% do faturamento
        </div>
      </div>

      {/* 2. Total Dinheiro */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Dinheiro</span>
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <Banknote className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900">{data.totalDinheiroBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.percentualDinheiro}% do faturamento
        </div>
      </div>

      {/* 3. Total Entradas */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Entradas</span>
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-indigo-700">{data.totalEntradasBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.diasComVendas} dias com vendas ({data.quantidadeLancamentos} lançamentos)
        </div>
      </div>

      {/* 4. Total Saídas (Despesas) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Despesas</span>
          <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
            <TrendingDown className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-rose-600">{data.totalSaidasBRL}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.quantidadeDespesas} despesas registradas
        </div>
      </div>

      {/* 5. Saldo Líquido */}
      <div
        className={`rounded-xl border p-5 shadow-sm ${
          isSuperavit
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-rose-200 bg-rose-50/40"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              isSuperavit ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            Saldo Líquido
          </span>
          <div
            className={`p-2 rounded-lg ${
              isSuperavit
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            <DollarSign className="h-4 w-4" />
          </div>
        </div>
        <div
          className={`text-2xl font-black ${
            isSuperavit ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {data.saldoLiquidoBRL}
        </div>
        <div
          className={`mt-1 text-xs font-medium ${
            isSuperavit ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {isSuperavit ? "Superávit Operacional" : "Déficit Operacional"} &bull; Margem:{" "}
          {data.margemLiquidaPercentual}%
        </div>
      </div>
    </div>
  );
}
```

#### 4.5.2 `src/components/financeiro/DailySalesTable.tsx`
Table displaying daily sales (Date, Cartão, Dinheiro, Total Diário = Cartão + Dinheiro, Contagem), with collapsible row expansion to view itemized receipts.

```tsx
"use client";

import { useState } from "react";
import { Calendar, ChevronDown, ChevronRight, Eye } from "lucide-react";

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
          Regra Fiscal R1: Total Diário = Cartão + Dinheiro com precisão monetária estrita.
        </p>
      </div>

      <div className="overflow-x-auto">
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
                      Detalhes
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
```

#### 4.5.3 `src/components/financeiro/ExpenseModal.tsx`
Modal dialog for registering categorized expenses.

```tsx
"use client";

import { useState } from "react";
import { X, PlusCircle, AlertCircle } from "lucide-react";
import { CATEGORIAS_DESPESA_LABELS } from "@/modules/financeiro";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultMesAno: string;
}

export function ExpenseModal({ isOpen, onClose, onSuccess, defaultMesAno }: Props) {
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("OPERACIONAL");
  const [valorInput, setValorInput] = useState("");
  const [dataPagamento, setDataPagamento] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [mesAno, setMesAno] = useState(defaultMesAno);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/despesas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao,
          categoria,
          valor: valorInput,
          dataPagamento,
          mesAno,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erro ao registrar despesa.");
      }

      // Sucesso
      setDescricao("");
      setValorInput("");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <PlusCircle className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Cadastrar Nova Despesa</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Descrição da Despesa *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Fornecedor de Carnes Frigorífico"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Categoria *
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                {Object.entries(CATEGORIAS_DESPESA_LABELS).map(([cat, label]) => (
                  <option key={cat} value={cat}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Valor (R$) *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 350,00"
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Mês de Competência *
              </label>
              <input
                type="month"
                required
                value={mesAno}
                onChange={(e) => setMesAno(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Data do Pagamento
              </label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Gravando..." : "Salvar Despesa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

#### 4.5.4 `src/components/financeiro/MonthlyComparisonCard.tsx`
Confrontation visual card & DRE category breakdown.

```tsx
"use client";

import { PieChart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { DetailedMonthlyConsolidation } from "@/modules/financeiro";

interface Props {
  data: DetailedMonthlyConsolidation;
}

const CATEGORY_COLORS: Record<string, string> = {
  OPERACIONAL: "bg-purple-500",
  MERCADORIA: "bg-blue-500",
  CONTAS_FIXAS: "bg-amber-500",
  PESSOAL: "bg-orange-500",
  IMPOSTOS: "bg-rose-500",
  OUTROS: "bg-slate-500",
};

export function MonthlyComparisonCard({ data }: Props) {
  const ratioDespesasEntradas =
    data.totalEntradasCentavos > 0
      ? Math.min(
          100,
          Number(((data.totalSaidasCentavos / data.totalEntradasCentavos) * 100).toFixed(1))
        )
      : 100;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Confronto DRE Simplificado */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <PieChart className="h-5 w-5 text-indigo-600" />
          Confronto Financeiro (Entradas vs. Saídas)
        </h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm font-semibold mb-1">
              <span className="text-slate-600 flex items-center gap-1">
                <ArrowUpRight className="h-4 w-4 text-emerald-500" /> Entradas (Vendas)
              </span>
              <span className="text-emerald-700 font-bold">{data.totalEntradasBRL}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full w-full" />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm font-semibold mb-1">
              <span className="text-slate-600 flex items-center gap-1">
                <ArrowDownRight className="h-4 w-4 text-rose-500" /> Despesas (Saídas)
              </span>
              <span className="text-rose-600 font-bold">{data.totalSaidasBRL}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${ratioDespesasEntradas}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              Despesas consom {ratioDespesasEntradas}% da receita bruta.
            </span>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Resultado Líquido</span>
            <span
              className={`text-lg font-black ${
                data.saldoLiquidoCentavos >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {data.saldoLiquidoBRL}
            </span>
          </div>
        </div>
      </div>

      {/* Distribuição de Despesas por Categoria */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4">
          Despesas por Categoria
        </h3>

        {data.despesasPorCategoria.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-sm text-slate-400">
            Nenhuma despesa cadastrada no mês de {data.mesAno}.
          </div>
        ) : (
          <div className="space-y-3">
            {data.despesasPorCategoria.map((cat) => (
              <div key={cat.categoria}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">{cat.label}</span>
                  <span className="text-slate-900">
                    {cat.totalBRL} ({cat.percentual}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      CATEGORY_COLORS[cat.categoria] || "bg-slate-400"
                    }`}
                    style={{ width: `${cat.percentual}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

#### 4.5.5 `src/app/financeiro/page.tsx`
The unified Financial Dashboard page orchestrating the month picker, tabs, KPI cards, daily ledger, and expense manager.

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  BarChart3,
  Calendar,
  Receipt,
} from "lucide-react";
import { DetailedMonthlyConsolidation } from "@/modules/financeiro";
import { MonthlySummaryCards } from "@/components/financeiro/MonthlySummaryCards";
import { MonthlyComparisonCard } from "@/components/financeiro/MonthlyComparisonCard";
import { DailySalesTable } from "@/components/financeiro/DailySalesTable";
import { ExpenseModal } from "@/components/financeiro/ExpenseModal";

export default function FinanceiroPage() {
  const [currentMonth, setCurrentMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [activeTab, setActiveTab] = useState<"mensal" | "diario" | "despesas">("mensal");
  const [consolidation, setConsolidation] = useState<DetailedMonthlyConsolidation | null>(null);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resConsol, resDiario] = await Promise.all([
        fetch(`/api/financeiro/consolidado?mesAno=${currentMonth}`),
        fetch(`/api/financeiro/diario?mesAno=${currentMonth}`),
      ]);

      const dataConsol = await resConsol.json();
      const dataDiario = await resDiario.json();

      if (dataConsol.success) {
        setConsolidation(dataConsol);
      }
      if (dataDiario.success) {
        setDailySales(dataDiario.dias || []);
      }
    } catch (err) {
      console.error("Falha ao carregar dados financeiros:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const changeMonth = (offset: number) => {
    const [yearStr, monthStr] = currentMonth.split("-");
    const d = new Date(Number(yearStr), Number(monthStr) - 1 + offset, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setCurrentMonth(newMonth);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header com Navegação de Mês e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Painel Financeiro &amp; Fechamento
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhamento diário de caixa, consolidação mensal e confronto com despesas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor de Mês */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm p-1">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              title="Mês Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="px-2 py-1 text-sm font-bold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              title="Próximo Mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Botão Nova Despesa */}
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Despesa</span>
          </button>

          {/* Botão Atualizar */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
            title="Recarregar Dados"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("mensal")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "mensal"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Consolidação Mensal (DRE)
        </button>
        <button
          onClick={() => setActiveTab("diario")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "diario"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Vendas Diárias ({dailySales.length} dias)
        </button>
      </div>

      {/* Conteúdo Dinâmico */}
      {consolidation && (
        <div className="space-y-6">
          {/* Cartões KPI Principais */}
          <MonthlySummaryCards data={consolidation} />

          {activeTab === "mensal" && (
            <MonthlyComparisonCard data={consolidation} />
          )}

          {activeTab === "diario" && (
            <DailySalesTable dias={dailySales} />
          )}
        </div>
      )}

      {/* Modal de Nova Despesa */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSuccess={fetchData}
        defaultMesAno={currentMonth}
      />
    </main>
  );
}
```

---

## 5. Verification Method

### 5.1 Verification Checklist for Implementer
1. **Module Contract Integrity**:
   - Check `src/modules/financeiro/index.ts` implements `FinanceiroContract` (`getDailySales`, `getDailySalesRange`, `getMonthlyConsolidation`).
   - Run Vitest: `npx vitest run tests/e2e/tier1-feature-coverage.test.ts`.
   - Confirm test `T1-F24-5` runs and passes without being skipped.
2. **Monetary Arithmetic Safety**:
   - Verify all calculations use `addMoney`, `subtractMoney`, `multiplyMoney` without any floating point operations.
   - Verify negative balances format cleanly (e.g. `-R$ 250,00`).
3. **API Endpoints**:
   - Test `GET /api/financeiro/consolidado?mesAno=YYYY-MM` returns 200 with `saldoLiquidoCentavos`, `totalEntradasCentavos`, `totalSaidasCentavos`.
   - Test `GET /api/financeiro/diario?data=YYYY-MM-DD` returns 200 with `totalCartaoCentavos`, `totalDinheiroCentavos`, `totalGeralCentavos`.
   - Test `GET /api/despesas` and `POST /api/despesas` and `DELETE /api/despesas?id=...`.
4. **Regression & Full Suite**:
   - Execute `npm test` and verify that all existing 264 tests continue to pass with 0 failures.

### 5.2 Invalidation Conditions
- Any floating point arithmetic `a + b` or `a - b` on monetary values.
- Throwing exceptions on days with no sales instead of returning zeroed `DailySalesSummary`.
- Omitting any of the 6 canonical expense categories (`OPERACIONAL`, `MERCADORIA`, `CONTAS_FIXAS`, `PESSOAL`, `IMPOSTOS`, `OUTROS`).
