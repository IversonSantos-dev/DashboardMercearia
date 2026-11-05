# Investigation & Fix Strategy Report: SQLite WAL PRAGMA Execution in `src/lib/prisma.ts`

**Agent**: `m1_it2_explorer_1` (M1 Iteration 2 Explorer 1)  
**Date**: 2026-11-05T01:22:00Z  
**Target File**: `src/lib/prisma.ts` (lines 20-30)  
**Deliverables Provided**:
- Unified patch: `.agents/teamwork/m1_it2_explorer_1/prisma.patch`
- Drop-in replacement: `.agents/teamwork/m1_it2_explorer_1/proposed_prisma.ts`

---

## 1. Observation

### Observation 1.1: Runtime Error on Client Instantiation
In `src/lib/prisma.ts` (lines 20-30):
```typescript
20:    client
21:      .$executeRawUnsafe(`PRAGMA journal_mode = WAL;`)
22:      .catch((err) =>
23:        console.warn("[Prisma] Falha ao definir PRAGMA journal_mode=WAL:", err)
24:      );
25:
26:    client
27:      .$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`)
28:      .catch((err) =>
29:        console.warn("[Prisma] Falha ao definir PRAGMA busy_timeout=5000:", err)
30:      );
```

When `src/lib/prisma.ts` is imported and instantiated:
```powershell
@'
import { prisma } from './src/lib/prisma';
async function m() {
  await prisma.produtoEstoque.count();
  await prisma.$disconnect();
}
m();
'@ | npx tsx -
```

Prisma prints the following verbatim error output to `stderr`:
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
The error code returned by Prisma is `P2010` (`meta: { code: 'N/A', message: 'Execute returned results, which is not allowed in SQLite.' }`).

### Observation 1.2: Empirical PRAGMA Return Types in SQLite
Testing raw statement execution via Node.js runtime against SQLite revealed the root cause:
- `PRAGMA journal_mode = WAL;` returns a tabular row: `[ { journal_mode: 'wal' } ]`
- `PRAGMA busy_timeout = 5000;` returns a tabular row: `[ { timeout: 5000n } ]`
- `PRAGMA synchronous = NORMAL;` returns empty rows: `[]` (affected count: `0`)
- `PRAGMA foreign_keys = ON;` returns empty rows: `[]` (affected count: `0`)

### Observation 1.3: Empirical Verification of `$queryRawUnsafe`
Running the identical pragmas using `$queryRawUnsafe`:
```typescript
await client.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`);
await client.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`);
```
Executes cleanly with exit code `0`, returning the pragma status rows without throwing `P2010` and without emitting any warnings or error logs.

---

## 2. Logic Chain

1. **Prisma API Semantics**:
   - `prisma.$executeRawUnsafe(sql)` is strictly designed for non-query DDL/DML statements (e.g. `INSERT`, `UPDATE`, `DELETE`) where the database engine returns an affected row count. If SQLite returns tabular result rows for an `$executeRawUnsafe` call, Prisma's query engine rejects the operation immediately with known error `P2010: Execute returned results, which is not allowed in SQLite`.
   - `prisma.$queryRawUnsafe(sql)` is designed for queries and statements that return tabular rows. It accepts row results and resolves them as a JavaScript array of objects.

2. **SQLite Specification for PRAGMAs**:
   - In SQLite, commands that set configuration parameters can either return tabular output or empty sets.
   - `PRAGMA journal_mode = WAL;` explicitly returns the resulting journal mode (a 1-row, 1-column table `{ journal_mode: 'wal' }`).
   - `PRAGMA busy_timeout = 5000;` explicitly returns the new timeout (a 1-row, 1-column table `{ timeout: 5000 }`).
   - Therefore, passing these two statements to `$executeRawUnsafe` is guaranteed to trigger `P2010`.

3. **Runtime Impact**:
   - Because `src/lib/prisma.ts` wraps the promises in `.catch()`, unhandled rejection does not crash the Node process, but:
     1. Unnecessary error traces flood stderr during server startup and test runs.
     2. `PRAGMA busy_timeout = 5000;` is rejected before taking effect. On brand new databases or connections without pre-existing timeout configurations, this leaves the database prone to `SQLITE_BUSY` lock contention during concurrent bursts.

4. **Surgical Resolution**:
   - Replacing `$executeRawUnsafe` with `$queryRawUnsafe` specifically for `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` fully aligns Prisma Client with SQLite's tabular output contract, completely eliminating `P2010` errors and ensuring `busy_timeout` is reliably active.

---

## 3. Caveats

1. **Non-row-returning PRAGMAs (`synchronous`, `foreign_keys`)**:
   - `PRAGMA synchronous = NORMAL;` and `PRAGMA foreign_keys = ON;` return empty row sets (`[]`). In Prisma, both `$executeRawUnsafe` and `$queryRawUnsafe` work for them without error. Keeping them as `$executeRawUnsafe` is semantically valid and minimizes diff size to exactly 2 lines. Unifying all 4 PRAGMAs to `$queryRawUnsafe` is also fully compatible.
2. **Reviewer Finding 2 Context**:
   - The adversarial reviewer report noted a separate test failure in `tests/unit/currency.stress.test.ts` (multiple `+` signs in `brlToCentavos`). That is an isolated currency parsing issue and is independent of the Prisma WAL PRAGMA fix.
3. **Database File State**:
   - In SQLite, once WAL mode is established on the `.db` header on disk, subsequent connections often retain WAL mode. However, `PRAGMA busy_timeout` is strictly per-connection in-memory state; fixing `src/lib/prisma.ts` is mandatory for connection resilience.

---

## 4. Conclusion & Proposed Code Diff

### 4.1 Exact Code Replacement (Surgical Fix)

In `src/lib/prisma.ts`:

#### Before (lines 20-30):
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

#### After (lines 20-30):
```typescript
    client
      .$queryRawUnsafe(`PRAGMA journal_mode = WAL;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA journal_mode=WAL:", err)
      );

    client
      .$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA busy_timeout=5000:", err)
      );
```

### 4.2 Unified Patch Reference
A ready-to-apply patch file has been authored in the agent directory:
`.agents/teamwork/m1_it2_explorer_1/prisma.patch`

And the complete replacement file:
`.agents/teamwork/m1_it2_explorer_1/proposed_prisma.ts`

---

## 5. Verification Method

Once the patch is applied to `src/lib/prisma.ts`, execute the following verification steps:

### Test 1: Zero-Warning Client Instantiation Verification
Execute the following command in PowerShell / Terminal:
```powershell
@'
import prisma from "./src/lib/prisma";
async function verify() {
  const count = await prisma.produtoEstoque.count();
  const j = await prisma.$queryRawUnsafe("PRAGMA journal_mode;");
  const b = await prisma.$queryRawUnsafe("PRAGMA busy_timeout;");
  console.log("CLIENT_INSTANTIATION_OK:", { count, journalMode: j[0], busyTimeout: b[0] });
  await prisma.$disconnect();
}
verify();
'@ | npx tsx -
```
**Expected Output**:
- Exit code: `0`
- Zero occurrences of `prisma:error` or `P2010`
- Zero occurrences of `[Prisma] Falha ao definir PRAGMA...`
- `CLIENT_INSTANTIATION_OK: { count: 0, journalMode: { journal_mode: 'wal' }, busyTimeout: { timeout: 5000n } }`

### Test 2: Vitest Integration Suite
Run the database concurrency & foreign key test suite:
```powershell
npx vitest run tests/integration/database-concurrency-fk.test.ts
```
**Expected Output**:
- All 3 tests pass (`3 passed (3)`).
- Console log has clean inspection output with zero `P2010` errors emitted during client setup.

### Test 3: Standalone Pragma Verification Script
```powershell
npx tsx tests/integration/verify-pragma-bug.ts
```
**Expected Output**:
- Successfully demonstrates `$queryRawUnsafe` executing `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` without errors.

### Invalidation Condition
If any command logs `P2010` or fails to return `timeout: 5000n` / `journal_mode: 'wal'`, the fix is invalid.
