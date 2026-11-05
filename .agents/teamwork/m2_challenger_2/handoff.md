# M2 Ingestion & Concurrency Challenge Report

**Verdict**: **APPROVE**  
**Role**: Empirical Challenger (Critic / Specialist)  
**Target Route**: `src/app/api/inventario/import/route.ts`  
**Test Suite**: `tests/integration/m2-adversarial-ingestion.test.ts`  
**Execution Timestamp**: 2026-11-05T02:04:00Z  

---

## 1. Observation

Direct observations and verbatim metrics obtained during empirical adversarial testing:

1. **Large Spreadsheet Ingestion (600 items & 1,200 items)**:
   - Command: `npx vitest run tests/integration/m2-adversarial-ingestion.test.ts`
   - Generated Model P7 XLSX with 600 valid items in `34.8ms`.
   - Ingested and upserted 600 items into `produtos_estoque` in `460.9ms`.
   - Boundary stress test with 1,200 items in a single file completed in `1039.9ms`.
   - SQLite parameter limit (`SQLITE_MAX_VARIABLE_NUMBER`) was not exhausted by `allCodes` query (`where: { codigo: { in: allCodes } }`).
   - Verbatim response payload for 600-item import:
     ```json
     {
       "success": true,
       "dryRun": false,
       "fileName": "stress_600_items.xlsx",
       "summary": {
         "totalItensLidos": 600,
         "totalItensImportados": 600,
         "totalItensQuarentena": 0,
         "novosCadastrados": 600,
         "atualizados": 0
       }
     }
     ```
   - Direct database query verified: `SELECT COUNT(*) FROM produtos_estoque WHERE codigo LIKE 'CHALLENGE-M2-%'` returned exactly `600`. First (`000001`), middle (`000300`), and last (`000600`) items had exact integer cents and `ativo = true`.

2. **Atomic Rollback on Mid-Transaction Database Error**:
   - Tested using a native SQLite engine trigger:
     ```sql
     CREATE TRIGGER trg_adversarial_abort_test
     BEFORE INSERT ON produtos_estoque
     FOR EACH ROW
     WHEN NEW.codigo = 'CHALLENGE-M2-000075'
     BEGIN
       SELECT RAISE(ABORT, 'ADVERSARIAL_SQLITE_FAILURE_MID_TRANSACTION');
     END;
     ```
   - A 120-item spreadsheet spanning multiple 50-item chunks (Chunk 1: 1..50; Chunk 2: 51..100) was submitted.
   - When Chunk 2 reached item #75, SQLite aborted the transaction.
   - Route caught the transaction error and returned HTTP 500 (`{ success: false, error: "Erro interno no servidor ao processar importação de inventário." }`).
   - Direct database inspection:
     `SELECT COUNT(*) FROM produtos_estoque WHERE codigo LIKE 'CHALLENGE-M2-%'` returned **`0`**. Zero items from Chunk 1 or partial Chunk 2 persisted.
   - Tested update rollback: 60 seeded items (with `quantidade = 10`) subjected to a re-import updating all to `quantidade = 999` with a trigger aborting at item #40. All 60 items strictly retained their original `quantidade = 10`.

3. **Idempotency & Re-import Guarantees**:
   - Re-import of the exact same 250-item spreadsheet:
     - Run 1: `novosCadastrados: 250`, `atualizados: 0`, total in DB: `250`.
     - Run 2: `novosCadastrados: 0`, `atualizados: 250`, total in DB: `250`. Zero duplicate code errors (`P2002`).
   - Re-import with modified physical counts:
     - Physical stock replacement confirmed: item with previous quantity 50 updated with inventory quantity 125 resulted in `quantidade = 125` (replacing previous balance, NOT incrementing to 175).
     - Out-of-stock deactivation: item with previous quantity 50 updated with inventory quantity 0 resulted in `quantidade = 0` and `ativo = false`.

4. **Concurrency & Lock Contention Under WAL Mode**:
   - Two concurrent 100-item imports (`Promise.all([POST(reqA), POST(reqB)])`) fired simultaneously against `dev.db`.
   - Completed in `179.0ms`. Both returned HTTP 200 without `SQLITE_BUSY` errors.
   - Both datasets persisted 100 items each (200 total).

5. **Database Cleanup Verification**:
   - Command: `npx tsx -e "import prisma from './src/lib/prisma'; async function main() { const count = await prisma.produtoEstoque.count(); const baixas = await prisma.historicoBaixa.count(); console.log({ produtoCount: count, baixaCount: baixas }); } main().then(() => process.exit(0));"`
   - Output: `{ produtoCount: 0, baixaCount: 0 }`.

---

## 2. Logic Chain

1. **Step 1 (Ingestion Scale & Throughput)**: From Observation 1, `src/app/api/inventario/import/route.ts` chunks batch operations into `CHUNK_SIZE = 50` inside `prisma.$transaction(async (tx) => { ... }, { timeout: 30000, maxWait: 10000 })`. Pipelining 50 upserts concurrently per chunk completes 600 items in ~460ms and 1,200 items in ~1040ms, achieving ~1,150 items/sec throughput. This comfortably exceeds the 500+ item requirement and stays well within the 30-second timeout window.
2. **Step 2 (ACID Atomicity & Rollback)**: From Observation 2, when an unrecoverable SQLite error occurs midway through the chunk loop (triggered at item #75 after Chunk 1 completed), the interactive transaction callback throws. SQLite issues a full rollback of the active transaction. Because all chunk operations occur within the single `tx` scope, all previously completed chunks are rolled back atomically, leaving 0 uncommitted partial rows in `dev.db`.
3. **Step 3 (Idempotency Semantics)**: From Observation 3, the endpoint executes `upsert({ where: { codigo: item.codigo }, create: { ... }, update: { ... } })`. Because `codigo` is `@unique` in `prisma/schema.prisma` and in-file duplicate codes are consolidated in Step 7 (`consolidatedMap`), re-importing identical or modified files is strictly idempotent and safe against race conditions.
4. **Step 4 (Concurrency Handling)**: From Observation 4, `src/lib/prisma.ts` configures SQLite with `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and `PRAGMA synchronous = NORMAL;`. Concurrent transactions wait up to 5,000ms for writer lock acquisition rather than failing immediately, allowing concurrent imports to serialize smoothly.

---

## 3. Caveats

- **Network-layer chunking**: The test exercised in-memory buffer ingestion through `POST(req: NextRequest)`. Disconnection during the initial HTTP upload stream before the route handler is invoked is handled by Next.js / Node.js HTTP server layer and does not reach the database.
- **SQLite Single Writer Constraint**: While WAL mode allows concurrent readers alongside a writer, SQLite permits only one writer transaction at any given moment. High write concurrency beyond `busy_timeout` (5,000ms) would queue or timeout; for single-store retail operation (Mercearia POS), this is more than sufficient.

---

## 4. Conclusion

The implementation of `src/app/api/inventario/import/route.ts` satisfies all M2 operational and architectural requirements:
- Large spreadsheet ingestion (500+ items) operates at high throughput (~1,150 items/sec) with zero floating-point leakage.
- Atomic rollback is 100% verified against native database engine aborts: zero partial writes occur on failure.
- Ingestion is fully idempotent: re-imports update stock balances without duplicate key collisions.
- Final database state is verified clean (`produtoCount: 0, baixaCount: 0`).

**Verdict: APPROVE**

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. **Run the adversarial stress test suite**:
   ```powershell
   npx vitest run tests/integration/m2-adversarial-ingestion.test.ts
   ```
   *Expected*: All 7 tests pass in under 5 seconds.

2. **Run the baseline import test suite**:
   ```powershell
   npx vitest run tests/integration/inventory-import.test.ts
   ```
   *Expected*: All 12 tests pass.

3. **Verify dev.db cleanliness**:
   ```powershell
   npx tsx -e "import prisma from './src/lib/prisma'; async function main() { console.log({ produtoCount: await prisma.produtoEstoque.count(), baixaCount: await prisma.historicoBaixa.count() }); } main().then(() => process.exit(0));"
   ```
   *Expected*: `{ produtoCount: 0, baixaCount: 0 }`.

4. **Invalidation condition**: Any unhandled SQLite lock crash, partial product leakage upon transaction abort, or non-idempotent duplicate error invalidates this approval.
