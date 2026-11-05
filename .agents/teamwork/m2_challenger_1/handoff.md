# M2 File Fuzzing Challenger - Empirical Stress Test Handoff Report

## 1. Observation

Direct empirical observations from executing adversarial tests against `src/modules/parser-p7/index.ts`:

### A. Test Harness & Execution
Command executed:
```bash
npx vitest run tests/unit/parser-p7.adversarial.test.ts
```
Results:
- 23 adversarial tests executed across 5 test suites.
- 23 tests passed (including targeted vulnerability verification tests).

### B. Vulnerability 1: Uncaught `RangeError` on Extreme Number Overflow (Crash)
- **File**: `src/modules/parser-p7/index.ts:747`
- **Code snippet**:
  ```typescript
  // Calculate item total in integer cents
  const totalCentavos = multiplyMoney(unitarioCentavos, quantidade);
  ```
- **Observed Behavior**:
  While `brlToCentavos` at line 708 is wrapped in `try { ... } catch`, the multiplication `multiplyMoney` at line 747 is **not** wrapped in a `try/catch`.
  When a row contains an extreme quantity (e.g., `100000000000000`), `multiplyMoney` in `src/modules/currency/index.ts:359` throws:
  ```
  RangeError: Multiplicação monetária excede MAX_SAFE_INTEGER: 10000 * 100000000000000
  ```
- **Verbatim Error Output Captured**:
  ```
  stdout | tests/unit/parser-p7.adversarial.test.ts > 3.1 EMPIRICAL VULNERABILITY CHECK: Uncaught RangeError on extreme quantity overflow
  3.1 caughtError: RangeError Multiplicação monetária excede MAX_SAFE_INTEGER: 10000 * 100000000000000
  ```
- **Impact**: The raw `RangeError` escapes `parseModelP7File` uncaught. Instead of gracefully quarantining the overflowing row with `code: "INVALID_QUANTITY"` or `code: "OVERFLOW"`, the entire parsing process terminates abruptly, abandoning all other valid rows.

### C. Vulnerability 2: Uncaught `RangeError` on Grand Total Accumulation
- **File**: `src/modules/parser-p7/index.ts:822-825`
- **Code snippet**:
  ```typescript
  // Grand total calculation in integer cents
  const valorTotalGeralCentavos = items.reduce(
    (acc, item) => addMoney(acc, item.totalCentavos),
    0
  );
  ```
- **Observed Behavior**:
  If the cumulative total of items exceeds `Number.MAX_SAFE_INTEGER`, `addMoney` throws:
  ```
  RangeError: Overflow monetário ao somar 5000000000000000 + 5000000000000000
  ```
  This is not handled or protected at line 822.

### D. Limitation 3: Preamble Header Scan Window Capped at 25 Rows
- **File**: `src/modules/parser-p7/index.ts:303`
- **Code snippet**:
  ```typescript
  export function detectP7Header(rows: unknown[][]): HeaderDetectionResult {
    const maxScan = Math.min(25, rows.length);
  ```
- **Observed Behavior**:
  - Preamble with 24 administrative lines (header at row 25, index 24): **PASSED** (`result.headerRowIndex == 24`).
  - Preamble with 25+ administrative lines (e.g. 50 lines before table header): **FAILED** with:
    `HEADER_NOT_FOUND: Cabeçalho do Modelo P7 não encontrado nas primeiras 25 linhas.`
- **Impact**: Files with extensive administrative headers (e.g. corporate opening terms, multiple addresses, audit declarations) are rejected even when the table structure is 100% valid.

### E. Robust Areas Observed
- **Corrupted CSVs**: Handles unmatched quotes in headers (graceful `HEADER_NOT_FOUND`), unmatched quotes in cells (isolated to quarantine), unmatched quotes at EOF (parsed without error).
- **Binary Fuzzing**: Rejects 1KB and 10KB of random binary fuzzing as `.csv` and `.xlsx` without unhandled crashes.
- **Null Bytes & Long Strings**: Handles `\0` null bytes and 50,000-character descriptions without crashing.
- **Trailing Lines**: Cleanly stops after 3 consecutive empty/semicolon rows without ghost items.
- **Missing Barcodes**: Correctly parses produce/bulk items with `barras: null` and emits `MISSING_BARCODE` warning in quarantine.
- **Zero Values**: Correctly parses 0 price (`unitarioCentavos: 0`) and 0 quantity (`quantidade: 0`) with WARNING in quarantine.
- **Negative Values**: Properly quarantined as ERROR.
- **Malformed NCMs**: Stored safely as strings without crashing.
- **File Extensions**: Correctly recognizes `.CSV`, `.XLSX`, `.Xlsx`, `.CsV`.

---

## 2. Logic Chain

1. **Premise 1 (Requirement R2 & Dispatch Mandate)**:
   "Verify that the parser NEVER crashes or throws uncaught exceptions on malformed files, gracefully returning structured quarantine errors or throwing descriptive user-facing errors."
2. **Premise 2 (Observation B & C)**:
   Calling `multiplyMoney(unitarioCentavos, quantidade)` at line 747 without a try/catch block allows a JavaScript runtime `RangeError` to escape whenever `unitarioCentavos * quantidade > Number.MAX_SAFE_INTEGER`.
3. **Premise 3 (Deduction)**:
   An extreme numeric quantity in a spreadsheet row causes an unhandled crash of the parser rather than adding a row to `quarantine`, violating Premise 1.
4. **Premise 4 (Observation D & Feature F6)**:
   Feature F6 states "Dynamic Header Anchor Detection skipping administrative preamble". Hardcoding `maxScan = Math.min(25, rows.length)` causes files with 50 administrative rows to fail unnecessarily.

---

## 3. Caveats

- In standard retail operations, quantities rarely exceed millions, meaning `MAX_SAFE_INTEGER` overflow occurs primarily from corrupted/fuzzed data or barcode numbers inadvertently typed into quantity columns. However, under adversarial fuzzing and robustness specifications, this is a confirmed unhandled crash vector.
- The 25-row scan window was likely an optimization choice to prevent scanning thousands of data rows if a header is absent. Increasing this limit to 100 rows provides robustness against large preambles while keeping scan cost negligible (< 1ms).

---

## 4. Conclusion & Verdict

**Verdict: REQUEST_CHANGES**

### Required Remediation for M2 Worker:
1. **Wrap `multiplyMoney` in `try / catch` at line 747**:
   ```typescript
   let totalCentavos = 0;
   try {
     totalCentavos = multiplyMoney(unitarioCentavos, quantidade);
   } catch {
     quarantine.push({
       rowNumber,
       codigo: codigoRaw,
       discriminacao: descRaw,
       severity: "ERROR",
       code: "INVALID_QUANTITY",
       reason: `[INVALID_QUANTITY] Quantidade ou valor monetário excede limite seguro de cálculo (overflow): qtd='${qtdRaw}', unit='${unitRaw}'`,
       rawContent: row.join("; "),
     });
     continue;
   }
   ```
2. **Wrap or safeguard Grand Total aggregation at line 822-825**:
   Wrap `items.reduce` in `try / catch` to catch potential `RangeError` from `addMoney`, falling back to safe representation or informative error.
3. **Increase Header Scan Window from 25 to 100 rows at line 303**:
   Change `const maxScan = Math.min(25, rows.length);` to `const maxScan = Math.min(100, rows.length);` and update the error message to mention 100 lines.

---

## 5. Verification Method

To independently verify these findings and check fixes:

1. **Run Adversarial Vitest Suite**:
   ```bash
   npx vitest run tests/unit/parser-p7.adversarial.test.ts
   ```
2. **Inspect Vulnerability Lines**:
   - `src/modules/parser-p7/index.ts:747` (`multiplyMoney` call)
   - `src/modules/parser-p7/index.ts:822-825` (`items.reduce` / `addMoney` call)
   - `src/modules/parser-p7/index.ts:303` (`maxScan = Math.min(25, rows.length)`)
3. **Invalidation Condition**:
   If an extreme quantity row (e.g. `100000000000000`) is quarantined with `severity: "ERROR"` without crashing the parser, and files with 50-line preambles are recognized and parsed, this finding is resolved.
