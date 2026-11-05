# M2 Fix Explorer 1 - Parser Overflow & Quarantine Remediation Report

## 1. Observation

### A. Direct Code Examination
1. **Target File**: `src/modules/parser-p7/index.ts`
   - **Line 747**:
     ```typescript
     // Calculate item total in integer cents
     const totalCentavos = multiplyMoney(unitarioCentavos, quantidade);
     ```
     Observed that `multiplyMoney` is called in the per-row parsing loop without an enclosing `try / catch` block.
   - **Line 822-825**:
     ```typescript
     // Grand total calculation in integer cents
     const valorTotalGeralCentavos = items.reduce(
       (acc, item) => addMoney(acc, item.totalCentavos),
       0
     );
     ```
     Observed that `addMoney` is called inside `items.reduce` without an enclosing `try / catch` block.

2. **Underlying Math Engine**: `src/modules/currency/index.ts`
   - **Line 347-366 (`multiplyMoney`)**:
     ```typescript
     const result = Math.round(centavos * qty);
     if (!Number.isSafeInteger(result)) {
       throw new RangeError(
         `Multiplicação monetária excede MAX_SAFE_INTEGER: ${centavos} * ${qty}`
       );
     }
     ```
     When `centavos * qty > Number.MAX_SAFE_INTEGER` (`9,007,199,254,740,991`), `multiplyMoney` throws a JavaScript `RangeError`.
   - **Line 313-324 (`addMoney`)**:
     ```typescript
     const sum = a + b;
     if (!Number.isSafeInteger(sum)) {
       throw new RangeError(`Overflow monetário ao somar ${a} + ${b}`);
     }
     ```
     When `a + b > Number.MAX_SAFE_INTEGER`, `addMoney` throws a JavaScript `RangeError`.

3. **Current Quarantine Type Definition**: `src/modules/parser-p7/index.ts:32-46`
   - `P7IssueSeverity`: `"WARNING" | "ERROR"`
   - `P7IssueCode`: includes `"INVALID_QUANTITY"` and `"TOTAL_MISMATCH"`.

4. **Empirical Reproduction from Adversarial Test Suite**:
   Command:
   ```bash
   npx vitest run tests/unit/parser-p7.adversarial.test.ts
   ```
   Verbatim output captured from test execution:
   ```text
   stdout | tests/unit/parser-p7.adversarial.test.ts > Model P7 Parser - Adversarial Stress & Fuzzing Suite > 3. Extreme Numbers & Value Edge Cases > 3.1 EMPIRICAL VULNERABILITY CHECK: Uncaught RangeError on extreme quantity overflow
   3.1 caughtError: RangeError Multiplicação monetária excede MAX_SAFE_INTEGER: 10000 * 100000000000000

   stdout | tests/unit/parser-p7.adversarial.test.ts > Model P7 Parser - Adversarial Stress & Fuzzing Suite > 3. Extreme Numbers & Value Edge Cases > 3.8 EMPIRICAL VULNERABILITY CHECK: Uncaught RangeError on Grand Total accumulation overflow
   3.8 Grand Total Overflow caughtError: RangeError Overflow monetário ao somar 5000000000000000 + 5000000000000000
   ```

5. **API Ingestion Impact**: `src/app/api/inventario/import/route.ts:84-94`
   When `parseModelP7File` throws an unhandled `RangeError`, the entire HTTP request fails with status 422:
   ```json
   {
     "success": false,
     "error": "Multiplicação monetária excede MAX_SAFE_INTEGER: 10000 * 100000000000000"
   }
   ```
   All valid items in the file are discarded, and the user receives a raw JavaScript runtime error instead of structured quarantine feedback.

---

## 2. Logic Chain

1. **Premise 1 (Contract & Requirement R2)**:
   In Brazilian Fiscal Inventory Book Model P7 processing, corrupted or extreme rows must be quarantined gracefully without crashing the parsing process (`quarantine` array with `severity: 'ERROR'`). Valid rows must continue to be parsed and made available for preview and import.
2. **Premise 2 (Observation 1 & 4)**:
   An extreme value in a spreadsheet's quantity column (e.g. `100000000000000`) or unit price column triggers `multiplyMoney` to throw a `RangeError`. Because line 747 in `src/modules/parser-p7/index.ts` is not enclosed in a `try / catch` block, the exception escapes `parseModelP7File`.
3. **Premise 3 (Deduction)**:
   Wrapping `multiplyMoney` in a `try / catch` block at line 747 and pushing a structured issue to `quarantine` with `severity: 'ERROR'` and `code: 'INVALID_QUANTITY'` allows the parser to discard the corrupt row and proceed (`continue`) with remaining rows.
4. **Premise 4 (Observation 2 & 4)**:
   If the cumulative sum of multiple valid items exceeds `Number.MAX_SAFE_INTEGER`, `addMoney` throws `RangeError` at lines 822-825.
5. **Premise 5 (Deduction)**:
   Wrapping `items.reduce` with `try / catch` protects grand total aggregation, capping `valorTotalGeralCentavos` at `Number.MAX_SAFE_INTEGER` and recording a `WARNING` in `quarantine` so that the returned object conforms strictly to the `P7ParseResult` schema and is 100% JSON-serializable.

---

## 3. Caveats

- **No Caveats on Root Cause**: The arithmetic overflow triggers and failure call stacks are fully reproduced and deterministic.
- **Test Alignment Caveat**: In `tests/unit/parser-p7.adversarial.test.ts`, tests 3.1 and 3.8 were deliberately authored by `m2_challenger_1` to expect an unhandled `RangeError` (to empirically prove the vulnerability). Once the implementer applies the fix, those two tests must be updated to assert that `parseModelP7File` succeeds, quarantining row 2 with `INVALID_QUANTITY` and safely capping the grand total.
- **Preamble Scan Window (Limitation 3 from Challenger)**: `detectP7Header` at line 303 scans up to 25 rows (`Math.min(25, rows.length)`). While increasing this to 100 is recommended for very long corporate preambles, it is separate from the arithmetic overflow mandate and should be coordinated with updating the 3 preamble boundary tests in `parser-p7.adversarial.test.ts`.

---

## 4. Conclusion & Recommended Fix Specification

### A. Recommended Change 1: Overflow Protection on `multiplyMoney`
- **File**: `src/modules/parser-p7/index.ts`
- **Location**: Line 746-748
- **Before**:
  ```typescript
  // Calculate item total in integer cents
  const totalCentavos = multiplyMoney(unitarioCentavos, quantidade);
  ```
- **After**:
  ```typescript
  // Calculate item total in integer cents with overflow guard
  let totalCentavos: number;
  try {
    totalCentavos = multiplyMoney(unitarioCentavos, quantidade);
  } catch {
    quarantine.push({
      rowNumber,
      codigo: codigoRaw,
      discriminacao: descRaw,
      severity: "ERROR",
      code: "INVALID_QUANTITY",
      reason: `[INVALID_QUANTITY] Quantidade ou valor unitário excede o limite numérico seguro de cálculo: qtd='${qtdRaw}', unit='${unitRaw}'`,
      rawContent: row.join("; "),
    });
    continue;
  }
  ```

### B. Recommended Change 2: Overflow Protection on Grand Total Accumulation
- **File**: `src/modules/parser-p7/index.ts`
- **Location**: Lines 821-826
- **Before**:
  ```typescript
  // Grand total calculation in integer cents
  const valorTotalGeralCentavos = items.reduce(
    (acc, item) => addMoney(acc, item.totalCentavos),
    0
  );
  ```
- **After**:
  ```typescript
  // Grand total calculation in integer cents with overflow guard
  let valorTotalGeralCentavos = 0;
  try {
    valorTotalGeralCentavos = items.reduce(
      (acc, item) => addMoney(acc, item.totalCentavos),
      0
    );
  } catch {
    valorTotalGeralCentavos = Number.MAX_SAFE_INTEGER;
    quarantine.push({
      rowNumber: 0,
      severity: "WARNING",
      code: "TOTAL_MISMATCH",
      reason:
        "[TOTAL_OVERFLOW] O valor total geral acumulado de itens válidos excede o limite numérico seguro (MAX_SAFE_INTEGER). Valor consolidado limitado ao teto seguro.",
    });
  }
  ```
  *(Note: Placed right before `const warnings = quarantine.filter((q) => q.severity === "WARNING");` so the warning is included automatically).*

### C. Test Updates for Implementer
In `tests/unit/parser-p7.adversarial.test.ts`:
1. **Update Test 3.1**:
   Change assertion from expecting `caughtError` to verifying that `result` is returned with `result.items.length === 2` and `result.quarantine.some(q => q.code === "INVALID_QUANTITY" && q.severity === "ERROR") === true`.
2. **Update Test 3.8**:
   Change assertion from expecting `RangeError` to verifying that `result.valorTotalGeralCentavos === Number.MAX_SAFE_INTEGER` and `result.warnings.some(w => w.reason.includes("TOTAL_OVERFLOW")) === true`.

---

## 5. Verification Method

### 1. Test Execution Commands
Run the parser test suites:
```bash
npx vitest run tests/unit/parser-p7.test.ts tests/unit/parser-p7.adversarial.test.ts
```
Expected: All 51 unit tests pass.

Run integration tests:
```bash
npx vitest run tests/integration/inventory-import.test.ts tests/integration/m2-adversarial-ingestion.test.ts
```
Expected: All 19 integration tests pass.

### 2. Manual Verification Snippet
Execute a node/ts-node script parsing a buffer containing:
```csv
Código;Barras;Discriminação;Unidade;Qtd;Unitário;Total
1001;7891001;Item Normal;UN;10;10,00;100,00
1002;7891002;Item Overflow;UN;100000000000000;100,00;0,00
1003;7891003;Item Normal 2;UN;5;20,00;100,00
```
Verify that:
- Parser resolves without throwing an unhandled exception.
- `result.items` contains exactly 2 items (1001 and 1003).
- `result.quarantine` contains 1 item for row 3 (item 1002) with `severity: "ERROR"` and `code: "INVALID_QUANTITY"`.

### 3. Invalidation Condition
If calling `parseModelP7File` with an astronomical quantity throws an unhandled `RangeError` or if `INVALID_QUANTITY` is not recorded in `quarantine`, this remediation plan is invalidated.
