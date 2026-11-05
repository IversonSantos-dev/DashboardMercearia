# Empirical Challenger Handoff Report — M1 Database WAL & Concurrency

**Agent**: `m1_challenger_2` (M1 Database WAL Challenger)  
**Date**: 2026-11-05T01:15:00Z  
**Verdict**: **REQUEST_CHANGES** (Surgical fix required in `src/lib/prisma.ts`)

---

## 1. Observation

### Observation 1: Runtime Error on Prisma Singleton PRAGMA Execution
In `src/lib/prisma.ts`, lines 20-30:
```typescript
client
  .$executeRawUnsafe(`PRAGMA journal_mode = WAL;`)
  .catch((err) =>
    console.warn("[Prisma] Falha ao definir PRAGMA journal_mode=WAL:", err)
  );

client
  .$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`)
  .catch((err) =>
    console.warn("[Prisma] Falha ao definir PRAGMA busy_timeout=5000:", err)
  );
```
When executed during Prisma Client initialization, Prisma emits the following verbatim errors to `stderr`:
```
prisma:error 
Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
[Prisma] Falha ao definir PRAGMA busy_timeout=5000: PrismaClientKnownRequestError: 
Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
...
[Prisma] Falha ao definir PRAGMA journal_mode=WAL: PrismaClientKnownRequestError: 
Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
```
Empirical evidence script: `tests/integration/verify-pragma-bug.ts` outputs:
- `Result of $executeRawUnsafe('PRAGMA journal_mode = WAL;'): { failed: true, errorCode: 'P2010' }`
- `Result of $executeRawUnsafe('PRAGMA busy_timeout = 5000;'): { failed: true, errorCode: 'P2010' }`
- Calling the same pragmas with `$queryRawUnsafe` succeeds without throwing or logging errors:
  `$queryRawUnsafe('PRAGMA journal_mode = WAL;')` -> `[ { journal_mode: 'wal' } ]`
  `$queryRawUnsafe('PRAGMA busy_timeout = 5000;')` -> `[ { timeout: 5000n } ]`

### Observation 2: Foreign Key Constraints (`onDelete: Restrict`)
In `prisma/schema.prisma`:
```prisma
model HistoricoBaixa {
  ...
  produto  ProdutoEstoque  @relation(fields: [produtoId], references: [id], onDelete: Restrict)
  lancamentoDiario  LancamentoDiario?  @relation(fields: [lancamentoDiarioId], references: [id], onDelete: SetNull)
}
```
In `tests/integration/database-concurrency-fk.test.ts`:
- Attempting `prisma.produtoEstoque.delete({ where: { id: product.id } })` when referenced by `historico_baixas` threw:
  `PrismaClientKnownRequestError: P2003 "Foreign key constraint violated on the foreign key"`
- Attempting raw SQL `DELETE FROM produtos_estoque WHERE id = ?` threw:
  `Raw query failed. Code: 1811. Message: FOREIGN KEY constraint failed`
- Deleting `LancamentoDiario` successfully executed and set `lancamentoDiarioId = null` on the associated `HistoricoBaixa` record (`onDelete: SetNull`).

### Observation 3: High-Concurrency Stress Test & Absence of `SQLITE_BUSY`
In `tests/integration/database-concurrency-fk.test.ts`:
- 50 concurrent transactions (25 mixed write transactions debiting stock and inserting audit history + 25 read operations) executed in 1,061ms.
- 0 `SQLITE_BUSY` errors occurred.
- Total stock decrements exactly matched the 25 write transactions (5,000 -> 4,975).

In `tests/integration/multi-client-stress.ts`:
- 10 distinct `PrismaClient` instances concurrently executing 10 transactions each (100 total transactions) against the same contentious product.
- Finished in 819ms with 0 errors and 0 `SQLITE_BUSY` errors.
- Decrement count was exact: 10,000 -> 9,900.

### Observation 4: Database Cleanliness
After running all empirical tests, database query against `dev.db`:
```javascript
{ produtos: 0, lancamentos: 0, historicos: 0 }
```
All synthetic records created during testing were cleanly deleted.

---

## 2. Logic Chain

1. **Prisma `$executeRawUnsafe` Semantic Contract**:
   Prisma's query engine distinguishes between raw commands that return tabular result rows (`$queryRaw` / `$queryRawUnsafe`) and raw commands that only affect rows without returning data (`$executeRaw` / `$executeRawUnsafe`).
2. **SQLite PRAGMA Return Behavior**:
   SQLite's `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` return a 1-row result set (`{ journal_mode: 'wal' }` and `{ timeout: 5000 }` respectively). SQLite statements that return result rows cannot be passed to `$executeRawUnsafe` without triggering Prisma exception `P2010` (`Execute returned results, which is not allowed in SQLite`).
3. **Impact on Production / Testing**:
   Because `src/lib/prisma.ts` wraps these calls in `.catch()`, the process does not terminate immediately, but on every client instantiation:
   - Prisma logs raw query error stack traces (`prisma:error ... Code: N/A. Message: Execute returned results`).
   - `console.warn` outputs `[Prisma] Falha ao definir PRAGMA journal_mode=WAL` and `[Prisma] Falha ao definir PRAGMA busy_timeout=5000`.
   - On freshly created database instances where WAL has not been previously set on disk, `busy_timeout` is left unconfigured (or default), introducing a risk of `SQLITE_BUSY`.
4. **Foreign Key Contract**:
   Both Prisma query engine and SQLite native engine (`PRAGMA foreign_keys = ON;`) enforce `onDelete: Restrict` on `ProdutoEstoque`, preventing orphaned or dangling audit records in `historico_baixas`.

---

## 3. Caveats

- Tests were run against local SSD filesystem on Windows. Network filesystems (NFS/SMB) were not tested and are not recommended for SQLite.
- The dev database `dev.db` currently has `journal_mode = wal` set in its file header, which persists across connections once successfully written to the SQLite header. However, `src/lib/prisma.ts` must still be corrected so any fresh DB creation or new deployment initializes without `P2010` errors.

---

## 4. Conclusion & Actionable Mitigations

### Verdict: **REQUEST_CHANGES**

The relational schema, concurrency behavior under WAL mode, and foreign key integrity constraints (`onDelete: Restrict`, `onDelete: SetNull`) are **verified and robust**. However, `src/lib/prisma.ts` has a verified bug that must be fixed:

### Recommended Fix for Worker:
In `src/lib/prisma.ts`:
Replace `$executeRawUnsafe` with `$queryRawUnsafe` for PRAGMAs that return results:

```typescript
// Replace:
client.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`)
client.$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`)

// With:
client.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`)
client.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`)
```
(`PRAGMA synchronous = NORMAL;` and `PRAGMA foreign_keys = ON;` do not return results and can remain as `$executeRawUnsafe` or be unified).

---

## 5. Verification Method

To independently verify all findings:
1. Run the test suite:
   ```bash
   npx vitest run tests/integration/database-concurrency-fk.test.ts
   ```
   Observe the test passes (3/3), but notice the `P2010` error messages from `src/lib/prisma.ts` in the logs.
2. Run the isolated PRAGMA bug verification script:
   ```bash
   npx tsx tests/integration/verify-pragma-bug.ts
   ```
   Observe the explicit error reproduction with code `P2010`.
3. Run the multi-client high-concurrency stress script:
   ```bash
   npx tsx tests/integration/multi-client-stress.ts
   ```
   Observe 100 concurrent transactions completed with 0 errors and 0 `SQLITE_BUSY`.
4. Verify database row counts remain 0:
   ```bash
   npx tsx -e "import prisma from './src/lib/prisma'; async function c() { console.log(await prisma.produtoEstoque.count()); await prisma.\$disconnect(); } c();"
   ```
