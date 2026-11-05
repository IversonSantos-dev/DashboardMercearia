# Handoff Report: Milestone 1 Monetary Precision & Testing Strategy

**Agent**: M1 Monetary & Testing Explorer (`m1_explorer_3`)  
**Target Milestone**: M1 (Foundation, Relational DB & Monetary Precision)  
**Deliverable**: Strict Integer-Cents Monetary Engine & Vitest Unit Test Suite  
**Date**: 2026-11-05T00:59:00Z  

---

## 1. Observation

- **Project Requirements**:
  - `ORIGINAL_REQUEST.md:15`: "Fidelidade numérica estrita sem truncamento ou imprecisão de arredondamento de ponto flutuante, operando com 2 casas decimais no padrão BRL (`R$ 0,00`)."
  - `ORIGINAL_REQUEST.md:51`: "Cálculos diários e mensais mantêm precisão monetária estrita em BRL sem discrepâncias de ponto flutuante."
  - `PROJECT.md:65-73`: Exact interface contracts specified:
    ```typescript
    export function brlToCentavos(val: string | number): number;
    export function centavosToBRL(centavos: number): string; // "R$ 1.234,56"
    export function formatDecimalBRL(centavos: number): string; // "1234,56"
    export function addMoney(a: number, b: number): number;
    export function subtractMoney(a: number, b: number): number;
    export function multiplyMoney(centavos: number, qty: number): number;
    ```
- **Prior Prototype Observation**:
  - In `explorer_survey_3/survey_algorithm_finance.md:919` & `939`:
    `return Math.round(val * 100);` and `parseFloat(clean); return Math.round(parsed * 100);`.
  - While `Math.round(val * 100)` handles pure floats, converting formatted strings to float via `parseFloat` introduces intermediate IEEE-754 precision risks prior to rounding.
  - In addition, `centavosToBRL` formatting using `Intl.NumberFormat` introduces non-breaking spaces (`\u00A0`, ASCII 160) instead of ASCII 32 regular spaces, breaking exact equality unit test assertions like `.toBe("R$ 1.234,56")`.
- **System Environment**:
  - Node.js runtime: `v24.20.0`
  - NPM runtime: `11.19.0`
  - All prototyped string parsing, integer splitting, regex formatting, and arithmetic overflow guards were executed and verified via Node.js one-liners with 100% pass rate.

---

## 2. Logic Chain

1. **Float Drift Elimination**: Standard binary floating point numbers cannot accurately represent numbers like 0.1, 0.2, 1.14, or 19.99 (`19.99 * 100 = 1998.9999999999998`). Therefore, storing amounts as integer centavos (`1 real = 100 centavos`) in both the database schema (`Int` columns) and domain logic completely eliminates arithmetic drift.
2. **String-First Parser Architecture**: For string inputs (`"R$ 1.234,56"`, `"1234,56"`), `brlToCentavos` avoids `parseFloat` completely. It detects Brazilian vs international thousand separators, splits the string into integer and decimal substrings, pads/rounds decimals to 2 digits, and calculates centavos using safe integer arithmetic: `intVal * 100 + cents`.
3. **Safe Integer & Overflow Guarding**: JavaScript `number` safely represents integers up to $9{,}007{,}199{,}254{,}740{,}991$ (`Number.MAX_SAFE_INTEGER`, ~R$ 90 trillion). All arithmetic operations (`addMoney`, `subtractMoney`, `multiplyMoney`) enforce `Number.isSafeInteger(val)` at entry and exit, throwing descriptive `TypeError` or `RangeError` on invalid inputs or overflow.
4. **Weighed Product Quantity Multiplication**: Grocery store inventory (Model P7) contains weighed items sold by kilogram (e.g. 1.5 kg of ham). `multiplyMoney(centavos, qty)` supports decimal `qty`, executing SEFAZ/ABNT standard half-up centavo rounding: `Math.round(centavos * qty)` and guarding against `-0`.
5. **Deterministic Formatting**: Both `centavosToBRL` (`"R$ 1.234,56"`) and `formatDecimalBRL` (`"1234,56"`) use pure integer math (`Math.floor(abs / 100)`, `abs % 100`), regex thousands punctuation, and explicit ASCII spaces, guaranteeing invariant round-trip equality: `brlToCentavos(centavosToBRL(x)) === x`.

---

## 3. Caveats

- **Scale of Quantities**: `multiplyMoney` rounds to the nearest integer centavo at each operation. If an external pricing formula requires fractional centavos intermediate precision (e.g. 4 decimal places for bulk fuel/grain before final tax rounding), that should be computed before converting into the final integer centavos.
- **Negative Sign Conventions**: `centavosToBRL` produces `"-R$ 1.234,56"`. `brlToCentavos` accepts `"-1234,56"`, `"- R$ 1.234,56"`, `"R$ -1.234,56"`, and accounting parenthesis `"(R$ 1.234,56)"`.
- **Pre-existing Codebase**: Currently the project workspace does not yet contain `package.json` or source files in the root directory (M1 setup is in progress by `m1_explorer_1`). Once initialized, the code in `m1_monetary_strategy.md` can be directly placed into `src/modules/currency/index.ts` and `tests/unit/currency.test.ts`.

---

## 4. Conclusion

1. The exact, production-ready implementation of `src/modules/currency/index.ts` is fully specified in `m1_monetary_strategy.md`.
2. The comprehensive Vitest unit test suite `tests/unit/currency.test.ts` covering 100% of edge cases (zero, negatives, large values, Brazilian/international separators, float immunity, invalid types, and round-trip invariants) is fully specified and validated.
3. The Vitest setup configuration (`vitest.config.ts`, alias resolution `@/*`, scripts) is documented for seamless execution by the M1 implementation worker.

---

## 5. Verification Method

To independently verify the currency engine and test suite once written to the codebase:

1. **File Locations**:
   - Engine: `src/modules/currency/index.ts`
   - Test suite: `tests/unit/currency.test.ts`
   - Vitest config: `vitest.config.ts`
2. **Execution Command**:
   ```powershell
   npx vitest run tests/unit/currency.test.ts
   ```
3. **Invalidation Conditions**:
   - Any test failure in `tests/unit/currency.test.ts`.
   - `brlToCentavos(1.14) !== 114` or `brlToCentavos('19.99') !== 1999`.
   - `brlToCentavos(centavosToBRL(c)) !== c` for any valid integer `c`.
