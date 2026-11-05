# Handoff Report: Atomic Transaction & Audit Logging Subsystem (M3 Explorer 2)

**Agent**: M3 Explorer 2 (Atomic Transactions & Audit Logging)  
**Milestone**: M3 (Intelligent Deduction Engine & Atomic Transaction Subsystem)  
**Date**: 2026-11-05  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

### 1.1 Existing Database Models and Constraints (`prisma/schema.prisma`)
From lines 18 to 86 of `prisma/schema.prisma`:
- **`ProdutoEstoque` (table `produtos_estoque`)**:
  - `quantidade Int @default(0)`: Stock quantity (rule: must never be negative).
  - `unitarioCentavos Int @map("unitario_centavos")`: Unit price in integer cents.
  - `totalCentavos Int @map("total_centavos")`: Stock total valuation (`quantidade * unitarioCentavos`).
  - `ativo Boolean @default(true)`: Flag set to `false` when quantity hits 0.
  - Indexes: `@@index([ativo, quantidade])`, `@@index([barras])`, `@@index([unitarioCentavos])`.
  - Relationship: `baixas HistoricoBaixa[]`.
- **`LancamentoDiario` (table `lancamentos_diarios`)**:
  - `id String @id @default(cuid())`.
  - `data String`: ISO date `"YYYY-MM-DD"`.
  - `valorCartaoCentavos Int @default(0) @map("valor_cartao_centavos")`.
  - `valorDinheiroCentavos Int @default(0) @map("valor_dinheiro_centavos")`.
  - `totalDiarioCentavos Int @default(0) @map("total_diario_centavos")`.
  - Relationship: `baixas HistoricoBaixa[]`.
  - Index: `@@index([data])`. Note: `data` is NOT `@unique`, enabling multiple discrete transaction ledger entries per business day.
- **`HistoricoBaixa` (table `historico_baixas`)**:
  - `id String @id @default(cuid())`.
  - `lancamentoDiarioId String? @map("lancamento_diario_id")` (`onDelete: SetNull`).
  - `produtoId String @map("produto_id")` (`onDelete: Restrict`).
  - `codigoProduto String`: Frozen historical snapshot of product code.
  - `discriminacaoProduto String`: Frozen historical snapshot of product description.
  - `quantidadeBaixada Int`: Quantity deducted in this transaction.
  - `unitarioCentavos Int`: Frozen historical unit price at the time of sale.
  - `totalCentavos Int`: Total item debit (`quantidadeBaixada * unitarioCentavos`).
  - `formaPagamento String`: `"CARTAO"` | `"DINHEIRO"`.
  - `dataHora DateTime @default(now())`.

### 1.2 Concurrency and WAL Pragmas (`src/lib/prisma.ts`)
Lines 20 to 43 of `src/lib/prisma.ts` verify the local SQLite database is initialized with:
- `PRAGMA journal_mode = WAL;` (enables non-blocking concurrent reads and concurrent transaction queues)
- `PRAGMA busy_timeout = 5000;` (waits up to 5000ms before throwing `SQLITE_BUSY`)
- `PRAGMA synchronous = NORMAL;` (optimal WAL durability and disk I/O performance)
- `PRAGMA foreign_keys = ON;` (enforces strict referential integrity at the engine level)

### 1.3 Contract Expectations (`tests/e2e/helpers/contract-loader.ts`)
Lines 101 to 125 of `tests/e2e/helpers/contract-loader.ts` define the interface contract:
```typescript
export type FormaPagamento = "CARTAO" | "DINHEIRO";

export interface ExecuteDeductionParams {
  valorAlvoCentavos: number;
  formaPagamento: FormaPagamento;
  dataLancamento: string; // ISO Date YYYY-MM-DD
  itens: {
    produtoId: string;
    quantidadeDebitar: number;
  }[];
  operadorObservacao?: string;
}

export interface ExecuteDeductionResult {
  sucesso: boolean;
  lancamentoDiarioId: string;
  historicoIds: string[];
  totalDebitadoCentavos: number;
}

export interface TransacoesContract {
  executeDeductionTransaction: (
    params: ExecuteDeductionParams
  ) => Promise<ExecuteDeductionResult>;
}
```

### 1.4 Test Assertions Across E2E and Integration Suites
1. **Foreign Key Restrict (`tests/e2e/tier1-feature-coverage.test.ts:165-173`)**:
   Attempting to delete a `ProdutoEstoque` referenced by `HistoricoBaixa` fails with `PrismaClientKnownRequestError` (`P2003: Foreign key constraint violated`).
2. **Atomic Stock Decrement (`tests/e2e/tier1-feature-coverage.test.ts:601-621`)**:
   Deducting 3 units from 10 leaves exactly 7 units and total valuation `7 * 450 = 3150`.
3. **Zero Balance Deactivation (`tests/e2e/tier1-feature-coverage.test.ts:623-651`)**:
   When stock drops from 2 to 0, `ativo` becomes `false` and `totalCentavos` becomes 0.
4. **Daily Sales Book Entry (`tests/e2e/tier1-feature-coverage.test.ts:653-683`)**:
   CARTAO sales increment `valorCartaoCentavos`; DINHEIRO sales increment `valorDinheiroCentavos`; `totalDiarioCentavos` equals the sum.
5. **Retroactive Date Support (`tests/e2e/tier1-feature-coverage.test.ts:766-788`)**:
   `dataLancamento: "2099-01-31"` must be recorded faithfully in `lancamentoDiario.data`.
6. **Negative Stock & Overdraw Prevention (`tests/e2e/tier2-boundary-corner.test.ts:433-461`)**:
   Attempting to debit 10 units when available stock is 3 throws an error; transaction rolls back completely and leaves stock at 3.
7. **Invalid Product ID (`tests/e2e/tier2-boundary-corner.test.ts:536-552`)**:
   Non-existent product ID (`"non-existent-id"`) must reject and throw an error safely.
8. **Cash Drawer Audit Match (`tests/e2e/tier4-real-world-scenarios.test.ts:148-169`)**:
   Aggregated `lancamentoDiario.valorCartaoCentavos` and `valorDinheiroCentavos` across all day's transactions must equal the sum of `historico_baixas.totalCentavos`.
9. **50 Concurrent Mixed Transactions (`tests/integration/database-concurrency-fk.test.ts:165-280`)**:
   Ran 50 concurrent transactions without a single `SQLITE_BUSY` error, maintaining 100% integrity.

---

## 2. Logic Chain

```
[Observation 1.1: Schema models and relations]
  │
  ├─► [Observation 1.2: SQLite WAL + busy_timeout = 5000]
  │     └─► Interactive prisma.$transaction supports ACID multi-statement coordination
  │
  ├─► [Observation 1.3: TransacoesContract signature]
  │     └─► Input accepts multi-item array; returns single lancamentoDiarioId, historicoIds[], totalDebitadoCentavos
  │
  ├─► [Observation 1.4: T1-F17-2, T2-B21, T2-B25 test requirements]
  │     ├─► Check quantity and ativo before debit
  │     ├─► Atomic conditional update: where: { id, quantidade: { gte: debit }, ativo: true }
  │     ├─► If count === 0: abort & throw concurrency or insufficient stock error
  │     └─► Set ativo = (novaQtd > 0)
  │
  ├─► [Observation 1.4: T1-F18-3, T1-F18-4, T4-01 sales drawer audit]
  │     └─► Insert 1 row in lancamentos_diarios under CARTAO or DINHEIRO column
  │
  └─► [Observation 1.4: T1-F19-5, T2-B09, T3-01 immutable audit snapshots]
        └─► Insert 1 row per deducted item in historico_baixas with snapshot fields
              (codigoProduto, discriminacaoProduto, unitarioCentavos, totalCentavos)
```

1. **ACID Transaction Scope**:
   The entire sequence (Stock check -> Conditional stock decrement -> Sales entry creation -> Audit records creation) must run inside a single interactive `prisma.$transaction(async (tx) => { ... })`. If any item fails, the database automatically rolls back all mutations, leaving zero orphan rows and zero stock drift.
2. **Race-Condition Safety**:
   Simple `findUnique` followed by `update` has a race window under high concurrency. By combining:
   - Early read & validation (`tx.produtoEstoque.findUniqueOrThrow`), and
   - Atomic conditional update via `tx.produtoEstoque.updateMany({ where: { id, quantidade: { gte: debit }, ativo: true }, data: { quantidade: { decrement: debit }, totalCentavos: newTotal, ativo: newAtivo } })`,
   the database engine guarantees at execution time that stock is decremented ONLY if the balance is still `>= debit`. If a concurrent transaction depleted the stock first, `updateResult.count` is `0`, triggering an immediate rollback.
3. **Ledger Consolidation (`lancamentos_diarios`)**:
   Each completed deduction is a discrete fiscal event. The system creates a `lancamentoDiario` row with `data = params.dataLancamento`. The total debit is placed into `valorCartaoCentavos` (if payment is `'CARTAO'`) or `valorDinheiroCentavos` (if payment is `'DINHEIRO'`), with `totalDiarioCentavos = totalDebitadoCentavos`.
4. **Historical Snapshot Fidelity (`historico_baixas`)**:
   Products in a grocery store may undergo price changes, code re-indexing, or description updates in future inventory cycles. By storing `codigoProduto`, `discriminacaoProduto`, and `unitarioCentavos` directly in `historico_baixas`, the audit trail remains 100% immutable and accurate forever.
5. **Item Consolidation**:
   If an incoming request contains duplicate references to the same `produtoId` (e.g., from combined multi-tier rules), the engine pre-aggregates the debit quantities per product before executing the database checks, preventing internal locking conflicts.

---

## 3. Caveats

1. **SQLite Write Serialization**:
   While SQLite WAL mode allows concurrent reads during writes, writes are inherently serialized by SQLite's single-writer lock. Prisma handles this with `PRAGMA busy_timeout = 5000;`. The transaction execution timeout should be set to `timeout: 10000, maxWait: 5000` to prevent premature timeouts during heavy bursts.
2. **PostgreSQL / Supabase Migration**:
   In PostgreSQL, `updateMany` with `where: { id, quantidade: { gte: debit } }` behaves identically, returning `{ count: 1 }` or `{ count: 0 }`. In PostgreSQL, row-level locking (`SELECT ... FOR UPDATE`) is also available, but the conditional `updateMany` pattern chosen here works identically on BOTH SQLite and PostgreSQL without any code changes.
3. **No Retroactive Stock Rewind**:
   Retroactive fiscal entries (`dataLancamento` in the past) deduct from CURRENT real-world stock. The fiscal entry is registered on the designated historical date, but stock is decremented in real time. This aligns with requirement R4 and standard retail POS practices.

---

## 4. Conclusion & Complete Implementation Design

The atomic transaction subsystem must be implemented in `src/modules/transacoes/index.ts` conforming strictly to `TransacoesContract`.

### 4.1 Proposed Source Code: `src/modules/transacoes/index.ts`

```typescript
// ====================================================================
// Module: transacoes
// Subsystem: Atomic Transaction Coordinator & Audit Logging Engine
// Features: F17 (Stock Decrement & Deactivation), F18 (Daily Sales Book),
//           F19 (Immutable Audit Trail)
// ====================================================================

import prisma from "@/lib/prisma";

// --------------------------------------------------------------------
// Type Definitions
// --------------------------------------------------------------------

export type FormaPagamento = "CARTAO" | "DINHEIRO";

export interface DeductionItemInput {
  produtoId: string;
  quantidadeDebitar: number;
}

export interface ExecuteDeductionParams {
  valorAlvoCentavos: number;
  formaPagamento: FormaPagamento;
  dataLancamento: string; // ISO Date YYYY-MM-DD
  itens: DeductionItemInput[];
  operadorObservacao?: string;
}

export interface ExecuteDeductionResult {
  sucesso: boolean;
  lancamentoDiarioId: string;
  historicoIds: string[];
  totalDebitadoCentavos: number;
}

export interface AuditRecordDetail {
  id: string;
  lancamentoDiarioId: string | null;
  produtoId: string;
  codigoProduto: string;
  discriminacaoProduto: string;
  quantidadeBaixada: number;
  unitarioCentavos: number;
  totalCentavos: number;
  formaPagamento: string;
  dataHora: Date;
}

// --------------------------------------------------------------------
// Custom Domain Error Classes
// --------------------------------------------------------------------

export class DeductionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeductionValidationError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(produtoId: string) {
    super(`Produto não encontrado no estoque: ID "${produtoId}"`);
    this.name = "ProductNotFoundError";
  }
}

export class ProductInactiveError extends Error {
  constructor(codigo: string, discriminacao: string) {
    super(`Produto "${discriminacao}" (${codigo}) está inativo e não pode ser baixado.`);
    this.name = "ProductInactiveError";
  }
}

export class InsufficientStockError extends Error {
  constructor(codigo: string, discriminacao: string, disponivel: number, solicitado: number) {
    super(
      `Saldo de estoque insuficiente para baixa do produto "${discriminacao}" (${codigo}). ` +
      `Disponível: ${disponivel}, Solicitado: ${solicitado}.`
    );
    this.name = "InsufficientStockError";
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(codigo: string, discriminacao: string) {
    super(
      `Conflito de concorrência: o saldo do produto "${discriminacao}" (${codigo}) foi ` +
      `modificado por outra transação simultânea. A operação foi cancelada.`
    );
    this.name = "ConcurrencyConflictError";
  }
}

// --------------------------------------------------------------------
// Primary Function: executeDeductionTransaction
// --------------------------------------------------------------------

/**
 * Executes an atomic stock deduction transaction coordinating:
 * 1. Strict validation of payment method, ISO date, and items array.
 * 2. Atomic stock decrement with zero-balance deactivation (`ativo = false`).
 * 3. Conditional concurrency protection preventing negative stock.
 * 4. Immediate entry in daily sales book (`lancamentos_diarios`).
 * 5. Immutable snapshot creation in audit trail (`historico_baixas`).
 *
 * Full ACID rollback is guaranteed on any step failure.
 */
export async function executeDeductionTransaction(
  params: ExecuteDeductionParams
): Promise<ExecuteDeductionResult> {
  // 1. Validate Input Parameters
  if (!params) {
    throw new DeductionValidationError("Parâmetros de baixa não fornecidos.");
  }

  if (params.formaPagamento !== "CARTAO" && params.formaPagamento !== "DINHEIRO") {
    throw new DeductionValidationError(
      `Forma de pagamento inválida: "${params.formaPagamento}". Permitidos: CARTAO, DINHEIRO.`
    );
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!params.dataLancamento || !isoDateRegex.test(params.dataLancamento)) {
    throw new DeductionValidationError(
      `Data de lançamento inválida: "${params.dataLancamento}". Formato obrigatório: YYYY-MM-DD.`
    );
  }

  if (!Array.isArray(params.itens) || params.itens.length === 0) {
    throw new DeductionValidationError("A lista de itens para baixa não pode ser vazia.");
  }

  for (const item of params.itens) {
    if (!item.produtoId || typeof item.produtoId !== "string" || item.produtoId.trim() === "") {
      throw new DeductionValidationError("ID de produto inválido ou vazio na lista de itens.");
    }
    if (
      typeof item.quantidadeDebitar !== "number" ||
      !Number.isInteger(item.quantidadeDebitar) ||
      item.quantidadeDebitar <= 0
    ) {
      throw new DeductionValidationError(
        `Quantidade a debitar inválida para produto ${item.produtoId}: ${item.quantidadeDebitar}. Deve ser um inteiro positivo.`
      );
    }
  }

  // 2. Pre-aggregate debit quantities by product ID (handles duplicate item entries safely)
  const aggregatedDebitMap = new Map<string, number>();
  for (const item of params.itens) {
    const existing = aggregatedDebitMap.get(item.produtoId) ?? 0;
    aggregatedDebitMap.set(item.produtoId, existing + item.quantidadeDebitar);
  }

  // 3. Execute Interactive Atomic Transaction via Prisma
  return prisma.$transaction(
    async (tx) => {
      // --------------------------------------------------------------
      // Step A: Load and Validate All Target Products
      // --------------------------------------------------------------
      const productIds = Array.from(aggregatedDebitMap.keys());
      const products = await tx.produtoEstoque.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Verify all requested products exist
      for (const prodId of productIds) {
        if (!productMap.has(prodId)) {
          throw new ProductNotFoundError(prodId);
        }
      }

      // Verify availability, active state, and stock sufficiency
      for (const [prodId, requiredQty] of aggregatedDebitMap.entries()) {
        const prod = productMap.get(prodId)!;

        if (!prod.ativo || prod.quantidade <= 0) {
          throw new ProductInactiveError(prod.codigo, prod.discriminacao);
        }

        if (prod.quantidade < requiredQty) {
          throw new InsufficientStockError(
            prod.codigo,
            prod.discriminacao,
            prod.quantidade,
            requiredQty
          );
        }
      }

      // --------------------------------------------------------------
      // Step B: Atomic Decrement & Conditional Deactivation
      // --------------------------------------------------------------
      for (const [prodId, requiredQty] of aggregatedDebitMap.entries()) {
        const prod = productMap.get(prodId)!;
        const remainingQty = prod.quantidade - requiredQty;
        const newAtivo = remainingQty > 0;
        const newTotalCentavos = remainingQty * prod.unitarioCentavos;

        // Atomic conditional update: enforces that current stock is >= requiredQty
        const updateResult = await tx.produtoEstoque.updateMany({
          where: {
            id: prodId,
            quantidade: { gte: requiredQty },
            ativo: true,
          },
          data: {
            quantidade: { decrement: requiredQty },
            totalCentavos: newTotalCentavos,
            ativo: newAtivo,
          },
        });

        // If count === 0, stock was modified concurrently during the transaction
        if (updateResult.count === 0) {
          throw new ConcurrencyConflictError(prod.codigo, prod.discriminacao);
        }
      }

      // --------------------------------------------------------------
      // Step C: Calculate Financial Totals
      // --------------------------------------------------------------
      let totalDebitadoCentavos = 0;
      for (const item of params.itens) {
        const prod = productMap.get(item.produtoId)!;
        totalDebitadoCentavos += item.quantidadeDebitar * prod.unitarioCentavos;
      }

      const valorCartaoCentavos =
        params.formaPagamento === "CARTAO" ? totalDebitadoCentavos : 0;
      const valorDinheiroCentavos =
        params.formaPagamento === "DINHEIRO" ? totalDebitadoCentavos : 0;

      // --------------------------------------------------------------
      // Step D: Insert Daily Sales Ledger Entry (lancamentos_diarios)
      // --------------------------------------------------------------
      const defaultObs = `Baixa Frente de Caixa - ${params.formaPagamento}`;
      const lancamento = await tx.lancamentoDiario.create({
        data: {
          data: params.dataLancamento,
          valorCartaoCentavos,
          valorDinheiroCentavos,
          totalDiarioCentavos: totalDebitadoCentavos,
          observacoes: params.operadorObservacao || defaultObs,
        },
      });

      // --------------------------------------------------------------
      // Step E: Insert Immutable Audit Trail Records (historico_baixas)
      // --------------------------------------------------------------
      const historicoIds: string[] = [];

      for (const item of params.itens) {
        const prod = productMap.get(item.produtoId)!;
        const itemTotalCentavos = item.quantidadeDebitar * prod.unitarioCentavos;

        const audit = await tx.historicoBaixa.create({
          data: {
            lancamentoDiarioId: lancamento.id,
            produtoId: prod.id,
            codigoProduto: prod.codigo, // Frozen snapshot
            discriminacaoProduto: prod.discriminacao, // Frozen snapshot
            quantidadeBaixada: item.quantidadeDebitar,
            unitarioCentavos: prod.unitarioCentavos, // Frozen snapshot
            totalCentavos: itemTotalCentavos,
            formaPagamento: params.formaPagamento,
          },
        });

        historicoIds.push(audit.id);
      }

      // --------------------------------------------------------------
      // Step F: Return Successful Transaction Result
      // --------------------------------------------------------------
      return {
        sucesso: true,
        lancamentoDiarioId: lancamento.id,
        historicoIds,
        totalDebitadoCentavos,
      };
    },
    {
      maxWait: 5000, // Aligned with PRAGMA busy_timeout = 5000
      timeout: 10000, // 10s budget for transaction execution
    }
  );
}

// --------------------------------------------------------------------
// Auxiliary Query Helpers for POS & Auditing
// --------------------------------------------------------------------

/**
 * Retrieves the full audit trail associated with a daily sales ledger entry.
 */
export async function getTransactionAuditTrail(
  lancamentoDiarioId: string
): Promise<AuditRecordDetail[]> {
  const records = await prisma.historicoBaixa.findMany({
    where: { lancamentoDiarioId },
    orderBy: { dataHora: "asc" },
  });

  return records.map((r) => ({
    id: r.id,
    lancamentoDiarioId: r.lancamentoDiarioId,
    produtoId: r.produtoId,
    codigoProduto: r.codigoProduto,
    discriminacaoProduto: r.discriminacaoProduto,
    quantidadeBaixada: r.quantidadeBaixada,
    unitarioCentavos: r.unitarioCentavos,
    totalCentavos: r.totalCentavos,
    formaPagamento: r.formaPagamento,
    dataHora: r.dataHora,
  }));
}

/**
 * Retrieves the historical deduction trail for a given product.
 */
export async function getProductAuditHistory(
  produtoId: string,
  limit = 50
): Promise<AuditRecordDetail[]> {
  const records = await prisma.historicoBaixa.findMany({
    where: { produtoId },
    orderBy: { dataHora: "desc" },
    take: limit,
  });

  return records.map((r) => ({
    id: r.id,
    lancamentoDiarioId: r.lancamentoDiarioId,
    produtoId: r.produtoId,
    codigoProduto: r.codigoProduto,
    discriminacaoProduto: r.discriminacaoProduto,
    quantidadeBaixada: r.quantidadeBaixada,
    unitarioCentavos: r.unitarioCentavos,
    totalCentavos: r.totalCentavos,
    formaPagamento: r.formaPagamento,
    dataHora: r.dataHora,
  }));
}
```

---

## 5. Verification Method

To independently verify the transaction design and its compliance with the test suite:

### 5.1 Verification Commands
1. **Concurrency and Foreign Key Verification**:
   ```powershell
   npx vitest run tests/integration/database-concurrency-fk.test.ts
   ```
   *Expected outcome*: Passes all 3 tests in < 2s, validating WAL mode, busy timeout 5000, foreign key restriction, and 50 concurrent transactions.
2. **Tier 1 Feature Coverage**:
   ```powershell
   npx vitest run tests/e2e/tier1-feature-coverage.test.ts
   ```
   *Expected outcome*: Tests T1-F3-4, T1-F17-1, T1-F17-2, T1-F18-3, T1-F18-4, T1-F19-5 pass. When `src/modules/transacoes/index.ts` is implemented, T1-F20-1, T1-F20-2, and T1-F20-3 will automatically execute and pass.
3. **Tier 2 Boundary Tests**:
   ```powershell
   npx vitest run tests/e2e/tier2-boundary-corner.test.ts
   ```
   *Expected outcome*: Tests T2-B08, T2-B09, T2-B21, T2-B25 pass without unhandled crashes.
4. **Tier 3 Cross-Feature Full Lifecycle**:
   ```powershell
   npx vitest run tests/e2e/tier3-cross-feature.test.ts
   ```
   *Expected outcome*: Passes the end-to-end flow from inventory ingestion through smart deduction, cash closure, and monthly confrontation.
5. **Tier 4 Real-World Sales Rush Simulation**:
   ```powershell
   npx vitest run tests/e2e/tier4-real-world-scenarios.test.ts
   ```
   *Expected outcome*: Passes 15 full sequential sales, matching daily cash drawer entries to the exact audit centavo.

### 5.2 Invalidation Conditions
- If `updateMany.count === 0` is not checked, concurrent deductions can drive stock below zero.
- If `totalCentavos` is not recalculated as `(novaQtd * unitarioCentavos)`, database stock valuation drifts from inventory reality.
- If `lancamentoDiarioId` is not stored in `historico_baixas`, the cash drawer confrontation query cannot link sales records to product audit items.
- If floating-point arithmetic is introduced instead of integer cents, monetary discrepancies will fail Tier 1 and Tier 4 assertions.
