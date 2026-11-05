# Dispatch: M3 Implementation Worker

## Objectives
Implement the complete Intelligent Deduction Engine & Atomic Transaction Subsystem according to the specifications designed by M3 Explorers 1, 2, and 3.

## Exclusive Write Ownership
You own and may create/modify:
- `src/modules/baixa-inteligente/types.ts`
- `src/modules/baixa-inteligente/engine.ts`
- `src/modules/baixa-inteligente/index.ts`
- `src/modules/transacoes/index.ts`
- `src/app/api/baixa/sugestao/route.ts`
- `src/app/api/baixa/executar/route.ts`
- `src/app/api/baixa/historico/route.ts`
- `tests/unit/baixa-inteligente.test.ts`
- `tests/integration/baixa-transacao.test.ts`
- `tests/integration/baixa-api.test.ts`

## Mandate & Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Tasks

### 1. `src/modules/baixa-inteligente/`
- Implement `types.ts`, `engine.ts`, and `index.ts` per `.agents/teamwork/m3_explorer_1/handoff.md`.
- Ensure 5-tier evaluation:
  - Tier 1A: Exact Unit match (`q = 1`, `unitarioCentavos === valorAlvoCentavos`).
  - Tier 1B: Exact Multiple match (`q > 1`, `k * unitarioCentavos === valorAlvoCentavos`).
  - Tier 2: Exact Combinations (Two-Sum hash map & Three-Sum sorted two-pointer bounded by `< 2.0ms` circuit breaker).
  - Tier 3: Minimal Delta Proximity Match (`|sum - target|` minimized).
  - Tier 4: Assisted Interactive Catalog sorted by proximity to target.
- Use `addMoney`, `subtractMoney`, `multiplyMoney` from `@/modules/currency`.
- Filter strictly for `quantidade > 0` and `ativo !== false`.

### 2. `src/modules/transacoes/index.ts`
- Implement per `.agents/teamwork/m3_explorer_2/handoff.md`.
- `executeDeductionTransaction(params)` inside `prisma.$transaction`:
  - Validate parameters (payment method, ISO date, items).
  - Pre-aggregate item quantities to handle duplicate IDs safely.
  - Verify all products exist and are active with sufficient stock.
  - Atomic conditional update via `tx.produtoEstoque.updateMany`:
    `where: { id: prodId, quantidade: { gte: requiredQty }, ativo: true }`
    `data: { quantidade: { decrement: requiredQty }, totalCentavos: newTotalCentavos, ativo: newAtivo }`
    If `count === 0`, throw `ConcurrencyConflictError`.
  - Insert daily sales entry into `tx.lancamentoDiario.create` allocating total to `valorCartaoCentavos` or `valorDinheiroCentavos`, and `totalDiarioCentavos`.
  - Insert audit records into `tx.historicoBaixa.create` for each deducted item with frozen snapshot values (`codigoProduto`, `discriminacaoProduto`, `unitarioCentavos`).
- Implement helper queries: `getTransactionAuditTrail(lancamentoDiarioId)` and `getProductAuditHistory(produtoId)`.

### 3. API Routes in `src/app/api/baixa/`
- Implement per `.agents/teamwork/m3_explorer_3/handoff.md`:
  - `POST /api/baixa/sugestao`:
    - Accepts `valorAlvoCentavos` or `valorAlvoBRL`, `formaPagamento`, `data`.
    - Queries active inventory (`ativo: true, quantidade: { gt: 0 }`).
    - Invokes `findDeductionSuggestion` and returns formatted response.
  - `POST /api/baixa/executar`:
    - Accepts `itens`, `formaPagamento`, `data`, `observacoes`.
    - Calls `executeDeductionTransaction`.
    - Returns HTTP 200 on success, 400 on validation error, 404 on missing product, 409 on concurrency conflict, 422 on insufficient stock.
  - `GET /api/baixa/historico`:
    - Supports query parameters `data`, `formaPagamento`, `limit`, `offset`.
    - Returns paginated audit trail.

### 4. Test Suites
- Create `tests/unit/baixa-inteligente.test.ts` (unit tests covering all tiers and performance benchmark).
- Create `tests/integration/baixa-transacao.test.ts` (database integration verifying transaction atomicity, rollback, concurrency, daily ledger, and audit trail).
- Create `tests/integration/baixa-api.test.ts` (route integration testing HTTP status codes, payloads, error handling).

### 5. Verification Commands
Execute and document in your handoff report:
1. `npx tsc --noEmit`
2. `npx vitest run tests/unit/baixa-inteligente.test.ts`
3. `npx vitest run tests/integration/baixa-transacao.test.ts`
4. `npx vitest run tests/integration/baixa-api.test.ts`
5. `pnpm test --fileParallelism=false` (full workspace test run)
6. `pnpm build`
7. Ensure `dev.db` cleanliness.

Write your complete report to `.agents/teamwork/m3_worker/handoff.md`.


## 2026-11-05T02:39:45Z
You are M3 Implementation Worker.
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_worker
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_worker\DISPATCH.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_1\handoff.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_2\handoff.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_3\handoff.md

Implement the complete Intelligent Deduction Engine & Atomic Transaction Subsystem:
1. `src/modules/baixa-inteligente/` (`types.ts`, `engine.ts`, `index.ts`)
2. `src/modules/transacoes/index.ts`
3. `src/app/api/baixa/sugestao/route.ts`
4. `src/app/api/baixa/executar/route.ts`
5. `src/app/api/baixa/historico/route.ts`
6. `tests/unit/baixa-inteligente.test.ts`
7. `tests/integration/baixa-transacao.test.ts`
8. `tests/integration/baixa-api.test.ts`

Run all verification commands (tsc, vitest, pnpm test, pnpm build).
Ensure dev.db has 0 synthetic records remaining after testing.
Write your complete handoff report to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_worker\handoff.md.
When finished, send a message with your handoff path and summary.
