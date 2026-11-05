# Holistic Regression-Proof Plan: Milestone 1 Worker Fixes & Verification Strategy

**Agent**: `m1_it2_explorer_3` (Holistic Regression & Verification Strategy)  
**Date**: 2026-11-05T01:23:00Z  
**Target Milestone**: Milestone 1 (Iteration 2)  
**Status**: COMPLETE  

---

## 1. Observation

### 1.1 Direct Observation: SQLite PRAGMA Runtime Failure (`src/lib/prisma.ts`)
- **File & Lines**: `src/lib/prisma.ts`, lines 20-30:
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
- **Verbatim Error**:
  Executing `pnpm test` triggers Prisma Client initialization, outputting verbatim to stderr/stdout:
  ```
  prisma:error 
  Invalid `prisma.$executeRawUnsafe()` invocation:

  Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
  [Prisma] Falha ao definir PRAGMA busy_timeout=5000: PrismaClientKnownRequestError: 
  Invalid `prisma.$executeRawUnsafe()` invocation:

  Raw query failed. Code: `N/A`. Message: `Execute returned results, which is not allowed in SQLite.`
      ...
    code: 'P2010',
    meta: {
      code: 'N/A',
      message: 'Execute returned results, which is not allowed in SQLite.'
    },
    clientVersion: '6.19.3'
  ```
- **Empirical Check**:
  Running `tests/integration/verify-pragma-bug.ts` confirms:
  - `$executeRawUnsafe('PRAGMA journal_mode = WAL;')` throws `P2010`.
  - `$executeRawUnsafe('PRAGMA busy_timeout = 5000;')` throws `P2010`.
  - Conversely, `$queryRawUnsafe('PRAGMA journal_mode = WAL;')` returns `[ { journal_mode: 'wal' } ]` with 0 errors.
  - `$queryRawUnsafe('PRAGMA busy_timeout = 5000;')` returns `[ { timeout: 5000n } ]` with 0 errors.
  - Calling `$queryRawUnsafe` for `PRAGMA synchronous = NORMAL;` and `PRAGMA foreign_keys = ON;` returns `[]` with 0 errors.

---

### 1.2 Direct Observation: Permissive Sign Parsing & Infix Defect (`src/modules/currency/index.ts`)
- **File & Lines**: `src/modules/currency/index.ts`, lines 69-86:
  ```typescript
  let isNegative = false;
  if (raw.startsWith("(") && raw.endsWith(")")) {
    isNegative = true;
    raw = raw.slice(1, -1).trim();
  } else if (raw.includes("-")) {
    const minusMatches = raw.match(/-/g);
    if (minusMatches && minusMatches.length === 1) {
      isNegative = true;
      raw = raw.replace("-", "").trim();
    } else {
      throw new TypeError(
        `Formato monetário contém múltiplos sinais negativos: '${val}'`
      );
    }
  } else if (raw.includes("+")) {
    raw = raw.replace(/\+/g, "").trim();
  }
  ```
- **Defects Observed**:
  1. `raw.replace(/\+/g, "")` blindly strips all `+` occurrences anywhere in the string:
     - Input `"++10"` becomes `"10"` and evaluates to `1000` centavos instead of throwing `TypeError`.
     - Input `"1+0"` becomes `"10"` and evaluates to `1000` centavos instead of throwing `TypeError`.
     - Input `"10+20"` becomes `"1020"` and evaluates to `102000` centavos instead of throwing `TypeError`.
  2. `raw.replace("-", "")` strips the single `-` anywhere in the string and sets `isNegative = true`:
     - Input `"1-0"` becomes `"10"` and evaluates to `-1000` (-R$ 10,00) instead of throwing `TypeError`.
     - Input `"10-20"` becomes `"1020"` and evaluates to `-102000` (-R$ 1.020,00) instead of throwing `TypeError`.
  3. Lack of symmetry: `"--10"` throws `TypeError`, but `"++10"` succeeds.

---

### 1.3 Direct Observation: Test Interdependence (`tests/unit/currency.stress.test.ts`)
- **File & Lines**: `tests/unit/currency.stress.test.ts`, lines 282-294:
  ```typescript
  it("empirically demonstrates the permissive sign parsing vulnerability", () => {
    // Multiple plus signs: "++10" is silently accepted as 1000 centavos instead of throwing TypeError
    const multiPlusResult = brlToCentavos("++10");
    expect(multiPlusResult).toBe(1000);

    // Embedded plus: "1+0" is accepted as 1000 centavos
    const embeddedPlusResult = brlToCentavos("1+0");
    expect(embeddedPlusResult).toBe(1000);

    // Embedded minus: "1-0" is accepted as -1000 centavos
    const embeddedMinusResult = brlToCentavos("1-0");
    expect(embeddedMinusResult).toBe(-1000);
  });
  ```
- **Critical Coupling**:
  Challenger 1 authored this test to demonstrate the presence of the vulnerability in the unpatched code. If the worker patches `src/modules/currency/index.ts` to strictly reject `"++10"`, `"1+0"`, and `"1-0"`, this test will throw `TypeError` and cause `pnpm test` to FAIL unless the test assertion is updated to `expect(() => brlToCentavos("++10")).toThrow(TypeError)`.

---

## 2. Logic Chain

1. **Prisma SQLite Contract** (from Observation 1.1):
   - SQLite PRAGMAs `journal_mode = WAL;` and `busy_timeout = 5000;` return tabular rows in SQLite.
   - Prisma's Query Engine strictly prohibits result-bearing queries under `$executeRawUnsafe`, throwing `P2010 (Execute returned results, which is not allowed in SQLite)`.
   - Wrapping in `.catch()` logs an ugly error to stdout/stderr and silently fails to configure `busy_timeout = 5000`, leaving connections prone to `SQLITE_BUSY` contention during transaction bursts.
   - Changing `$executeRawUnsafe` to `$queryRawUnsafe` allows row returns, completely eliminating the `P2010` exception and cleanly configuring `journal_mode = WAL` and `busy_timeout = 5000`.

2. **Currency Sign Grammar Contract** (from Observation 1.2):
   - Valid monetary representations allow a sign `+` or `-` ONLY in two grammatical positions:
     1. Leading prefix before currency symbol: `^[+-]\s*(R\$|\$|BRL)?` (e.g. `+ R$ 1.234,56`, `- R$ 1.234,56`, `+10`, `-10`).
     2. Leading prefix after currency symbol: `^(R\$|\$|BRL)\s*[-+]` (e.g. `R$ +1.234,56`, `R$ -1.234,56`).
     3. Accounting parentheses: `^\(.*\)$` where no additional signs are allowed inside.
   - Signs inside numbers (infix, e.g. `1+0`, `1-0`, `10+20`) or repeated signs (`++10`, `--10`, `+-10`) are malformed syntax and must be rejected with `TypeError`.
   - By counting `(raw.match(/-/g) || []).length + (raw.match(/\+/g) || []).length > 1` and validating prefix position with `RegExp`, both `+` and `-` achieve symmetric, defensive parsing.

3. **Test Harmonization Contract** (from Observation 1.3):
   - The test in `currency.stress.test.ts` was written as an empirical demonstration of the permissive parser flaw.
   - When the worker applies the strict fix in `currency/index.ts`, the proof test must be converted into a hardening regression test (`expect(() => brlToCentavos(...)).toThrow(TypeError)`).
   - This ensures `pnpm test` runs 100% clean with all 55 tests passing and zero regressions.

---

## 3. Caveats

1. **Read-Only Investigation**: As an explorer subagent, no source files were directly altered. The complete drop-in replacement code is provided in this handoff for `m1_worker_1` to execute.
2. **Database State**: `prisma/dev.db` already has `journal_mode = wal` persisted in its database header, but applying `$queryRawUnsafe` in `src/lib/prisma.ts` is mandatory for new deployments, fresh databases, and configuring `busy_timeout = 5000` per connection.
3. **Minor Floating-Point Issue in `multiplyMoney`**: Reviewer 2 noted `multiplyMoney(100, 1.005)` evaluates to `100` rather than `101` due to binary float representation `100.49999999999999`. While `Math.round(centavos * qty)` satisfies all current requirements and tests, a minor refinement `Math.round(Math.round(centavos * qty * 1e6) / 1e6)` could be applied if sub-cent precision is needed.

---

## 4. Conclusion & Actionable Blueprint for M1 Worker

The plan is divided into three concrete, surgical actions:

### Action 1: Surgical Fix in `src/lib/prisma.ts`
Replace lines 20-43 in `src/lib/prisma.ts`:

```typescript
  if (isSqlite) {
    // Aplica pragmas de alta concorrência e integridade para SQLite via $queryRawUnsafe
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

    client
      .$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA synchronous=NORMAL:", err)
      );

    client
      .$queryRawUnsafe(`PRAGMA foreign_keys = ON;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA foreign_keys=ON:", err)
      );
  }
```

---

### Action 2: Surgical Fix in `src/modules/currency/index.ts`
Replace lines 68-86 in `src/modules/currency/index.ts`:

```typescript
  // Detecção e validação estrita de sinais (+ e -) e formato contábil "(...)"
  let isNegative = false;
  if (raw.startsWith("(") && raw.endsWith(")")) {
    isNegative = true;
    raw = raw.slice(1, -1).trim();
  }

  const minusMatches = raw.match(/-/g);
  const plusMatches = raw.match(/\+/g);
  const minusCount = minusMatches ? minusMatches.length : 0;
  const plusCount = plusMatches ? plusMatches.length : 0;

  if (minusCount + plusCount > 1) {
    throw new TypeError(
      `Formato monetário contém múltiplos sinais (+/-): '${val}'`
    );
  }

  if (isNegative && (minusCount > 0 || plusCount > 0)) {
    throw new TypeError(
      `Formato monetário contém sinal duplicado ou conflitante com parênteses: '${val}'`
    );
  }

  if (minusCount === 1 || plusCount === 1) {
    // Sinal deve obrigatoriamente estar no início ou imediatamente após o símbolo da moeda
    const isPrefix =
      /^[-+]\s*(R\$|\$|BRL)?/i.test(raw) ||
      /^(R\$|\$|BRL)\s*[-+]/i.test(raw);
    if (!isPrefix) {
      throw new TypeError(
        `Formato monetário contém sinal (+/-) em posição inválida: '${val}'`
      );
    }
    if (minusCount === 1) {
      isNegative = true;
    }
    raw = raw.replace(/[-+]/, "").trim();
  }
```

---

### Action 3: Convert Vulnerability Test to Regression Test in `tests/unit/currency.stress.test.ts`
Replace lines 274-295 in `tests/unit/currency.stress.test.ts`:

```typescript
    it("verifies that malformed and permissive signs are strictly rejected with TypeError", () => {
      // Multiple plus signs: "++10" must throw TypeError
      expect(() => brlToCentavos("++10")).toThrow(TypeError);

      // Embedded/infix plus: "1+0" must throw TypeError
      expect(() => brlToCentavos("1+0")).toThrow(TypeError);

      // Embedded/infix minus: "1-0" must throw TypeError
      expect(() => brlToCentavos("1-0")).toThrow(TypeError);
    });
```
(Additionally, add `"10+20"`, `"10-20"`, `"10+"`, `"10-"` to `strictlyRejectedMaliciousInputs` if desired).

---

## 5. Verification Method

Once `m1_worker_1` executes Actions 1, 2, and 3, execute the following commands in sequence:

### Command 1: Full Test Suite
```powershell
pnpm test
```
- **Success Criteria**:
  - Exits with code 0.
  - All test files pass: `currency.test.ts` (40 passed), `currency.stress.test.ts` (12 passed), `database-concurrency-fk.test.ts` (3 passed) — total 55/55 passed.
  - **CRITICAL**: The output must contain **ZERO** occurrences of `P2010` and **ZERO** occurrences of `Invalid prisma.$executeRawUnsafe() invocation`.

### Command 2: TypeScript Strict Compilation
```powershell
npx tsc --noEmit
```
- **Success Criteria**:
  - Exits with code 0.
  - 0 syntax or type errors.

### Command 3: Direct Runtime Prisma Singleton Verification
```powershell
npx tsx -e "import prisma from './src/lib/prisma'; async function v() { const [w, b] = await Promise.all([prisma.`$queryRawUnsafe('PRAGMA journal_mode;'), prisma.`$queryRawUnsafe('PRAGMA busy_timeout;')]); console.log('PRAGMAS:', { w, b }); await prisma.`$disconnect(); } v();"
```
- **Success Criteria**:
  - Exits with code 0.
  - Prints: `{ w: [ { journal_mode: 'wal' } ], b: [ { timeout: 5000n } ] }`.
  - Zero warnings or errors logged to stderr/stdout.

### Invalidation Conditions:
- If `pnpm test` prints any `P2010` error: Action 1 was not applied correctly.
- If `currency.stress.test.ts` fails on line 282: Action 3 was not updated alongside Action 2.
- If `brlToCentavos("+ R$ 1.234,56")` throws: regex prefix in Action 2 was modified incorrectly.
