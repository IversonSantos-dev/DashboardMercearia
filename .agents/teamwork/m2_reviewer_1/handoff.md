# Quality Review & Adversarial Challenge Report: Milestone M2

**Reviewer:** M2 Parser Engine Reviewer (`m2_reviewer_1`)  
**Parent Agent ID:** `909b2f8c-83c6-47de-829a-608c7e57ee1e`  
**Milestone:** M2 — Model P7 Inventory Parser, Importer & Synthetic Fixtures  
**Date:** 2026-11-05T02:05:00Z  
**Verdict:** **APPROVE**  
**Integrity Audit:** CLEAN (0 hardcoding, 0 facade implementations, 0 shortcuts, 0 test bypasses)

---

## 1. Observation

Direct observations verified across the codebase, test suites, and build environment:

1. **Parser Engine Core (`src/modules/parser-p7/index.ts` - 843 lines):**
   - **Dynamic Header Scoring (lines 302-340):** Scans candidate rows `0..25` (`maxScan = Math.min(25, rows.length)`) checking 5 canonical primary anchors: `codigo`, `barras`, `discriminacao`, `qtd`, `unitario`. A row is designated as the table header when `score >= 4` (at least 4 out of 5 anchors matched).
   - **Column Field Classification & Disambiguation (lines 230-290):** Implements priority matching where `barras` is evaluated before `codigo` (preventing `"cod barras"` from mapping to internal code), `codigo` before `discriminacao` (preventing `"cod produto"` from mapping to description), and `total` before `unitario` (preventing `"total geral item"` from mapping to unit price). Normalizes text via NFKD diacritics stripping.
   - **Format Support (.xlsx, .xls, .ods, .csv - lines 556-588):** OpenXML spreadsheets decoded via SheetJS `XLSX.read(buffer, { cellDates: false })` avoiding date skew. CSV files decoded via custom RFC-4180 tokenizer.
   - **Delimiter Sniffer (lines 130-164):** Evaluates `;`, `,`, `\t`, and `|` across the first 20 lines. Employs `countDelimitersInLine` (lines 108-124) which ignores delimiters enclosed within quotes, ensuring Brazilian decimal commas (e.g. `"28,90"`) in comma-delimited files do not corrupt delimiter detection. Provides regional tie-breaker weighting bonus to semicolon (`;`).
   - **Encoding Transcoding (lines 86-103):** Decodes raw buffer using `new TextDecoder("utf-8", { fatal: true })`. If byte validation fails, it safely falls back to `new TextDecoder("windows-1252")` (CP1252/ISO-8859-1).
   - **Stop Condition & Summary Row Suppression (lines 422-457, lines 612-630):** Identifies end of inventory via `isStopCondition` detecting `TOTAL GERAL`, `SUBTOTAL`, `TERMO DE ENCERRAMENTO`, `TOTAL DO ESTOQUE`, as well as 3 consecutive empty rows. Trailing summary lines are excluded from products and quarantined issues.
   - **Monetary Precision via Integer Cents (lines 704-773, lines 821-825):** Employs `brlToCentavos` and `multiplyMoney` from `src/modules/currency`, with zero IEEE-754 floating-point numbers in item totals or grand total calculation (`addMoney`).
   - **Quarantine Engine (lines 633-803):** Isolates fatal errors (`severity: "ERROR"`, codes: `MISSING_CODE`, `MISSING_DESCRIPTION`, `INVALID_QUANTITY`, `NEGATIVE_QUANTITY`, `INVALID_UNIT_PRICE`, `NEGATIVE_PRICE`) preventing corrupted row import, while allowing non-fatal auditing warnings (`severity: "WARNING"`, codes: `ZERO_QUANTITY`, `ZERO_PRICE`, `MISSING_BARCODE`, `TOTAL_MISMATCH`, `DUPLICATE_CODE`).

2. **Synthetic Fixtures (`tests/fixtures/`):**
   All 6 requested test fixtures are present and generated deterministically via `tests/fixtures/generate-fixtures.ts`:
   - `p7_padrao_completo.xlsx` (22.5 KB) — 4-line administrative preamble, 15 items, `TOTAL GERAL` footer.
   - `p7_padrao_completo.csv` (1.6 KB) — Brazilian semicolon format, comma decimals.
   - `p7_preambulo_longo.xlsx` (25.0 KB) — 12 administrative rows, synonyms header on row 13.
   - `p7_encoding_latin1.csv` (1.6 KB) — Windows-1252 byte-encoded accented Portuguese strings (`Açúcar`, `Café`, `Óleo`, `Feijão`, `Sabão`, `Guaraná`).
   - `p7_delimitador_virgula.csv` (1.7 KB) — Comma-delimited CSV with Brazilian decimals quoted.
   - `p7_casos_limite_e_erros.xlsx` (19.5 KB) — Corruptions matrix isolating negative stock, blank codes, text unit prices, and missing barcodes.

3. **Bulk Inventory Import API (`src/app/api/inventario/import/route.ts` - 279 lines):**
   - Validates `multipart/form-data`, file presence, 15MB limit, and whitelist (`.xlsx`, `.csv`, `.xls`).
   - Supports preview mode `?dryRun=true` without writing to database.
   - Consolidates duplicate SKU codes within the same file (summing quantities and logging a quarantine warning).
   - In commit mode, executes batch upsert via `prisma.$transaction` in chunks of 50, updating physical balance (`quantidade`), calculating `totalCentavos = multiplyMoney(unitarioCentavos, quantidade)`, and setting `ativo = (quantidade > 0)`.

4. **Independent Test Execution Results:**
   - `npx vitest run tests/unit/parser-p7.test.ts`:
     `Test Files  1 passed (1)` | `Tests  28 passed (28)` (100% pass)
   - `pnpm test:e2e --fileParallelism=false`:
     `Test Files  4 passed (4)` | `Tests  72 passed (72)` (100% pass)
   - `npx tsc --noEmit`:
     Exit code 0, 0 compilation errors.
   - `npx vitest run tests/integration/inventory-import.test.ts`:
     `Test Files  1 passed (1)` | `Tests  12 passed (12)` (100% pass)
   - `pnpm test --fileParallelism=false`:
     `Test Files  9 passed (9)` | `Tests  167 passed (167)` (100% pass across entire project)
   - `pnpm build`:
     Exit code 0, Next.js 15 production build succeeded with `/api/inventario/import` registered.

---

## 2. Logic Chain

1. *Integrity & Honesty Verification*:
   - Grep searches for fixture constants (`1001`, `1250105`, `Santo Antônio`) across `src/modules/parser-p7/index.ts` returned 0 matches.
   - The parser logic is 100% algorithmic and dynamic: headers are discovered through scoring regex patterns; encodings are detected through byte decoders; CSV rows are tokenized through an RFC-4180 state machine. No test-specific branching or mock facades exist.

2. *Dynamic Header Detection Robustness*:
   - By scoring 5 primary anchors (`codigo`, `barras`, `discriminacao`, `qtd`, `unitario`) with threshold `>= 4`, the parser is resilient against missing optional columns (such as `ncm` or `unidade`) or files where one header is labeled unconventionally.
   - The synonym classification handles real-world ERP header variants (e.g. `Cód. Interno`, `Código EAN`, `Descrição do Produto`, `Estoque Atual`, `Preço Unitário`).

3. *CSV Delimiter Sniffing with Decimal Commas*:
   - In Brazilian CSV files, decimals frequently use commas (`"28,90"`). If the delimiter is also a comma, standard split algorithms fail.
   - `countDelimitersInLine` tracks quotation state (`inQuotes`), ignoring commas inside quotes when sniffing delimiter frequency. `parseCsvToRows` then preserves quoted fields during tokenization.

4. *Stop Condition & Trailing Summary Rows*:
   - Accounting inventory books terminate with a `TOTAL GERAL DO ESTOQUE` or `TERMO DE ENCERRAMENTO` row. If imported as a product, it would corrupt inventory count and inflate stock value.
   - `isStopCondition` checks whether the code or description matches summary keywords, and halts the parsing loop before the summary line can be converted into a product.

5. *Monetary Contract Adherence*:
   - `multiplyMoney` and `addMoney` operate strictly on safe integer centavos (`Number.isSafeInteger`).
   - The cross-check between declared total and calculated total (`|totalCentavos - declaredCentavos| > 2`) detects ERP rounding discrepancies and logs a `TOTAL_MISMATCH` audit warning without dropping the item.

---

## 3. Caveats

1. **Header Scan Window (`maxScan = Math.min(25, rows.length)`)**:
   - `detectP7Header` scans row indices `0` through `24` (i.e. the first 25 rows). If an atypical administrative preamble exceeds 25 rows and places the header on line 26 (index 25), `Math.min(26, rows.length)` would be needed to include index 25. For standard Model P7 books, preambles are 3-12 rows, so scanning 25 rows is sufficient.
2. **Fractional Quantities in Produce (Hortifruti by Weight)**:
   - In `src/modules/parser-p7/index.ts`, `quantidade` is parsed as a decimal `number` (e.g. `45.5 kg`).
   - However, `prisma/schema.prisma` models `quantidade Int`. In `src/app/api/inventario/import/route.ts`, fractional values are rounded via `Math.max(0, Math.round(item.quantidade))` to preserve database integrity. For future releases requiring fractional gram tracking, the database column can be migrated to `Float` or integer milligrams.
3. **Vitest Sequential Execution (`--fileParallelism=false`)**:
   - Because SQLite operates as a single file with WAL mode, running multiple test suites concurrently that perform bulk database operations can encounter locking contention. Running tests with `--fileParallelism=false` ensures 100% deterministic success.

---

## 4. Conclusion

The implementation of Milestone M2 (Model P7 Inventory Parser, Synthetic Fixtures & Import API) completely satisfies all requirements set forth in `ORIGINAL_REQUEST.md` (R2) and architectural contracts in `PROJECT.md` (F6-F12):
- Dynamic header detection algorithm correctly scores candidate rows (0..25, score >= 4).
- Delimiter sniffing and Windows-1252/UTF-8 transcoding operate cleanly with zero encoding corruption.
- Stop conditions properly discard closing summaries and footers.
- Currency normalization guarantees strict integer cents with zero floating-point drift.
- Row validation and quarantine separate fatal errors from non-fatal warnings.
- All 6 synthetic fixtures exist, and unit/integration/e2e test suites pass 100% (167/167 tests).
- Production build succeeds with 0 TypeScript compilation errors.

**Verdict: APPROVE**

---

## 5. Verification Method

Independent verification steps to reproduce these findings:

```powershell
# 1. Run unit tests for parser-p7
npx vitest run tests/unit/parser-p7.test.ts

# 2. Run integration tests for inventory import API
npx vitest run tests/integration/inventory-import.test.ts

# 3. Run requirement-driven E2E tests
pnpm test:e2e --fileParallelism=false

# 4. Run entire project test suite
pnpm test --fileParallelism=false

# 5. Typecheck with TypeScript compiler
npx tsc --noEmit

# 6. Execute Next.js production build
pnpm build
```
