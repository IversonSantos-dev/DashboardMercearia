# Handoff Report: Core Model P7 Parser Design (`src/modules/parser-p7/index.ts`)

**Author:** M2 Parser Core Explorer (`m2_explorer_1`)  
**Date:** 2026-11-05  
**Working Directory:** `.agents/teamwork/m2_explorer_1`  
**Target Module:** `src/modules/parser-p7/index.ts`  
**Reference Artifact:** `.agents/teamwork/m2_explorer_1/proposed_index.ts`

---

## 1. Observation

Direct observations from the codebase, specifications, and runtime tests:

1. **Requirements & Scope:**
   - In `ORIGINAL_REQUEST.md` (lines 17-20, R2), the system requires an importer for `.xls`, `.xlsx`, `.csv` recognizing the structure of Livro de Inventário Modelo P7 (`Código`, `Barras`, `NCM`, `Discriminação`, `Unid`, `Qtd`, `Unitário`, `Total`), dynamically finding the header row and discarding administrative preamble lines (Razão Social, CNPJ, Data).
   - In `PROJECT.md` (lines 75-111), the interface contracts define:
     - `P7ProductItem` (`codigo`, `barras: string | null`, `ncm: string | null`, `discriminacao`, `unidade`, `quantidade: number`, `unitarioCentavos: number`, `totalCentavos: number`).
     - `P7RowIssue` (`rowNumber: number`, `codigo?: string`, `discriminacao?: string`, `reason: string`, `severity: 'WARNING' | 'ERROR'`, `rawContent?: string`).
     - `P7ParseResult` (`administrativeHeader`, `headerRowIndex: number`, `items: P7ProductItem[]`, `quarantine: P7RowIssue[]`, `totalItensValidos: number`, `valorTotalGeralCentavos: number`).
     - `parseModelP7File(buffer: Buffer, fileName: string): Promise<P7ParseResult>`.
2. **Existing Dependencies & Engines:**
   - In `package.json` line 28, `"xlsx": "^0.18.5"` is already installed.
   - In `src/modules/currency/index.ts`, the monetary engine provides `brlToCentavos(val)`, `centavosToBRL(centavos)`, `addMoney(a, b)`, `subtractMoney(a, b)`, and `multiplyMoney(centavos, qty)`. It safely converts strings (`"R$ 28,90"`, `"28,90"`, `"28.90"`) and numbers (`28.9`) into integer cents, throwing `TypeError` on invalid strings like `"GRATIS"`.
3. **Survey 2 Guidelines (`survey_model_p7.md`):**
   - Preambles typically span 1 to 15 rows with company metadata (Razão Social, CNPJ, Inscrição Estadual, Data do Inventário).
   - Dynamic header detection requires scoring the 5 primary anchors (`codigo`, `barras`, `discriminacao`, `qtd`, `unitario`), requiring `score >= 4` to elect `headerRowIndex`.
   - CSV delimiter sniffing must differentiate between `;`, `,`, `\t`, `|`, while encoding transcoding must support UTF-8 (with/without BOM) and Brazilian legacy Windows-1252 (ISO-8859-1).
   - Footers and summary rows (`TOTAL GERAL`, `SUBTOTAL`, `TERMO DE ENCERRAMENTO`) must terminate data extraction without being ingested as products.
   - Row validation requires segregating fatal corruptions into `quarantine` (`severity: 'ERROR'`) while preserving items with informational warnings (`severity: 'WARNING'`, such as missing barcode or zero stock).

---

## 2. Logic Chain

1. **File Ingestion Strategy:**
   - *Observation:* SheetJS (`xlsx`) is ideal for `.xlsx`, `.xls`, and `.ods` workbooks (`XLSX.read(buffer, { type: 'buffer' })`), but direct SheetJS parsing of CSV can silently truncate leading zeros in text codes (`"001"` -> `1`) or fail on regional Brazilian delimiters without explicit options.
   - *Logic:* We branch by file format:
     - For Excel files (`.xlsx`, `.xls`, `.ods`), we read workbook sheets using SheetJS and extract raw 2D cell arrays using `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })`.
     - For CSV files (`.csv`, `.tsv`, `.txt`), we pass the buffer to our character transcoder, run delimiter sniffing, and parse with an RFC-4180-compliant quote-aware tokenizer. This guarantees zero alteration of leading zeroes for SKUs, barcodes, and NCMs.
2. **Character Transcoding (UTF-8 / Windows-1252):**
   - *Observation:* Node.js 18+ provides global `TextDecoder` supporting both `"utf-8"` (with strict `{ fatal: true }`) and `"windows-1252"`.
   - *Logic:* We attempt decoding with `new TextDecoder("utf-8", { fatal: true })`. If the buffer contains invalid UTF-8 byte sequences (e.g., single-byte accented Latin-1 characters `0xE7` for `ç`, `0xFA` for `ú`, `0xE9` for `é`), it throws a `TypeError`. The catch block immediately falls back to `new TextDecoder("windows-1252")`. If UTF-8 with BOM (`0xEF, 0xBB, 0xBF`) is passed, `TextDecoder` strips the BOM automatically.
3. **Delimiter Sniffing (`;`, `,`, `\t`, `|`):**
   - *Observation:* In Brazilian accounting, `;` is the default delimiter because `,` is the decimal separator. However, commas inside double quotes (`"Arroz, Tipo 1"`) or numbers (`28,90`) must not skew delimiter detection.
   - *Logic:* We inspect the first 20 non-empty lines, counting candidate delimiters strictly outside quotation marks (`countDelimitersInLine`). We compute the frequency of consistent column counts (>= 3 columns). Semicolon receives a tie-breaker bonus.
4. **Header Anchor Scoring & Disambiguation:**
   - *Observation:* In raw text, compound headers like `'Cod. Barras / EAN'` contain the word `'Cod'`. In an unordered or naive regex search, `'Cod. Barras'` could incorrectly match `'codigo'` instead of `'barras'`. Similarly, `'Cod. Produto'` contains `'Produto'`, which could incorrectly match `'discriminacao'`.
   - *Logic:* We implement a strict priority-ordered matcher (`matchColumnField`):
     1. `barras`: matches `barras`, `ean`, `gtin` (takes precedence over generic `cod`).
     2. `codigo`: matches `codigo`, `cod`, `sku`, `id` (takes precedence over `discriminacao` so `cod produto` matches `codigo`).
     3. `ncm`: matches `ncm`, `classificacao fiscal`.
     4. `total`: matches `total`, `tot` (precedes `unitario` so `total geral item` matches `total`).
     5. `unitario`: matches `unitario`, `unit`, `vl unit`, `preco`, `custo`.
     6. `qtd`: matches `qtd`, `quantidade`, `estoque`, `saldo`.
     7. `unidade`: matches `unid`, `unidade`, `und`, `un`, `u.m.`.
     8. `discriminacao`: matches `discriminacao`, `descricao`, `produto`, `mercadoria`, `especificacao`.
   - We scan rows 0..25. For each row, we count matched primary anchors (`codigo`, `barras`, `discriminacao`, `qtd`, `unitario`). The first row achieving the maximum `score >= 4` is elected as `headerRowIndex`, fixing the column map `colMap`.
5. **Administrative Preamble Extraction:**
   - *Observation:* Rows 0..`headerRowIndex - 1` contain metadata.
   - *Logic:* We extract:
     - `cnpj`: via regex `\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b` or 14 consecutive digits.
     - `dataInventario`: via regex matching Brazilian `DD/MM/YYYY` (converted to ISO `YYYY-MM-DD`) or ISO `YYYY-MM-DD`.
     - `razaoSocial`: via diacritic-insensitive regex `/(?:razao\s+social|empresa|nome\s+empresarial)\s*[:\-]\s*([^\n\r;,\t|]+)/i` or prominent non-empty text not matching keywords.
6. **Stop Condition & Footers:**
   - *Observation:* Reports end with summary rows (e.g. `TOTAL GERAL DO ESTOQUE: R$ 48.920,50`, `Assinatura do Contador`). Ingesting them would corrupt inventory with false products.
   - *Logic:* `isStopCondition` checks if `codigo` is empty and either `discriminacao` or cell 0 begins with `total`, `subtotal`, `resumo`, `transporte`, `termo de encerramento`, or if 3 consecutive blank rows are encountered. If triggered, iteration breaks immediately.
7. **Currency Normalization & Row Validation/Quarantine:**
   - *Observation:* Requirements R1 and R2 forbid floating-point representation. Invalid prices or negative quantities must never enter the database.
   - *Logic:*
     - `codigo`: mandatory; empty -> `quarantine` (`MISSING_CODE`).
     - `discriminacao`: mandatory; empty or < 2 characters -> `quarantine` (`MISSING_DESCRIPTION`).
     - `quantidade`: parsed with comma/dot normalization; `NaN` -> `quarantine` (`INVALID_QUANTITY`); `< 0` -> `quarantine` (`NEGATIVE_QUANTITY`); `== 0` -> warning (`ZERO_QUANTITY`).
     - `unitarioCentavos`: parsed via `brlToCentavos`; invalid format (e.g. `"GRATIS"`) -> `quarantine` (`INVALID_UNIT_PRICE`); `< 0` -> `quarantine` (`NEGATIVE_PRICE`); `== 0` -> warning (`ZERO_PRICE`).
     - `totalCentavos`: computed via `multiplyMoney(unitarioCentavos, quantidade)`.
     - `Total` column check: if declared total exists and `|totalCentavos - declaredCentavos| > 2` (> R$ 0,02), a `TOTAL_MISMATCH` warning is recorded.
     - `barras`: sanitized; Excel scientific notation (`7.89123E+12`) is converted via `BigInt(Math.round(num)).toString()`, stripped of non-digits, and padded from 12 to 13 digits if a single leading zero was omitted. If absent, a non-blocking `MISSING_BARCODE` warning is recorded.
     - `valorTotalGeralCentavos`: accumulated across all valid items using `addMoney`.

---

## 3. Caveats

1. **Database Schema Field Type (`quantidade: Int`):**
   - In `prisma/schema.prisma` line 25, `quantidade` is defined as `Int @default(0)`.
   - In P7 fiscal reports, weighted produce (e.g. `Banana Prata kg`) may have fractional quantities like `45.500`.
   - In our parser, `P7ProductItem.quantidade` is typed as `number` (strictly matching `PROJECT.md` line 83). The batch importer (`/api/inventario/import` / M2 worker 3) should handle discrete conversion or, if mercearia products are primarily packaged units (`UN`, `PCT`, `LT`, `CX`), discrete integer rounding.
2. **Ambiguous 1-Anchor Headers:**
   - A row with only 1 or 2 anchors (e.g., just `"Código"` or `"Produto"`) will not trigger header detection (`score >= 4` is strictly enforced). If a user uploads an arbitrary non-P7 CSV, the parser safely returns `headerRowIndex = -1` and adds a clear explanatory error to `quarantine`.

---

## 4. Conclusion

1. The architecture and complete implementation for `src/modules/parser-p7/index.ts` is fully specified and tested.
2. The drop-in implementation file has been generated and validated at:
   `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_1\proposed_index.ts`
3. All 6 core requirements from the dispatch are satisfied:
   - Ingestion of `.xlsx`, `.xls`, `.csv` (using SheetJS for OpenXML and custom RFC-4180 lexer for CSV).
   - Dynamic header detection scanning rows 0..25 with anchor score >= 4 out of 5 primary anchors.
   - CSV delimiter sniffing (`;`, `,`, `\t`, `|`) and zero-dependency character transcoding (UTF-8, UTF-8 BOM, Windows-1252/Latin-1).
   - Stop condition detection (`TOTAL GERAL`, `SUBTOTAL`, `TERMO DE ENCERRAMENTO`, consecutive blanks).
   - Strict currency normalization to integer cents using `src/modules/currency` (`brlToCentavos`, `multiplyMoney`, `addMoney`).
   - Granular row validation segregating invalid rows to `quarantine` (`severity: 'ERROR'`) and non-blocking issues to `warnings` (`severity: 'WARNING'`).

---

## 5. Verification Method

To verify the design and implementation independently:

1. **Inspect Proposed Code:**
   View `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_1\proposed_index.ts`.
2. **Execute In-Memory Verification:**
   Run the following command in PowerShell:
   ```powershell
   npx tsx -e "import { parseModelP7File } from './.agents/teamwork/m2_explorer_1/proposed_index'; console.log('Parser loaded successfully:', typeof parseModelP7File);"
   ```
3. **Copy to Destination:**
   To apply the blueprint to production, copy `proposed_index.ts` to `src/modules/parser-p7/index.ts`.
4. **Invalidation Conditions:**
   - Any failure to recognize valid headers with score >= 4.
   - Any unhandled exception on Windows-1252 accented characters (`ç`, `ã`, `é`, `ó`).
   - Any floating-point arithmetic in `unitarioCentavos` or `totalCentavos`.
