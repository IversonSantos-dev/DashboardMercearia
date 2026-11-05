# Review & Adversarial Stress Handoff Report — Milestone 1: Monetary & Concurrency

## Review Summary

**Verdict**: **REQUEST_CHANGES**

- **Integrity Violation Check**: **PASS** (No hardcoded test outputs, no facade stubs, genuine algorithmic implementation in `src/modules/currency/index.ts`).
- **Interface Conformance**: **PASS** (All 6 functions declared in `PROJECT.md § Interface Contracts` implemented with matching types and expected signatures).
- **TypeScript Compilation**: **PASS** (`npx tsc --noEmit` exits 0 with zero errors).
- **Unit Test Suite**: **PASS** (`tests/unit/currency.test.ts` passes 40/40 tests).
- **Concurrency & SQLite Configuration**: **FAIL (Critical)** (`src/lib/prisma.ts` throws `PrismaClientKnownRequestError: P2010` on startup for PRAGMA statements).
- **Edge-Case Validation**: **FAIL (Major)** (`src/modules/currency/index.ts` accepts multiple `+` signs like `"++10"` and misparses infix signs `"10+20"` as `102000`).

---

## Findings

### [Critical] Finding 1: SQLite PRAGMA configuration fails at runtime with P2010

- **What**: Invoking `client.$executeRawUnsafe('PRAGMA journal_mode = WAL;')` and `client.$executeRawUnsafe('PRAGMA busy_timeout = 5000;')` throws a runtime error:
  ```
  prisma:error Invalid `prisma.$executeRawUnsafe()` invocation:
  Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
  [Prisma] Falha ao definir PRAGMA busy_timeout=5000: PrismaClientKnownRequestError: P2010
  ```
- **Where**: `src/lib/prisma.ts`, lines 20-30.
- **Why**: SQLite PRAGMA commands that alter configuration (`journal_mode = WAL`, `busy_timeout = 5000`) return a 1-row result set (`[ { journal_mode: 'wal' } ]` and `[ { timeout: 5000n } ]`). Prisma's `$executeRawUnsafe` strictly rejects queries returning rows. The `.catch(...)` handler logs the error, but the statement fails, meaning `PRAGMA busy_timeout = 5000;` is NOT applied to connections.
- **Risk / Blast Radius**: In high-concurrency scenarios (M3 smart deduction bursts, multi-user transactions), connections will use SQLite's default busy timeout of 0ms and fail immediately with `SQLITE_BUSY: database is locked`.
- **Suggestion**: Use `$queryRawUnsafe` instead of `$executeRawUnsafe` in `src/lib/prisma.ts`:
  ```typescript
  if (isSqlite) {
    client.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`).catch((err) =>
      console.warn("[Prisma] Falha ao definir PRAGMA journal_mode=WAL:", err)
    );
    client.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`).catch((err) =>
      console.warn("[Prisma] Falha ao definir PRAGMA busy_timeout=5000:", err)
    );
    client.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`).catch((err) =>
      console.warn("[Prisma] Falha ao definir PRAGMA synchronous=NORMAL:", err)
    );
    client.$queryRawUnsafe(`PRAGMA foreign_keys = ON;`).catch((err) =>
      console.warn("[Prisma] Falha ao definir PRAGMA foreign_keys=ON:", err)
    );
  }
  ```

---

### [Major] Finding 2: `brlToCentavos` improperly strips multiple plus signs and infix operators

- **What**:
  1. `brlToCentavos("++10")` returns `1000` (10 reais) instead of throwing `TypeError`, whereas `brlToCentavos("--10")` is correctly rejected.
  2. `brlToCentavos("10+20")` returns `102000` (R$ 1.020,00) and `brlToCentavos("10-20")` returns `-102000` (-R$ 1.020,00) instead of throwing `TypeError`.
- **Where**: `src/modules/currency/index.ts`, lines 73-86.
- **Why**:
  Line 84 calls `raw = raw.replace(/\+/g, "").trim()`, which blindly strips all plus signs anywhere in the string.
  Line 77 calls `raw = raw.replace("-", "").trim()`, which strips the first hyphen anywhere in the string and flags `isNegative = true`.
  Neither checks whether the sign is at a valid prefix position.
- **Suggestion**:
  Validate that `+` or `-` appears only once and only as a leading prefix (e.g. `^[+-]?(R\$|\$|BRL)?` or accounting parentheses), and reject infix or multiple signs with `TypeError`:
  ```typescript
  if (raw.includes("+")) {
    const plusMatches = raw.match(/\+/g);
    if (!plusMatches || plusMatches.length !== 1 || (!raw.startsWith("+") && !raw.startsWith("R$+") && !raw.startsWith("R$ +"))) {
      throw new TypeError(`Formato monetário contém sinal positivo mal posicionado ou duplicado: '${val}'`);
    }
    raw = raw.replace("+", "").trim();
  }
  ```
  Ensure identical position checks apply to `-`.

---

### [Minor] Finding 3: Float quantity rounding in `multiplyMoney(centavos, qty)`

- **What**: For fractional quantities with repeating/binary-imprecise floats (e.g., `multiplyMoney(100, 1.005)`), the result is `100` instead of `101`.
- **Where**: `src/modules/currency/index.ts`, line 325.
- **Why**: In IEEE-754 binary floating-point representation, `1.005` is `1.0049999999999998934...`. `100 * 1.005` evaluates to `100.49999999999999`. Calling `Math.round(100.49999999999999)` rounds down to `100`.
- **Suggestion**: Pre-round the intermediate product using scaled precision before applying `Math.round`:
  ```typescript
  const result = Math.round(Math.round(centavos * qty * 1e6) / 1e6);
  ```

---

## 5-Component Handoff Report

### 1. Observation
1. **Verification of Test Execution**:
   Command: `pnpm test`
   Output:
   ```
   ✓ tests/unit/currency.test.ts (40 tests) 17ms
   ✓ tests/integration/database-concurrency-fk.test.ts (3 tests) 1098ms
   ✓ tests/unit/currency.stress.test.ts (12 tests) 1340ms
   Test Files  3 passed (3)
        Tests  55 passed (55)
   ```
2. **Verification of Type Safety**:
   Command: `npx tsc --noEmit`
   Output: Exited with code 0 (zero type errors).
3. **Observation of Runtime PRAGMA Failure**:
   Command: `pnpm exec tsx tests/integration/verify-pragma-bug.ts`
   Output:
   ```
   === EMPIRICAL PROOF: TESTING src/lib/prisma.ts PRAGMA INITIALIZATION ===
   1. Default SQLite state: { journal_mode: 'delete', busy_timeout: '5000' }
   prisma:error Invalid `prisma.$executeRawUnsafe()` invocation:
   Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
   2. Result of $executeRawUnsafe('PRAGMA journal_mode = WAL;'): {
     failed: true,
     errorCode: 'P2010',
     errorMessage: 'Execute returned results, which is not allowed in SQLite.'
   }
   3. Result of $executeRawUnsafe('PRAGMA busy_timeout = 5000;'): {
     failed: true,
     errorCode: 'P2010',
     errorMessage: 'Execute returned results, which is not allowed in SQLite.'
   }
   ```
4. **Observation of Sign Parsing Defect**:
   Command: `pnpm exec tsx -e "import { brlToCentavos } from './src/modules/currency/index.ts'; console.log('++10:', brlToCentavos('++10'), '10+20:', brlToCentavos('10+20'), '10-20:', brlToCentavos('10-20'));"`
   Output:
   ```
   ++10: 1000 10+20: 102000 10-20: -102000
   ```
5. **Observation of Interface Conformance**:
   Inspected `src/modules/currency/index.ts` against `PROJECT.md § Interface Contracts`:
   - `brlToCentavos(val: string | number | null | undefined): number` matches `PROJECT.md` contract.
   - `centavosToBRL(centavos: number): string` matches `PROJECT.md` contract.
   - `formatDecimalBRL(centavos: number): string` matches `PROJECT.md` contract.
   - `addMoney(a: number, b: number): number` matches `PROJECT.md` contract.
   - `subtractMoney(a: number, b: number): number` matches `PROJECT.md` contract.
   - `multiplyMoney(centavos: number, qty: number): number` matches `PROJECT.md` contract.

### 2. Logic Chain
1. *Observation 1 & 5*: The worker correctly authored the full mathematical engine in `src/modules/currency/index.ts` adhering to the required interfaces without float arithmetic drift.
2. *Observation 3*: In `src/lib/prisma.ts`, calling `$executeRawUnsafe` with SQLite PRAGMAs that output rows generates a `P2010` rejection. Because SQLite configuration pragmas return results, Prisma forbids `$executeRawUnsafe`.
3. *Deduction*: Swallowing this error leaves `busy_timeout` unconfigured on newly spawned connections, exposing future concurrent transactions in M3 to `SQLITE_BUSY`. Changing `$executeRawUnsafe` to `$queryRawUnsafe` resolves the error and ensures `busy_timeout = 5000` is active.
4. *Observation 4*: In `src/modules/currency/index.ts`, stripping all `+` characters with `/\+/g` allows invalid inputs (`"++10"`, `"10+20"`) to be parsed as valid numbers instead of throwing `TypeError`.
5. *Deduction*: Restricting signs to single leading prefixes aligns with the strict parsing philosophy of the engine.

### 3. Caveats
- `tests/unit/currency.test.ts` (the 40 original tests authored by the worker) all pass without modification.
- The SQLite database file `prisma/dev.db` is already in WAL mode from schema synchronization (`journal_mode: 'wal'`). The issue is specifically the runtime configuration of `busy_timeout = 5000` across connections.

### 4. Conclusion
The implementation is solid, well-typed, and genuinely free of float drift. However, due to the runtime `P2010` error in `src/lib/prisma.ts` and the edge-case input validation defects in `brlToCentavos`, the verdict is **REQUEST_CHANGES**.

Once the worker makes the following two targeted changes:
1. Replace `$executeRawUnsafe` with `$queryRawUnsafe` in `src/lib/prisma.ts` for SQLite PRAGMAs.
2. Enforce symmetric single-prefix sign validation for `+` and `-` in `src/modules/currency/index.ts`.
Milestone 1 will be fully compliant.

### 5. Verification Method
1. Run full test suite:
   ```powershell
   pnpm test
   ```
   *Expected*: All test suites pass (55/55 tests) with zero errors.
2. Run TypeScript check:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected*: Exit code 0, 0 errors.
3. Verify PRAGMA initialization without P2010 errors:
   ```powershell
   pnpm exec tsx tests/integration/verify-pragma-bug.ts
   ```
   *Expected*: `failed: false` for all pragmas.
