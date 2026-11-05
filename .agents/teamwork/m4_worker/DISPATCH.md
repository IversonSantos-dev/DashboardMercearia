## 2026-11-05T11:58:37Z

You are the Implementation Worker for Milestone 4: User Interface & Financial Dashboard.

## 🔒 Mandatory Instructions & Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

First, read:
1. `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md`
3. Explorer Handoff Reports containing full architectural blueprints:
   - `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_1\handoff.md` (POS Frente de Caixa & Deduction Modal)
   - `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_2\handoff.md` (Inventory Management UI & Products API)
   - `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_3\handoff.md` (Financial Dashboard, Monthly Closure & Expenses)

Your working directory: `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_worker`
Write your progress to `.agents/teamwork/m4_worker/progress.md` and your final report to `.agents/teamwork/m4_worker/handoff.md`.

## Exclusive File Ownership
You exclusively own and will implement/modify:
- `src/modules/financeiro/index.ts`
- `src/app/api/financeiro/consolidado/route.ts`
- `src/app/api/financeiro/mensal/route.ts`
- `src/app/api/financeiro/diario/route.ts`
- `src/app/api/despesas/route.ts`
- `src/app/api/despesas/[id]/route.ts`
- `src/app/api/inventario/produtos/route.ts`
- `src/components/layout/Navbar.tsx`
- `src/app/layout.tsx` (integrate Navbar)
- `src/app/page.tsx` (Dashboard home / quick links hub)
- `src/app/caixa/page.tsx` & `src/components/caixa/` (`types.ts`, `BaixaForm.tsx`, `SuggestionCard.tsx`, `PreviewModal.tsx`)
- `src/app/inventario/page.tsx` & `src/components/inventario/` (`FileUploader.tsx`, `DryRunPreview.tsx`, `StockTable.tsx`)
- `src/app/financeiro/page.tsx` & `src/components/financeiro/` (`MonthlySummaryCards.tsx`, `DailySalesTable.tsx`, `MonthlyComparisonCard.tsx`, `ExpenseModal.tsx`)
- Test suites:
  - `tests/unit/financeiro-module.test.ts`
  - `tests/integration/despesas-api.test.ts`
  - `tests/integration/financeiro-api.test.ts`
  - `tests/integration/inventario-produtos-api.test.ts`

## Key Implementation Guidelines
1. **Strict Monetary Precision**: All monetary operations must use `src/modules/currency/index.ts` (`addMoney`, `subtractMoney`, `multiplyMoney`, `centavosToBRL`, `brlToCentavos`).
2. **E2E Contract Compliance**: `src/modules/financeiro/index.ts` must implement `FinanceiroContract` (`getDailySales`, `getDailySalesRange`, `getMonthlyConsolidation`) as tested in `tests/e2e/helpers/contract-loader.ts`. Handle empty days gracefully (zeros, no throws) and negative net balances (`saldoLiquidoCentavos = totalEntradas - totalSaidas`).
3. **Canonical Expense Categories**: Must support `"OPERACIONAL"`, `"MERCADORIA"`, `"CONTAS_FIXAS"`, `"PESSOAL"`, `"IMPOSTOS"`, `"OUTROS"`.
4. **Interactive Deduction Preview Modal (F21 & R3)**: Must display Código, Barras, Discriminação, Quantidade a Debitar, Unitário (BRL), and Total do Item before confirmation. Atomic confirmation calls `POST /api/baixa/executar`.
5. **Dry Run & Commit Inventory (F18, F19)**: Drag & drop uploader, dry run preview with 6 metric cards, quarantine accordion, item table preview, and commit button triggering `POST /api/inventario/import`. Live stock catalog with search, filter, and pagination.
6. **Verification Steps**:
   - Run `npx tsc --noEmit` and fix any TypeScript issues.
   - Run `pnpm test` (ensure 100% of existing tests + new unit/integration tests pass).
   - Run `pnpm build` (verify all Next.js static and dynamic routes compile cleanly).
   - Clean up any test fixtures from SQLite `prisma/dev.db` so the database remains in pristine state.
7. Document commands executed, output logs, and test results in `.agents/teamwork/m4_worker/handoff.md` and message the orchestrator when complete.
