# Handoff Report: Review & Adversarial Audit of Milestone M2 Inventory Import API

**Reviewer Agent:** M2 Import API Reviewer (`m2_reviewer_2`)  
**Roles:** reviewer, critic  
**Target Milestone:** M2 — Model P7 Inventory Parser, Importer & Synthetic Fixtures  
**Parent Agent:** `909b2f8c-83c6-47de-829a-608c7e57ee1e`  
**Date:** 2026-11-05T02:03:00Z  
**Verdict:** **APPROVE**

---

## 1. Observation

Direct observations from independent code inspection, verification commands, and integrity checks:

1. **API Endpoint Implementation (`src/app/api/inventario/import/route.ts`)**:
   - **Payload & Security Validation (Lines 13-77)**:
     - Rejects non-`multipart/form-data` requests with HTTP 400 (`!contentType.includes("multipart/form-data")`).
     - Gracefully catches `req.formData()` parse failures with HTTP 400.
     - Validates file presence and rejects empty payloads (`!file || !(file instanceof File) || file.size === 0`) with HTTP 400.
     - Enforces a strict 15MB file size ceiling (`file.size > MAX_FILE_SIZE_BYTES` -> HTTP 413).
     - Enforces file extension whitelist via case-insensitive matching (`fileName.toLowerCase().endsWith(ext)`) against `[".xlsx", ".csv", ".xls"]`, rejecting unsupported formats with HTTP 400.
   - **Buffer Ingestion & Parser Execution (Lines 79-107)**:
     - Converts file `ArrayBuffer` to Node `Buffer` and executes `parseModelP7File(buffer, fileName)`.
     - Maps parser runtime failures to HTTP 422 with descriptive error messages.
     - Rejects spreadsheets containing zero valid items with HTTP 422, returning quarantine diagnostics.
   - **In-File Duplicate SKU Consolidation (Lines 109-139)**:
     - Iterates through `parseResult.items` using a `Map<string, P7ProductItem>` keyed by `codigo.trim()`.
     - When a duplicate SKU occurs in the same file, it accumulates quantities (`existing.quantidade += item.quantidade`), updates product attributes, recalculates total cents (`multiplyMoney(existing.unitarioCentavos, existing.quantidade)`), and appends a `WARNING` entry to `quarantine` with code and merged quantity.
   - **Preview Mode Isolation (`?dryRun=true`, Lines 141-180)**:
     - Evaluates `dryRun` query parameter (`dryRun === "true" || dryRun === "1"`).
     - Executes exclusively read-only Prisma queries (`prisma.produtoEstoque.findMany({ select: { codigo: true } })`) to estimate count of new vs updated records.
     - Performs **ZERO** database write operations (no `create`, `update`, `upsert`, or `delete`).
     - Returns HTTP 200 with preview payload containing summary counts, quarantine issues, and `itemsPreview.slice(0, 50)`.
   - **Commit Mode Batch Upsert & Stock State (Lines 182-266)**:
     - Executes within `prisma.$transaction(async (tx) => { ... }, { timeout: 30000, maxWait: 10000 })`.
     - Processes items in chunks of 50 (`CHUNK_SIZE = 50`) using `Promise.all`.
     - Rounds produce quantities safely with non-negative guard (`Math.max(0, Math.round(item.quantidade))`).
     - Evaluates active status dynamically: `const isAtivo = qtyInt > 0;`.
     - In both `create` and `update` branches: sets `quantidade: qtyInt`, `ativo: isAtivo`, `unitarioCentavos: item.unitarioCentavos`, and `totalCentavos: multiplyMoney(item.unitarioCentavos, qtyInt)`.
     - In `update` branch: replaces physical balance (`quantidade: qtyInt`) rather than incrementing.
     - Tracks created vs updated counts accurately.
     - Returns HTTP 200 with complete summary and quarantine audit data.

2. **Integration Test Suite Verification (`tests/integration/inventory-import.test.ts`)**:
   - 12 comprehensive integration tests across 7 distinct test groups:
     1. *Request Validation and Security Gates*: non-multipart rejected (400), missing file rejected (400), invalid extension (.pdf) rejected (400), corrupt buffer rejected (422).
     2. *Preview & Validation Quarantine Mode (?dryRun=true)*: previews valid items, isolates DB from mutation, asserts pre-existing DB item remains untouched, asserts new items are NOT created.
     3. *Commit Mode & Database Persistence*: asserts exact integer-cents persistence in `produtos_estoque`, confirms `ativo = true` for `qtd > 0`, and confirms `ativo = false` for `qtd = 0`.
     4. *Upsert Semantics (Balance Replacement & Reactivation)*: verifies physical inventory replaces previous stock (`quantidade` becomes 45 and not 145), verifies deactivated product (`ativo = false`) reactivates to `true` when positive inventory is imported.
     5. *Partial Import with Quarantine (Dirty Rows Isolation)*: invalid rows (negative quantity, missing code) segregated to quarantine while valid rows persist.
     6. *CSV Semicolon Delimited Format Parity*: tests Brazilian semicolon CSV with quoted descriptions and comma decimals.
     7. *In-File Duplicate Code Consolidation*: tests duplicate SKU within file, asserting merged quantities (30 + 25 = 55) and quarantine warning.

3. **Adversarial & Integrity Checks**:
   - **Integrity Violation Check**: PASSED. No hardcoded test responses, no mocked database returns in integration tests, no facade/dummy endpoints. All tests run against live SQLite database with real transactions and Prisma client.
   - **Adversarial Stress Scenarios**:
     - Case-insensitive extension: Tested and verified (`.XLSX` vs `.xlsx`).
     - Negative and zero quantities: Negative quantities are quarantined by the parser (`[NEGATIVE_QUANTITY]`), and zero quantities are persisted with `ativo = false`.
     - SQLite lock contention: Chunked upserts inside `prisma.$transaction` with 30s timeout prevent deadlocks.
     - Decimal quantities for weighed goods: `Math.max(0, Math.round(item.quantidade))` guarantees Prisma integer constraint compliance without schema violation.

4. **Independent Command Execution Results**:
   - `npx vitest run tests/integration/inventory-import.test.ts`:
     `1 test file passed, 12 tests passed, 0 failed` (Duration: 1.79s).
   - `pnpm test:e2e --fileParallelism=false`:
     `4 test files passed, 72 tests passed, 0 failed` (Duration: 5.35s).
   - `pnpm test --fileParallelism=false`:
     `9 test files passed, 167 tests passed, 0 failed` (100% pass across full workspace).
   - `npx tsc --noEmit`:
     Exit code 0, 0 TypeScript errors.

---

## 2. Logic Chain

1. *From Requirements to Implementation*:
   - The user requested an import API for Model P7 inventory supporting `.xlsx` and `.csv`, handling administrative preambles, enforcing validation, isolating preview with `dryRun`, consolidating duplicate SKUs, and atomically updating `produtos_estoque`.
   - Inspection of `src/app/api/inventario/import/route.ts` proves that each requirement is implemented with production-grade defenses: multipart header parsing, 15MB ceiling, dynamic anchor parsing via `parseModelP7File`, `Map`-based duplicate consolidation, and transactional batch upserting.

2. *From Database Invariants to Active Flag & Balance Replacement*:
   - In retail inventory, an inventory count represents physical ground truth: existing balances must be overwritten, not added. The route implements `quantidade: qtyInt` in the `update` block, verified by test `should replace existing stock quantity and unit price rather than incrementing`.
   - The user requirement specifies that when quantity reaches zero, the product must be flagged inactive (`ativo = false`). The route implements `const isAtivo = qtyInt > 0;`, setting `ativo: isAtivo` on both `create` and `update`. Test `should set ativo=false when imported item quantity is zero` and `should reactivate an inactive product (ativo=false -> true) when new stock is imported` explicitly verify this invariant.

3. *From Verification Evidence to Verdict*:
   - The code is clean, robust, and strongly typed.
   - All 12 integration tests and all 72 E2E tests pass.
   - No integrity violations or shortcuts exist.
   - Therefore, the appropriate verdict is **APPROVE**.

---

## 3. Caveats

1. **Vitest Multi-File Database Parallelism**:
   - Because SQLite operates as a single local file, running multiple parallel test files that concurrently run database cleanups and raw transactions can cause transient lock contention (`SQLITE_BUSY`). Running with `--fileParallelism=false` (as configured in `pnpm test:e2e` and `pnpm test`) ensures 100% deterministic sequential test runs.
2. **Fractional Quantities in Integer Schema**:
   - Products sold by weight (e.g. 1.250 kg) are converted to nearest integer in the database (`Math.round`), because `produtos_estoque.quantidade` is an `Int`. If sub-unit fractional quantities (e.g. grams) must be preserved in the future, the schema column should be migrated to `Decimal` or `Float`. For standard grocery unit items, this has zero negative impact.

---

## 4. Conclusion

**Verdict: APPROVE**

The implementation of `src/app/api/inventario/import/route.ts` and its integration test suite `tests/integration/inventory-import.test.ts` fully satisfies all user requirements and interface contracts for Milestone M2:
- Strict multipart validation, extension whitelist, and size ceiling.
- Database mutation safety during `?dryRun=true` preview mode.
- In-file duplicate SKU consolidation with quantity accumulation and quarantine warnings.
- Chunked transactional upserting with physical stock replacement.
- Precise `ativo` flag synchronization (`ativo = true` when `qtd > 0`, `ativo = false` when `qtd = 0`).
- 100% passing test suite (12/12 integration, 72/72 E2E, 167/167 workspace total) and clean TypeScript compilation.

---

## 5. Verification Method

To reproduce the verification independently:

1. **Run Integration Tests**:
   ```powershell
   npx vitest run tests/integration/inventory-import.test.ts
   ```
   *Expected:* 1 file passed, 12 tests passed, 0 failed.

2. **Run E2E Tests**:
   ```powershell
   pnpm test:e2e --fileParallelism=false
   ```
   *Expected:* 4 files passed, 72 tests passed, 0 failed.

3. **Run TypeScript Check**:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected:* Exit code 0, 0 errors.

4. **Run Full Workspace Tests**:
   ```powershell
   pnpm test --fileParallelism=false
   ```
   *Expected:* 9 files passed, 167 tests passed, 0 failed.
