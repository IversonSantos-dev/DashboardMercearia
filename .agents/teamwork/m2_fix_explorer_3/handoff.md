# M2 Fix Explorer 3 - Holistic Regression & Adversarial Suite Analysis Report

**Role**: Holistic Regression & Adversarial Suite Explorer  
**Working Directory**: `.agents/teamwork/m2_fix_explorer_3/`  
**Execution Timestamp**: 2026-11-05T02:14:00Z  

---

## 1. Observation

### A. Current Test Suite Baseline
Execution of the full test suite (`npx vitest run`) yielded:
```text
Test Files  11 passed (11)
     Tests  197 passed (197)
  Duration  5.70s
```
Breakdown across modules:
- `tests/unit/currency.test.ts`: 40 passed
- `tests/unit/currency.stress.test.ts`: 2 passed
- `tests/unit/parser-p7.test.ts`: 28 passed
- `tests/unit/parser-p7.adversarial.test.ts`: 23 passed
- `tests/integration/database-concurrency-fk.test.ts`: 3 passed
- `tests/integration/inventory-import.test.ts`: 12 passed
- `tests/integration/m2-adversarial-ingestion.test.ts`: 7 passed
- `tests/e2e/tier1-feature-coverage.test.ts`: 40 passed
- `tests/e2e/tier2-boundary-corner.test.ts`: 25 passed
- `tests/e2e/tier3-cross-feature.test.ts`: (loaded / skipped M3/M4)
- `tests/e2e/tier4-real-world-scenarios.test.ts`: 3 passed

---

### B. Critical Discovery: The 5 Adversarial Vulnerability-Proving Tests
In `tests/unit/parser-p7.adversarial.test.ts`, Challenger 1 introduced 23 tests. While all 23 currently pass, **5 of these tests specifically assert the existing defective or restricted behavior**:

1. **Test 3.1** (`lines 191-217`):
   ```typescript
   // Asserts that extreme quantity causes an uncaught RangeError crash:
   expect(caughtError).toBeInstanceOf(RangeError);
   expect(caughtError.message).toContain("MAX_SAFE_INTEGER");
   ```
2. **Test 3.8** (`lines 297-326`):
   ```typescript
   // Asserts that grand total accumulation throws uncaught RangeError:
   expect(caughtError).toBeInstanceOf(RangeError);
   expect(caughtError.message).toContain("Overflow monetário ao somar");
   ```
3. **Test 2.1** (`lines 129-158`):
   ```typescript
   // Asserts that CSV with 50 preamble lines FAILS to parse with HEADER_NOT_FOUND:
   expect(errorThrown).not.toBeNull();
   expect(errorThrown.message).toContain("HEADER_NOT_FOUND");
   expect(errorThrown.message).toContain("primeiras 25 linhas");
   ```
4. **Test 2.2** (`lines 159-185`):
   ```typescript
   // Asserts that XLSX with 50 preamble lines FAILS to parse with HEADER_NOT_FOUND:
   expect(errorThrown).not.toBeNull();
   expect(errorThrown.message).toContain("HEADER_NOT_FOUND");
   expect(errorThrown.message).toContain("primeiras 25 linhas");
   ```
5. **Test 4.2** (`lines 346-358`):
   ```typescript
   // Asserts that header at row 26 (index 25) FAILS with HEADER_NOT_FOUND:
   await expect(parseModelP7File(buffer, "header_row_26.csv")).rejects.toThrow(
     /HEADER_NOT_FOUND|primeiras 25 linhas/i
   );
   ```

**Impact**: When the M2 Fix Worker applies the fixes from Explorer 1 (`multiplyMoney`/`addMoney` overflow wrap) and Explorer 2 (`maxScan = 100` and early break), **all 5 of these tests will FAIL** because the parser will now correctly quarantine overflowing items and parse 50-row preambles without throwing `RangeError` or `HEADER_NOT_FOUND`.

---

### C. Regression Analysis Across the Non-Adversarial Suites (174 Tests)
1. **`tests/unit/parser-p7.test.ts` (28 tests)**:
   - All standard fixtures (Fixtures 1 to 6) have preamble lengths between 0 and 12 rows (well within `maxScan = 100`).
   - Line 323 asserts `/HEADER_NOT_FOUND|cabeçalho/i`, which continues to match the new error message mentioning `"primeiras 100 linhas"`.
   - **Verdict**: 100% PASS, ZERO regression.
2. **`tests/integration/inventory-import.test.ts` (12 tests)**:
   - Synthetic fixtures have headers at rows 0..3.
   - Non-multipart (400), unsupported extension (400), and corrupted buffer (422) tests do not depend on the 25-row boundary.
   - **Verdict**: 100% PASS, ZERO regression.
3. **`tests/integration/m2-adversarial-ingestion.test.ts` (7 tests)**:
   - Evaluated by Challenger 2 (VERDICT: APPROVE). Tests 600 items, 1,200 items, idempotency, atomic rollback on trigger abort, and concurrency.
   - Header is located at row 3 (`rows[3]`), hitting early break on score 5 in < 0.05ms.
   - **Verdict**: 100% PASS, ZERO regression.
4. **`tests/e2e/tier*.test.ts` (68 tests)**:
   - Preambles in `tier1-feature-coverage.test.ts:264-285` are 6 rows long.
   - **Verdict**: 100% PASS, ZERO regression.

---

## 2. Logic Chain

1. **Step 1 (Root Cause of Potential False Failures)**:
   Challenger 1 created adversarial tests that empirically demonstrated the crash vectors. Because the test assertions expected `RangeError` and `HEADER_NOT_FOUND (primeiras 25 linhas)`, remediating the underlying code without updating the test expectations transforms bug fixes into test suite failures.
2. **Step 2 (Co-Evolution of Code and Tests)**:
   The M2 Fix Worker must treat both `src/modules/parser-p7/index.ts` and `tests/unit/parser-p7.adversarial.test.ts` as interdependent deliverables. The tests must be updated from "vulnerability proofs" to "specification assertions".
3. **Step 3 (Safety of Expanded Header Scan Window)**:
   Explorer 2 confirmed via benchmark that early exit (`if (score === PRIMARY_ANCHORS.length) break;`) reduces scan time on standard files to **0.015ms**, and worst-case 100-row scan to **0.70ms**, strictly complying with the < 2ms performance threshold.
4. **Step 4 (Safety of Overflow Quarantine)**:
   Wrapping `multiplyMoney` in `try / catch` ensures arithmetic overflows are contained inside `quarantine` with `severity: "ERROR"` and `code: "INVALID_QUANTITY"`, allowing remaining valid items to be ingested cleanly without aborting the batch.
5. **Step 5 (Grand Total Accumulation Protection)**:
   Wrapping grand total `items.reduce` with `addMoney` in `try / catch` throwing a clean `Error("OVERFLOW: ...")` prevents unhandled runtime aborts while protecting downstream systems from invalid financial aggregation.

---

## 3. Caveats

1. **In-file duplicate consolidation in `src/app/api/inventario/import/route.ts:125`**:
   The import route also calls `multiplyMoney(existing.unitarioCentavos, existing.quantidade)` during duplicate aggregation. If multiple rows duplicate the same code and exceed `MAX_SAFE_INTEGER`, wrapping this in `try / catch` inside the route is an additional defensive measure.
2. **Adversarial Test Naming**:
   When updating `tests/unit/parser-p7.adversarial.test.ts`, the test descriptions in tests 2.1, 2.2, 3.1, 3.8, and 4.2 should be rephrased from "EMPIRICAL VULNERABILITY CHECK" to reflect the verified invariant (e.g., "should gracefully quarantine row on extreme quantity overflow without crashing").

---

## 4. Conclusion & Action Plan for M2 Fix Worker

The M2 Fix Worker must perform edits across exactly **two files**:

### Deliverable 1: `src/modules/parser-p7/index.ts`
1. **Header Detection Scan Limit & Early Exit** (around line 302-340):
   - Update `detectP7Header(rows: unknown[][], maxScan: number = 100): HeaderDetectionResult`
   - Use `const scanLimit = Math.min(maxScan, rows.length);`
   - Add early exit: `if (score === PRIMARY_ANCHORS.length) break;`
2. **Descriptive Header Error Message** (line 593-597):
   - Change `"primeiras 25 linhas"` to `"primeiras 100 linhas"`.
3. **Item-Level Arithmetic Overflow Quarantine** (line 746-750):
   - Wrap `multiplyMoney(unitarioCentavos, quantidade)` in `try / catch`.
   - On error, push to `quarantine` with `severity: "ERROR"`, `code: "INVALID_QUANTITY"`, descriptive message, and `continue;`.
4. **Grand Total Overflow Protection** (line 821-825):
   - Wrap `items.reduce` / `addMoney` in `try / catch`, throwing `Error("OVERFLOW: Valor total geral do inventário excede o limite numérico seguro suportado.")`.

---

### Deliverable 2: `tests/unit/parser-p7.adversarial.test.ts`
The worker must update the 5 tests to reflect resolved requirements:

#### 1. Update Test 3.1 (lines 191-217):
```typescript
it("3.1 should gracefully quarantine row on extreme quantity overflow without crashing", async () => {
  const csv =
    validCsvHeader +
    "1001;7891001;Item Normal 1;UN;10;10,00;100,00\n" +
    "1002;7891002;Item Hiper Galático;UN;100000000000000;100,00;0,00\n" +
    "1003;7891003;Item Normal 3;UN;5;20,00;100,00\n";
  const buffer = Buffer.from(csv, "utf-8");

  const result = await parseModelP7File(buffer, "overflow_qty.csv");
  expect(result).toBeDefined();
  expect(result.items).toHaveLength(2);
  expect(result.items.map((i) => i.codigo)).toEqual(["1001", "1003"]);
  expect(
    result.quarantine.some(
      (q) => q.codigo === "1002" && q.code === "INVALID_QUANTITY" && q.severity === "ERROR"
    )
  ).toBe(true);
});
```

#### 2. Update Test 3.8 (lines 297-326):
```typescript
it("3.8 should reject with descriptive error if Grand Total accumulation exceeds MAX_SAFE_INTEGER", async () => {
  const csv =
    validCsvHeader +
    "7001;7897001;Item Mega 1;UN;50000000;1000000,00;0,00\n" +
    "7002;7897002;Item Mega 2;UN;50000000;1000000,00;0,00\n";
  const buffer = Buffer.from(csv, "utf-8");

  await expect(parseModelP7File(buffer, "grand_total_overflow.csv")).rejects.toThrow(
    /OVERFLOW|Overflow monetário|limite numérico/i
  );
});
```

#### 3. Update Test 2.1 (lines 129-158):
```typescript
it("2.1 CSV with 50 administrative preamble lines: successfully detects header up to 100 lines", async () => {
  let csv = "";
  csv += "Razão Social: Mercearia Teste Ltda\n";
  csv += "CNPJ: 12.345.678/0001-90\n";
  csv += "Data: 31/12/2025\n";
  csv += "Termo de Abertura do Livro Modelo P7\n";
  for (let i = 5; i <= 50; i++) {
    csv += `Linha administrativa de auditoria interna numero ${i} com dados diversos\n`;
  }
  csv += validCsvHeader;
  csv += validCsvRow;

  const buffer = Buffer.from(csv, "utf-8");
  const result = await parseModelP7File(buffer, "preambulo_50_linhas.csv");

  expect(result.headerRowIndex).toBe(50);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].codigo).toBe("1001");
});
```

#### 4. Update Test 2.2 (lines 159-185):
```typescript
it("2.2 XLSX with 50 administrative preamble lines: successfully detects header up to 100 lines", async () => {
  const rows: unknown[][] = [];
  rows.push(["Razão Social: Supermercado Fartura Ltda"]);
  rows.push(["CNPJ: 98.765.432/0001-10"]);
  rows.push(["Data do Inventário: 01/01/2026"]);
  for (let i = 4; i <= 50; i++) {
    rows.push([`Linha administrativa ${i}: Normas da Portaria SEFAZ nº ${i * 12}`]);
  }
  rows.push(["Código", "Barras", "Discriminação", "Unidade", "Qtd", "Unitário", "Total"]);
  rows.push(["5001", "7895001000015", "Azeite de Oliva Extra Virgem 500ml", "UN", 30, "32,90", "987,00"]);

  const buffer = createXlsxBuffer(rows);
  const result = await parseModelP7File(buffer, "preambulo_50_linhas.xlsx");

  expect(result.headerRowIndex).toBe(50);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].codigo).toBe("5001");
});
```

#### 5. Update Test 4.2 and Add Test 4.3 (lines 346-358):
```typescript
it("4.2 should successfully detect header at row 26 (index 25) with expanded window", async () => {
  let csv = "";
  for (let i = 1; i <= 25; i++) {
    csv += `Preamble row ${i}\n`;
  }
  csv += validCsvHeader; // row 26 (index 25)
  csv += validCsvRow;
  const buffer = Buffer.from(csv, "utf-8");

  const result = await parseModelP7File(buffer, "header_row_26.csv");
  expect(result.headerRowIndex).toBe(25);
  expect(result.items).toHaveLength(1);
});

it("4.3 fails with HEADER_NOT_FOUND if header is at row 101 (1 row beyond 100 maxScan limit)", async () => {
  let csv = "";
  for (let i = 1; i <= 100; i++) {
    csv += `Preamble row ${i}\n`;
  }
  csv += validCsvHeader; // row 101 (index 100)
  csv += validCsvRow;
  const buffer = Buffer.from(csv, "utf-8");

  await expect(parseModelP7File(buffer, "header_row_101.csv")).rejects.toThrow(
    /HEADER_NOT_FOUND|primeiras 100 linhas/i
  );
});
```

---

## 5. Verification Method

The M2 Fix Worker must execute the following sequential verification pipeline:

### Step 1: Type Checking
```powershell
npx tsc --noEmit
```
*Expected*: Zero diagnostic errors.

### Step 2: Unit Adversarial Suite
```powershell
npx vitest run tests/unit/parser-p7.adversarial.test.ts
```
*Expected*: All 24 tests pass (including new 100-row boundary test).

### Step 3: Standard Unit Parser Suite
```powershell
npx vitest run tests/unit/parser-p7.test.ts
```
*Expected*: All 28 tests pass across all 6 fixtures.

### Step 4: Integration Ingestion Adversarial Suite
```powershell
npx vitest run tests/integration/m2-adversarial-ingestion.test.ts
```
*Expected*: All 7 tests pass in under 5 seconds.

### Step 5: Standard API Import Integration Suite
```powershell
npx vitest run tests/integration/inventory-import.test.ts
```
*Expected*: All 12 tests pass.

### Step 6: Full Regression Run
```powershell
npx vitest run
```
*Expected*: All 11 test files and ~198 tests pass with 0 failures.

### Step 7: Database Cleanliness Inspection
```powershell
npx tsx -e "import prisma from './src/lib/prisma'; async function main() { console.log({ produtoCount: await prisma.produtoEstoque.count(), baixaCount: await prisma.historicoBaixa.count() }); } main().then(() => process.exit(0));"
```
*Expected*: `{ produtoCount: 0, baixaCount: 0 }`.

### Invalidation Conditions
- Any raw uncaught `RangeError` escaping `parseModelP7File`.
- Any regression in the existing 197 passing tests.
- Rejection of files containing preambles between 25 and 100 lines.
- Residual stress data remaining in `dev.db`.
