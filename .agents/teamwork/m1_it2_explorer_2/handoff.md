# Investigation & Surgical Fix Strategy Report — Currency Sign Validation (`src/modules/currency/index.ts`)

## 1. Observation

### Current Implementation Defect in `src/modules/currency/index.ts`
At lines 68–86 of `src/modules/currency/index.ts`:

```typescript
68:   // Detecção de sinal negativo: formatos "-10", "- R$ 10", "R$ -10" ou contábil "(R$ 10)"
69:   let isNegative = false;
70:   if (raw.startsWith("(") && raw.endsWith(")")) {
71:     isNegative = true;
72:     raw = raw.slice(1, -1).trim();
73:   } else if (raw.includes("-")) {
74:     const minusMatches = raw.match(/-/g);
75:     if (minusMatches && minusMatches.length === 1) {
76:       isNegative = true;
77:       raw = raw.replace("-", "").trim();
78:     } else {
79:       throw new TypeError(
80:         `Formato monetário contém múltiplos sinais negativos: '${val}'`
81:       );
82:     }
83:   } else if (raw.includes("+")) {
84:     raw = raw.replace(/\+/g, "").trim();
85:   }
```

### Empirical Defect Manifestations
1. **Multiple Plus Signs**:
   - `brlToCentavos("++10")` strips both plus signs via `raw.replace(/\+/g, "")`, evaluating to `1000` centavos instead of throwing `TypeError`.
   - `brlToCentavos("+ + 10")` evaluates to `1000` centavos instead of throwing `TypeError`.
2. **Infix Operators**:
   - `brlToCentavos("10+20")` strips `+`, leaving `"1020"`, evaluating to `102000` centavos (R$ 1.020,00).
   - `brlToCentavos("10-20")`: `raw.match(/-/g)` finds 1 hyphen, flags `isNegative = true`, executes `raw.replace("-", "")`, leaving `"1020"`, evaluating to `-102000` centavos (-R$ 1.020,00).
3. **Trailing Signs**:
   - `brlToCentavos("10+")` evaluates to `1000` centavos.
   - `brlToCentavos("10-")` evaluates to `-1000` centavos.
4. **Parenthetical Format with Internal Signs**:
   - `brlToCentavos("(-10)")` or `brlToCentavos("(+10)")` are treated as valid numbers, whereas in accounting format parentheses denote negative amounts and should not contain additional internal signs.
5. **Challenger Test Suite State (`tests/unit/currency.stress.test.ts:282-294`)**:
   - Challenger 1 authored an empirical vulnerability demonstration test:
     ```typescript
     it("empirically demonstrates the permissive sign parsing vulnerability", () => {
       const multiPlusResult = brlToCentavos("++10");
       expect(multiPlusResult).toBe(1000);
       const embeddedPlusResult = brlToCentavos("1+0");
       expect(embeddedPlusResult).toBe(1000);
       const embeddedMinusResult = brlToCentavos("1-0");
       expect(embeddedMinusResult).toBe(-1000);
     });
     ```
     Once the fix is applied, this test must be updated to assert that these inputs throw `TypeError`.

---

## 2. Logic Chain

1. **Sign Count Constraint**:
   A valid monetary value can have at most one mathematical sign (`+` or `-`). If `plusCount + minusCount > 1` (e.g. `"++10"`, `"--10"`, `"+-10"`, `"-+10"`, `"+ + 10"`, `"- - 10"`, `"+10+20"`, `"-10-20"`), the input is malformed and must immediately throw `TypeError`.
2. **Sign Positional Constraint**:
   If exactly one sign is present (`plusCount + minusCount === 1`), that sign is valid **only** if it appears in a legitimate prefix position:
   - Position A: At the very beginning of the trimmed string (`raw.startsWith("+") || raw.startsWith("-")`), covering `"+10"`, `"-10"`, `"+ 10"`, `"- 10"`, `"+ R$ 10"`, `"- R$ 10"`, `"-10 R$"`, `"+10 R$"`.
   - Position B: Immediately following a recognized currency prefix (`/^(R\$|\$|BRL)\s*[+-]/i`), covering `"R$ +10"`, `"R$ -10"`, `"R$ + 10"`, `"R$ - 10"`, `"$ -10"`, `"BRL +10"`.
3. **Infix & Postfix Rejection**:
   Any sign that is neither at the start of the string nor immediately after the currency prefix is an infix sign (`"10+20"`, `"10-20"`, `"1+0"`, `"1-0"`, `"R$ 10+20"`, `"R$ 10-20"`) or a trailing sign (`"10+"`, `"10-"`, `"R$ 10+"`, `"10+ R$"`). If `!isLeadingSign`, it must immediately throw `TypeError`.
4. **Accounting Parentheses Invariant**:
   If a string is enclosed in accounting parentheses `raw.startsWith("(") && raw.endsWith(")")`, parentheses denote a negative quantity (`isNegative = true`). Any additional internal sign (`raw.includes("+") || raw.includes("-")`) indicates conflicting or double signs (`"(-10)"`, `"(+10)"`, `"(10-20)"`) and must throw `TypeError`.
5. **Empty Remainder Protection**:
   Stray signs like `"+"`, `"-"`, `"R$ +"`, `"R$ -"` reduce to an empty string once the prefix is stripped. Line 93 `if (!raw) throw new TypeError(...)` safely catches and rejects these.
6. **Preservation of Legitimate Cases**:
   All 28 valid Brazilian and international formats (including `"- R$ 1.234,56"`, `"R$ -1.234,56"`, `"+ R$ 1.234,56"`, `"R$ +1.234,56"`, `"(R$ 1.234,56)"`, `"-,50"`, `"+,50"`, `"-0,00"`) continue to parse with exact centavo precision and correct negative/positive signs.

---

## 3. Caveats

1. **Test Update in `tests/unit/currency.stress.test.ts`**:
   The empirical test at lines 282–294 currently asserts `expect(brlToCentavos("++10")).toBe(1000)`. When the worker applies the fix to `src/modules/currency/index.ts`, this test in `currency.stress.test.ts` will fail unless updated to expect `TypeError`.
2. **Complementary Hardening for `multiplyMoney`**:
   Reviewer 2 noted that floating-point quantity inputs like `multiplyMoney(100, 1.005)` can experience 1-ulp binary float truncation before `Math.round`. Pre-rounding with `Math.round(Math.round(centavos * qty * 1e6) / 1e6)` was suggested and can be applied during M1 Iteration 2.
3. **Read-Only Scope**:
   In compliance with the Explorer archetype, no source files were edited in `src/`. The complete proposed code replacement is provided below for the implementing worker.

---

## 4. Conclusion & Surgical Fix Proposal

### Target File: `src/modules/currency/index.ts`
**Target Lines**: 68–86

#### Before:
```typescript
  // Detecção de sinal negativo: formatos "-10", "- R$ 10", "R$ -10" ou contábil "(R$ 10)"
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

#### Proposed Replacement (Exact Drop-in):
```typescript
  // Detecção de sinal negativo/positivo e formato contábil "(R$ 10)"
  let isNegative = false;
  if (raw.startsWith("(") && raw.endsWith(")")) {
    isNegative = true;
    raw = raw.slice(1, -1).trim();
    if (raw.includes("+") || raw.includes("-")) {
      throw new TypeError(
        `Formato contábil entre parênteses não pode conter sinais adicionais: '${val}'`
      );
    }
  } else {
    const plusMatches = raw.match(/\+/g);
    const minusMatches = raw.match(/-/g);
    const plusCount = plusMatches ? plusMatches.length : 0;
    const minusCount = minusMatches ? minusMatches.length : 0;

    if (plusCount + minusCount > 1) {
      throw new TypeError(
        `Formato monetário contém múltiplos sinais: '${val}'`
      );
    }

    if (plusCount + minusCount === 1) {
      const isLeadingSign =
        raw.startsWith("+") ||
        raw.startsWith("-") ||
        /^(R\$|\$|BRL)\s*[+-]/i.test(raw);

      if (!isLeadingSign) {
        throw new TypeError(
          `Formato monetário contém sinal em posição inválida: '${val}'`
        );
      }

      if (raw.startsWith("+")) {
        raw = raw.slice(1).trim();
      } else if (raw.startsWith("-")) {
        isNegative = true;
        raw = raw.slice(1).trim();
      } else {
        const match = raw.match(/^(R\$|\$|BRL)\s*([+-])\s*/i);
        if (match) {
          if (match[2] === "-") {
            isNegative = true;
          }
          raw = raw.slice(match[0].length).trim();
        }
      }
    }
  }
```

### Accompanying Test Update: `tests/unit/currency.stress.test.ts`
**Target Lines**: 282–294

#### Replace:
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

#### With:
```typescript
    it("strictly rejects malformed plus signs and infix operators with TypeError", () => {
      expect(() => brlToCentavos("++10")).toThrow(TypeError);
      expect(() => brlToCentavos("+ + 10")).toThrow(TypeError);
      expect(() => brlToCentavos("1+0")).toThrow(TypeError);
      expect(() => brlToCentavos("1-0")).toThrow(TypeError);
      expect(() => brlToCentavos("10+20")).toThrow(TypeError);
      expect(() => brlToCentavos("10-20")).toThrow(TypeError);
      expect(() => brlToCentavos("10+")).toThrow(TypeError);
      expect(() => brlToCentavos("10-")).toThrow(TypeError);
      expect(() => brlToCentavos("R$ 10+20")).toThrow(TypeError);
      expect(() => brlToCentavos("R$ 10-20")).toThrow(TypeError);
      expect(() => brlToCentavos("(+10)")).toThrow(TypeError);
      expect(() => brlToCentavos("(-10)")).toThrow(TypeError);
    });
```

---

## 5. Verification Method

Once the worker implements the proposed replacement in `src/modules/currency/index.ts` and updates `tests/unit/currency.stress.test.ts`:

1. **Run full Vitest test suite**:
   ```powershell
   pnpm test
   ```
   *Expected*: All test suites (`currency.test.ts`, `currency.stress.test.ts`, `database-concurrency-fk.test.ts`) PASS (55+ tests green).

2. **Run targeted currency suite**:
   ```powershell
   npx vitest run tests/unit/currency.test.ts tests/unit/currency.stress.test.ts
   ```
   *Expected*: 100% PASS with 0 failures.

3. **Verify specific sign edge cases via node execution**:
   ```powershell
   pnpm exec tsx -e "
   import { brlToCentavos } from './src/modules/currency/index';
   const valids = ['+10', '-10', '+ R$ 10', '- R$ 10', 'R$ +10', 'R$ -10', '(R$ 10)', '-,50', '+,50'];
   for (const v of valids) { console.log(v, '=>', brlToCentavos(v)); }
   const invalids = ['++10', '--10', '+-10', '-+10', '10+20', '10-20', '10+', '10-', '(+10)', '(-10)'];
   for (const iv of invalids) {
     try { brlToCentavos(iv); console.error('FAILED TO REJECT:', iv); }
     catch (e) { console.log('CORRECTLY REJECTED:', iv, '=>', e.name); }
   }
   "
   ```
   *Expected*: All `valids` evaluate to correct centavos; all `invalids` throw `TypeError`.

4. **Verify TypeScript compilation**:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected*: Exit code 0, 0 errors.
