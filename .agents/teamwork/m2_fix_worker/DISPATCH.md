# Dispatch: M2 Fix Worker (Parser Robustness & Adversarial Synchronization)

## Objectives
Implement the fixes formulated by Explorers 1, 2, and 3 to resolve all findings from Challenger 1 and ensure 100% test pass with zero regressions.

## Mandate & Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Tasks

### 1. `src/modules/parser-p7/index.ts`
- **Header Scan Window & Early Exit**:
  - Update `detectP7Header(rows: unknown[][], maxScan: number = 100): HeaderDetectionResult`.
  - Use `const scanLimit = Math.min(maxScan, rows.length);`.
  - Add early-break: if `score === PRIMARY_ANCHORS.length`, immediately break the loop.
  - Update error message at line 593: `"HEADER_NOT_FOUND: Cabeçalho do Modelo P7 não encontrado nas primeiras 100 linhas. O arquivo deve conter colunas para Código, Barras, Discriminação, Quantidade e Valor Unitário."`.
- **Item-level Arithmetic Overflow Guard**:
  - At line 746-750, wrap `multiplyMoney(unitarioCentavos, quantidade)` in `try / catch`.
  - On catch, push an entry to `quarantine`:
    - `rowNumber`
    - `codigo: codigoRaw`
    - `discriminacao: descRaw`
    - `severity: "ERROR"`
    - `code: "INVALID_QUANTITY"`
    - `reason: "[INVALID_QUANTITY] Quantidade ou valor unitário excede o limite numérico seguro de cálculo: qtd='" + qtdRaw + "', unit='" + unitRaw + "'"`
    - `rawContent: row.join("; ")`
    - `continue;`
- **Grand Total Accumulation Guard**:
  - At line 821-826, wrap `items.reduce` / `addMoney` in `try / catch`:
    - On catch: set `valorTotalGeralCentavos = Number.MAX_SAFE_INTEGER` and push a `WARNING` to `quarantine` with `severity: "WARNING"`, `code: "TOTAL_MISMATCH"`, and reason: `"[TOTAL_OVERFLOW] O valor total geral acumulado de itens válidos excede o limite numérico seguro (MAX_SAFE_INTEGER). Valor consolidado limitado ao teto seguro."`.

### 2. `tests/unit/parser-p7.adversarial.test.ts`
Update the 5 tests that previously asserted bugs/limitations to assert the resilient behavior (per `.agents/teamwork/m2_fix_explorer_3/handoff.md` §4):
- **Test 3.1**: Assert that extreme quantity gracefully quarantines the item with `INVALID_QUANTITY` and `ERROR`, parsing the other valid items cleanly.
- **Test 3.8**: Assert that grand total overflow is safely guarded (`valorTotalGeralCentavos === Number.MAX_SAFE_INTEGER` and warning logged).
- **Test 2.1**: Assert that CSV with 50 preamble lines parses successfully (`headerRowIndex === 50`, `items.length === 1`).
- **Test 2.2**: Assert that XLSX with 50 preamble lines parses successfully (`headerRowIndex === 50`, `items.length === 1`).
- **Test 4.2 & 4.3**: Assert that header at row 26 (index 25) succeeds, and header at row 101 (index 100) fails with `HEADER_NOT_FOUND` mentioning `primeiras 100 linhas`.

### 3. Verification Sequence
Run and document in your handoff report:
1. `npx tsc --noEmit`
2. `npx vitest run tests/unit/parser-p7.adversarial.test.ts`
3. `npx vitest run tests/unit/parser-p7.test.ts`
4. `npx vitest run tests/integration/m2-adversarial-ingestion.test.ts`
5. `npx vitest run tests/integration/inventory-import.test.ts`
6. `pnpm test --fileParallelism=false` (full workspace test run)
7. `pnpm build`
8. Verify `dev.db` cleanliness.

Write your report to `.agents/teamwork/m2_fix_worker/handoff.md`.


## 2026-11-05T02:14:55Z
You are M2 Fix Worker.
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_worker
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_worker\DISPATCH.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_explorer_1\handoff.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_explorer_2\handoff.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_explorer_3\handoff.md

Implement the fixes in:
1. `src/modules/parser-p7/index.ts`
2. `tests/unit/parser-p7.adversarial.test.ts`

Follow the exact instructions and code patterns documented in DISPATCH.md and Explorer handoffs.
Run all verification commands (tsc, vitest, pnpm test, pnpm build).
Ensure dev.db has 0 synthetic records remaining.
Write your complete report with build and test command outputs to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_worker\handoff.md.
When complete, send a message with your handoff path and summary.
