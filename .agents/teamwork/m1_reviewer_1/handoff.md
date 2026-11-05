# Quality & Adversarial Review Report — Milestone 1: Foundation & Schema

## Review Summary

**Verdict**: **REQUEST_CHANGES**

Milestone 1 successfully configures the baseline Next.js 15, React 19, TypeScript, Tailwind, and Prisma relational schema with appropriate models and indexes. However, during independent execution and adversarial stress-testing, **two concrete issues were uncovered**:
1. **Critical Flaw in SQLite WAL Initialization (`src/lib/prisma.ts`)**: Prisma throws `P2010 (Execute returned results, which is not allowed in SQLite)` when executing `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` via `$executeRawUnsafe`. Because these pragmas return result rows in SQLite, they MUST be executed via `$queryRawUnsafe`. Due to `.catch(...)` error swallowing, `busy_timeout` is never applied on startup.
2. **Test Failure in Full Test Suite (`pnpm test`)**: `tests/unit/currency.stress.test.ts` fails with exit code 1 because `src/modules/currency/index.ts` blindly strips all plus signs (`raw.replace(/\+/g, "")`), erroneously parsing malformed inputs like `"++10"` instead of rejecting them with `TypeError` (unlike `"--10"`, which is correctly rejected).

---

## Findings

### [Critical] Finding 1: PRAGMA journal_mode and busy_timeout fail at runtime with P2010

- **What**: Executing `client.$executeRawUnsafe('PRAGMA journal_mode = WAL;')` and `client.$executeRawUnsafe('PRAGMA busy_timeout = 5000;')` throws a runtime error `PrismaClientKnownRequestError: P2010 (Execute returned results, which is not allowed in SQLite)`.
- **Where**: `src/lib/prisma.ts`, lines 20-30.
- **Why**: SQLite returns a 1-row result set for both statements (`[ { journal_mode: 'wal' } ]` and `[ { timeout: 5000n } ]`). Prisma's `$executeRawUnsafe` strictly forbids result-bearing queries. As a consequence, the promise is rejected, caught by `.catch()`, prints an error log, and **fails to configure `busy_timeout = 5000`** on the connection. Under concurrent transaction bursts in M3, connections will default to busy timeout 0 or default and risk `SQLITE_BUSY` locking.
- **Suggestion**: In `src/lib/prisma.ts`, change `$executeRawUnsafe` to `$queryRawUnsafe` for queries returning rows:
  ```typescript
  client.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`).catch(...);
  client.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`).catch(...);
  ```

---

### [Major] Finding 2: `pnpm test` fails due to unhandled multiple plus signs in `brlToCentavos`

- **What**: `pnpm test` exits with code 1 failing on `tests/unit/currency.stress.test.ts`:
  ```
  AssertionError: Expected input "++10" to throw TypeError or RangeError: expected [Function] to throw an error
  ```
- **Where**: `src/modules/currency/index.ts`, lines 83-85.
- **Why**: The code strictly validates negative signs by counting hyphens (`raw.match(/-/g)`), rejecting `"--10"` with `TypeError`. But for plus signs, it calls `raw = raw.replace(/\+/g, "").trim()`, which strips all plus signs. As a result, malformed inputs like `"++10"` or `"+ + 10"` are accepted and parsed as valid numbers.
- **Suggestion**: Enforce symmetry with minus sign validation:
  ```typescript
  } else if (raw.includes("+")) {
    const plusMatches = raw.match(/\+/g);
    if (plusMatches && plusMatches.length === 1) {
      raw = raw.replace("+", "").trim();
    } else {
      throw new TypeError(`Formato monetário contém múltiplos sinais positivos: '${val}'`);
    }
  }
  ```

---

### [Minor / Architectural Observation] Finding 3: `quantidade` in `ProdutoEstoque` is typed as `Int`

- **What**: `quantidade` is defined as `Int @default(0)` in `prisma/schema.prisma`.
- **Where**: `prisma/schema.prisma`, line 25.
- **Why**: Model P7 inventory records in grocery stores may contain weighed products (`unidade: "KG"`) with decimal quantities (e.g. `1.500` or `0.350`). If fractional weights must be represented, `Int` will truncate or reject decimal numbers unless M2 normalizes weights into integer milli-units (e.g. grams).
- **Suggestion**: Document in `PROJECT.md` whether M2 handles weighed items via milli-units (grams), or if discrete unit quantities are assumed.

---

## Verified Claims

| Claim from Worker | Verification Method | Result | Notes |
|---|---|---|---|
| Next.js 15, React 19, TypeScript foundation configured | Inspected `package.json`, `tsconfig.json` | **PASS** | Versions: next 15.2.0, react 19.0.0, ts 5.7.3, path alias `@/*` working |
| Tailind CSS configured | Inspected `tailwind.config.ts`, `globals.css` | **PASS** | Content globs include `./src/**/*.{js,ts,jsx,tsx,mdx}` |
| Prisma schema with 4 required models | Inspected `prisma/schema.prisma`, ran `npx prisma validate` | **PASS** | `produtos_estoque`, `lancamentos_diarios`, `historico_baixas`, `despesas_mensais` valid |
| Foreign key constraints (`onDelete: Restrict`) | `tests/integration/database-concurrency-fk.test.ts` | **PASS** | Attempting to delete a product referenced in `historico_baixas` throws `P2003` |
| SQLite WAL pragmas applied correctly | Tested `src/lib/prisma.ts` with direct node runtime check | **FAIL** | Throws `P2010` under `$executeRawUnsafe` because SQLite PRAGMAs return row results |
| `npx tsc --noEmit` exits with 0 | Executed `npx tsc --noEmit` | **PASS** | Zero type errors |
| `pnpm build` exits with 0 | Executed `pnpm build` | **PASS** | Compiled successfully in 3.2s, 4 static routes generated |
| `pnpm test` passes all tests | Executed `pnpm test` | **FAIL** | 1 test failed in `currency.stress.test.ts` (`"++10"`) |

---

## Adversarial Stress Test Results

- **Float Drift vs BigInt Ground Truth (10,000 transactions)**: PASSED. Accumulating 10,000 random sales in integer cents matched `BigInt` ground truth to the exact centavo, whereas standard float accumulator exhibited drift of `1.4901e-7 BRL`.
- **Concurrency Contention (50 concurrent transactions)**: PASSED. 25 atomic transaction writes and 25 reads executed concurrently without a single `SQLITE_BUSY` lock when WAL mode is active.
- **Round-Trip Fuzzing (10,000 randomized iterations)**: PASSED. `brlToCentavos(centavosToBRL(x)) === x` across magnitudes up to `Number.MAX_SAFE_INTEGER`.
- **Adversarial Malicious Strings**: FAILED on `"++10"`, PASSED on SQL injections (`DROP TABLE`), XSS (`<script>`), `NaN`, `Infinity`, and malformed thousand separators.

---

## 5-Component Handoff Report

### 1. Observation
1. In `src/lib/prisma.ts`, lines 20-30:
   ```typescript
   client.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`)
   client.$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`)
   ```
   Executing `src/lib/prisma.ts` logs:
   ```
   prisma:error Invalid `prisma.$executeRawUnsafe()` invocation:
   Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
   [Prisma] Falha ao definir PRAGMA busy_timeout=5000: PrismaClientKnownRequestError: P2010
   ```
2. Running `pnpm test`:
   ```
   FAIL tests/unit/currency.stress.test.ts > Currency Engine - Empirical Adversarial Stress & Fuzz Suite > Malicious & Adversarial String Fuzzing > reliably throws TypeError or RangeError for all malicious string inputs
   AssertionError: Expected input "++10" to throw TypeError or RangeError: expected [Function] to throw an error
   ```
3. Running `npx tsc --noEmit` exited with code 0.
4. Running `npx prisma validate` exited with code 0: `The schema at prisma\schema.prisma is valid`.
5. Running `pnpm build` exited with code 0.

### 2. Logic Chain
1. SQLite PRAGMAs `journal_mode = WAL;` and `busy_timeout = 5000;` return row output in SQLite.
2. Prisma Client restricts `$executeRawUnsafe` to statements that return zero rows; statements returning rows throw `P2010`.
3. Therefore, calling `$executeRawUnsafe` for these PRAGMAs rejects the promise, triggering the `.catch` handler and leaving `busy_timeout` unconfigured.
4. Replacing `$executeRawUnsafe` with `$queryRawUnsafe` resolves the error completely because `$queryRawUnsafe` permits row returns.
5. In `src/modules/currency/index.ts`, `raw.replace(/\+/g, "")` blindly strips all plus signs, allowing `"++10"` to evaluate as `10` (1000 centavos) instead of being rejected as malformed input like `"--10"`.
6. Fixing this regex validation restores symmetry and ensures 100% test pass rate across `pnpm test`.

### 3. Caveats
- No code in `src/` was modified by this reviewer in accordance with the `Review-only` constraint.
- Once these two targeted edits are applied by the worker, Milestone 1 will be 100% compliant and ready for approval.

### 4. Conclusion
Verdict is **REQUEST_CHANGES**. The worker must fix the two findings above:
1. Change `$executeRawUnsafe` to `$queryRawUnsafe` for `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` in `src/lib/prisma.ts`.
2. Reject multiple `+` signs with `TypeError` in `src/modules/currency/index.ts`.
3. Re-run `pnpm test` to verify 100% pass rate.

### 5. Verification Method
After applying the fixes, run:
```powershell
pnpm test
npx tsc --noEmit
npx prisma validate
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.`$queryRawUnsafe('PRAGMA busy_timeout;').then(console.log).finally(() => p.`$disconnect());"
```
*Expected*: Exit code 0 across all commands, zero test failures, and timeout `5000n`.
