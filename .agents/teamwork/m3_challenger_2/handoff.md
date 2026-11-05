# Handoff Report — M3 Challenger 2: Concurrency, Race Condition & ACID Rollback

**Author**: M3 Challenger 2  
**Role**: critic, specialist  
**Date**: 2026-11-05T03:01:30Z  
**Verdict**: **APPROVE**  
**Location**: `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_challenger_2\handoff.md`  

---

## 1. Observation

Direct observations and verbatim test results during adversarial challenge execution:

### 1.1 Requirements & Attack Targets
- **`ORIGINAL_REQUEST.md` (R4, lines 26-30 & lines 46-49)**:
  - "Confirmação de baixa executada em transação atômica no banco de dados: decrementa a `Qtd` do produto no estoque (`Qtd = Qtd - Qtd_debitada`). Se a quantidade resultante for 0, marca o produto como sem estoque para impedir novas baixas."
  - "Operação de baixa é atômica: decrementa o estoque, bloqueia novas baixas caso o saldo zere e impede quantidade negativa."
  - "Baixa reflete instantaneamente nos lançamentos diários na coluna selecionada (Cartão ou Dinheiro)."
  - "Registro completo é gravado na tabela de histórico de auditoria com vínculo ao lançamento diário."
- **Target implementation**:
  - `src/modules/transacoes/index.ts`: `executeDeductionTransaction` lines 108-290.
  - `src/app/api/baixa/executar/route.ts`: POST endpoint lines 14-200.

### 1.2 Adversarial Test Suite Authored
Authored adversarial integration test suite at `tests/integration/baixa-adversarial-m3.test.ts` with 14 empirical challenge scenarios covering:
1. **High-concurrency race condition**:
   - `ADV-C1-01`: 10 parallel transactions competing for a product with quantity = 2.
   - `ADV-C1-02`: 15 parallel transactions competing for a product with quantity = 4 (each debiting 1).
   - `ADV-C1-03`: 6 parallel transactions competing for a product with quantity = 3 (each debiting 2).
2. **Partial debit failure & 100% atomic rollback**:
   - `ADV-C2-01`: Multi-item deduction where item #1 has sufficient stock (20 units) but item #2 has insufficient stock (requesting 10 with only 1 in stock).
   - `ADV-C2-02`: 3-item deduction where items #1 and #2 have stock but item #3 does not exist (`ProductNotFoundError`).
   - `ADV-C2-03`: Duplicate entries in `itens` array summing to more than available stock.
3. **Inactive item bypass attempts**:
   - `ADV-C3-01`: Rejection of product with `ativo = false` and `quantidade = 0`.
   - `ADV-C3-02`: Rejection of product with `ativo = false` even when physical `quantidade = 50 > 0` (administratively disabled product).
   - `ADV-C3-03`: Multi-item deduction containing one inactive item among active items.
4. **Financial ledger reconciliation**:
   - `ADV-C4-01`: Mixed transactions across multiple dates and payment methods (CARTAO & DINHEIRO), proving per-transaction parity and global batch equality ($R\$ 90,78$ in `lancamentos_diarios` $\equiv R\$ 90,78$ in `historico_baixas`).
5. **Input validation & boundary hardening**:
   - `ADV-C5-01`: Invalid payment method rejection (PIX, BOLETO, injection).
   - `ADV-C5-02`: Invalid date string rejection.
   - `ADV-C5-03`: Zero, negative, and floating-point quantity rejection.
   - `ADV-C5-04`: Empty array and blank product ID rejection.

### 1.3 Verbatim Tool Commands and Outputs

1. **Adversarial Test Suite Execution**:
   ```powershell
   npx vitest run tests/integration/baixa-adversarial-m3.test.ts
   ```
   *Verbatim output*:
   ```
    RUN  v3.2.7 C:/Users/Iverson Santos/Documents/Antigravity/Dashboard Mercearia

    ✓ tests/integration/baixa-adversarial-m3.test.ts (14 tests) 806ms

    Test Files  1 passed (1)
         Tests  14 passed (14)
      Start at  23:59:36
      Duration  1.96s (transform 112ms, setup 0ms, collect 193ms, tests 806ms, environment 0ms, prepare 420ms)
   ```

2. **Full Workspace Test Suite Execution**:
   ```powershell
   pnpm test --fileParallelism=false
   ```
   *Verbatim output*:
   ```
    Test Files  15 passed (15)
         Tests  259 passed (259)
      Start at  23:59:57
      Duration  21.66s (transform 613ms, setup 0ms, collect 3.64s, tests 7.85s, environment 4ms, prepare 4.89s)
   ```

3. **Database Cleanliness Inspection**:
   ```powershell
   npx tsx -e "import prisma from './src/lib/prisma'; async function main() { const p = await prisma.produtoEstoque.count(); const l = await prisma.lancamentoDiario.count(); const h = await prisma.historicoBaixa.count(); console.log({ p, l, h }); } main();"
   ```
   *Verbatim output*:
   ```
   { p: 0, l: 0, h: 0 }
   ```

---

## 2. Logic Chain

1. **High-Concurrency Race Condition Defense (Observation 1.2 Suite 1 -> Observation 1.3 Step 1)**:
   - When 10 parallel transactions competed for a product with initial `quantidade = 2`, exactly 2 transactions succeeded and 8 transactions failed.
   - The ending stock was verified to be strictly `0`, with `totalCentavos = 0` and `ativo = false`.
   - In `ADV-C1-02` (15 competing for 4 units), exactly 4 succeeded and 11 failed; in `ADV-C1-03` (6 competing for 2 units each on stock of 3), exactly 1 succeeded and 5 failed, leaving stock at exactly 1 with `ativo = true`.
   - In all runs, stock was bounded by `quantidade >= 0`. Zero negative balances occurred.
   - This proves the conditional update `tx.produtoEstoque.updateMany({ where: { id: prodId, quantidade: { gte: requiredQty }, ativo: true }, data: { quantidade: { decrement: requiredQty }, ... } })` combined with `count === 0` conflict detection successfully prevents race condition overdrafts.

2. **ACID Atomicity & Zero Partial Writes (Observation 1.2 Suite 2 -> Observation 1.3 Step 1)**:
   - In `ADV-C2-01`, a multi-item transaction attempting to debit 5 units of product A (stock 20) and 10 units of product B (stock 1) rejected with `InsufficientStockError`.
   - Direct database inspection confirmed product A remained at 20 units with `totalCentavos = 10000` and `ativo = true`. Zero partial writes occurred.
   - Furthermore, zero records were inserted into `lancamentos_diarios` or `historico_baixas`.
   - The same 100% rollback was verified when an item ID was missing (`ProductNotFoundError`) and when duplicate items exceeded available stock.

3. **Inactive Item Bypass Defense (Observation 1.2 Suite 3 -> Observation 1.3 Step 1)**:
   - In `ADV-C3-01`, a zero-stock inactive product rejected with `ProductInactiveError`.
   - In `ADV-C3-02`, an administratively disabled product (`ativo = false`) possessing 50 units of physical inventory rejected with `ProductInactiveError`. The stock remained unchanged at 50.
   - In `ADV-C3-03`, a multi-item batch with 1 active and 1 inactive item triggered full transaction rollback, preserving active product stock.

4. **Financial Ledger Reconciliation (Observation 1.2 Suite 4 -> Observation 1.3 Step 1)**:
   - In `ADV-C4-01`, 4 transactions across different dates and payment methods (CARTAO & DINHEIRO) were executed.
   - For every transaction, `lancamento.totalDiarioCentavos` strictly matched the exact sum of linked `historico_baixas` rows.
   - Aggregate batch reconciliation verified:
     - Sum of CARTAO in `lancamentos_diarios` ($R\$ 46,09$) strictly equals sum of CARTAO in `historico_baixas` ($R\$ 46,09$).
     - Sum of DINHEIRO in `lancamentos_diarios` ($R\$ 44,69$) strictly equals sum of DINHEIRO in `historico_baixas` ($R\$ 44,69$).
     - Total sum in `lancamentos_diarios` ($R\$ 90,78$) strictly equals total sum in `historico_baixas` ($R\$ 90,78$).
     - Zero centavos drift occurred across any entry.

5. **Database Cleanliness Invariant (Observation 1.3 Step 3)**:
   - All synthetic records across all suites were systematically purged in `afterAll` hooks.
   - The production/development database `dev.db` maintains `{ p: 0, l: 0, h: 0 }`.

---

## 3. Caveats

1. **SQLite Concurrency Serialization**:
   - SQLite relies on file-level locks in WAL mode. `PRAGMA busy_timeout = 5000` and Prisma interactive transaction `maxWait: 5000, timeout: 10000` effectively queue competing operations without locking errors. In a multi-instance distributed deployment on PostgreSQL/Supabase, the same conditional `WHERE quantidade >= requiredQty` pattern will continue to enforce zero negative balances via row-level locks.
2. **Review-Only Role**:
   - As an Empirical Challenger, no production implementation files were altered. All challenges were executed via independent test suites and runtime verification scripts.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 3's transaction coordinator `executeDeductionTransaction` and HTTP endpoint `/api/baixa/executar` have passed all empirical stress challenges:
1. **High-concurrency race condition**: Exactly $N$ succeed for stock of $N$, $M-N$ fail cleanly, stock ends at 0, zero negative balances.
2. **Partial debit failure**: 100% atomic rollback verified, zero partial writes, zero orphaned ledger or audit records.
3. **Inactive product bypass**: Strictly rejected at the transaction boundary even if physical inventory $> 0$.
4. **Financial ledger reconciliation**: Strict mathematical equality between `lancamentos_diarios` and `historico_baixas` verified at line-item, batch, and global levels.
5. **Database cleanliness**: Verified 100% clean with `{ p: 0, l: 0, h: 0 }`.

---

## 5. Verification Method

To independently reproduce and verify this challenger assessment:

1. **Run the Adversarial Test Suite**:
   ```powershell
   npx vitest run tests/integration/baixa-adversarial-m3.test.ts
   ```
   *Expected result*: 14 passed (14).

2. **Run Full Workspace Tests**:
   ```powershell
   pnpm test --fileParallelism=false
   ```
   *Expected result*: 15 passed (15), 259 passed (259).

3. **Verify Database Cleanliness**:
   ```powershell
   npx tsx -e "import prisma from './src/lib/prisma'; async function main() { const p = await prisma.produtoEstoque.count(); const l = await prisma.lancamentoDiario.count(); const h = await prisma.historicoBaixa.count(); console.log({ p, l, h }); } main();"
   ```
   *Expected result*: `{ p: 0, l: 0, h: 0 }`.

4. **Invalidation Conditions**:
   - Stock dropping below zero under any parallel execution volume.
   - Partial stock decrements committed when a multi-item transaction aborts.
   - Successful deduction of an inactive item (`ativo: false`).
   - Any numerical divergence between daily sales totals and audit item sums.
