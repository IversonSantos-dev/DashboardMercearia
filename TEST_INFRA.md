# E2E Test Infrastructure & Specification Track
**Project**: Dashboard Mercearia (Dashboard Administrativo e Frente de Caixa com Modelo P7)  
**Track**: Requirement-Driven Opaque-Box E2E Testing  
**Status**: Ready & Integrated  

---

## 1. Test Architecture & Runner Command

### Invocation Commands
The E2E test suite can be executed via either of the following standard commands:

```bash
# Via pnpm script:
pnpm test:e2e

# Direct Vitest execution:
npx vitest run tests/e2e
```

### Architectural Principles
1. **Opaque-Box Requirement Verification**: Tests treat the application as a black box, interacting purely through documented public module contracts, REST/API endpoints, and persistent relational database states.
2. **Deterministic Monetary Accounting**: All monetary assertions operate on strict integer cents (`centavos: Int`) with zero floating-point variance (0.00 tolerance). No IEEE-754 approximations are accepted.
3. **Progressive Testability & Contract Discovery**: Tests utilize an isolated contract-loading abstraction (`tests/e2e/helpers/contract-loader.ts`). As milestone implementations land (M1 -> M2 -> M3 -> M4 -> M5), tests dynamically bind to the live implementation and verify contract compliance.
4. **State Isolation & Cleanliness**: Database-driven tests manage their lifecycles cleanly using unique test namespaces (`E2E-*` prefixes and isolated transaction blocks), preventing dirty reads and side-effects across test runs.
5. **Real-World Fixture Synthesis**: Binary spreadsheet buffers (`.xlsx`) and character-encoded delimited files (`.csv` in UTF-8 and Windows-1252/ISO-8859-1) are dynamically generated in-memory with authentic Model P7 fiscal preambles, headers, summary rows, and barcode identifiers.

---

## 2. Tier Definitions & Test Matrix

The E2E test track is structured into four progressive tiers:

| Tier | Name | Target Scope | Requirement Focus |
|:---:|:---|:---|:---|
| **Tier 1** | **Feature Coverage** | Isolates each feature in `PROJECT.md` Feature Inventory with $\ge 5$ representative test cases. | Validates happy paths, nominal inputs, interface types, and contract invariants. |
| **Tier 2** | **Boundary & Corner Cases** | Stress-tests each feature with $\ge 5$ boundary, edge, and adversarial cases. | Empty inputs, extreme values, negative numbers, malformed spreadsheets, foreign characters, zero-stock limits, concurrent collisions. |
| **Tier 3** | **Cross-Feature Combinations** | Multi-step integration of the full business lifecycle. | Import Model P7 $\rightarrow$ Catalog Upsert $\rightarrow$ Smart Deduction $\rightarrow$ Atomic Stock Decrement $\rightarrow$ Cash Register Entry $\rightarrow$ Daily & Monthly Consolidation with Expense Confrontation. |
| **Tier 4** | **Real-World Grocery Scenarios** | Full operational simulation of a Brazilian Mercearia. | Day 1: Opening stock, morning rush, mixed Card/Cash payments, exact & combination deductions, daily cash closure.<br>Day 2: Stock exhaustion, deactivation, vendor restocking with duplicate barcodes, expense reconciliation, month-end DRE. |

---

## 3. Feature Coverage Inventory

Every feature identified in `PROJECT.md` is mapped to its E2E verification tier:

| Feature ID | Feature Name | Mapped E2E Tier | Verification Surface |
|:---|:---|:---:|:---|
| **F1** | Next.js 15 + React 19 + TypeScript Foundation | Tier 1, 3 | Module export integrity, environment readiness, typing contracts |
| **F2** | Prisma ORM & SQLite with WAL mode | Tier 1, 2 | SQLite Pragmas (`journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`) |
| **F3** | Relational Schema & Table Models | Tier 1, 2 | `produtos_estoque`, `lancamentos_diarios`, `historico_baixas`, `despesas_mensais` constraints |
| **F4** | Strict Integer-Cents Monetary Engine | Tier 1, 2 | BRL string parsing (`R$ 1.234,56`), centavos arithmetic, inverse symmetry, zero float drift |
| **F5** | Automated Testing Infrastructure | All Tiers | Vitest runner harness, assertion library, reporters |
| **F6** | Dynamic Header Anchor Detection | Tier 1, 2 | Header scoring algorithm locating `Código`, `Barras`, `Discriminação`, `Qtd`, `Unitário` past preambles |
| **F7** | Delimiter Sniffer & Encoding Transcoder | Tier 1, 2 | Delimiters `;`, `,`, `\t` and Windows-1252 / ISO-8859-1 accented character preservation |
| **F8** | Model P7 Spreadsheet Parser (.xlsx, .csv) | Tier 1, 2 | In-memory `.xlsx` workbook and `.csv` stream parsing into `P7ProductItem[]` |
| **F9** | Stop Condition & Summary Row Detector | Tier 1, 2 | Exclusion of `TOTAL GERAL`, signature lines, and trailing commentary |
| **F10** | Row Validation & Quarantine Engine | Tier 1, 2 | Identification of missing fields, negative prices, non-numeric values into `P7RowIssue[]` |
| **F11** | Synthetic P7 Test Fixtures | Tier 1, 2, 3, 4 | In-memory generation of realistic Model P7 workbooks with valid and dirty rows |
| **F12** | Inventory Import & Bulk Ingestion | Tier 1, 3, 4 | Database bulk upsert into `produtos_estoque` with conflict resolution on `codigo` |
| **F13** | Exact Unit & Multiple Deduction Engine | Tier 1, 2, 3 | Deductions where `(1 * Unitario) == Alvo` or `(Qtd * Unitario) == Alvo` |
| **F14** | Exact Combinations Deduction Engine | Tier 1, 2, 3 | Bounded subset-sum hash-map combinations matching target amount in $< 2$ms |
| **F15** | Minimal Delta Proximity Deduction | Tier 1, 2, 3 | Nearest inventory combination minimizing $\|Total - Alvo\|$ |
| **F16** | Interactive Proximity Catalog Fallback | Tier 1, 2, 4 | Ranked candidate items ordered by absolute delta for assisted operator selection |
| **F17** | Atomic Stock Decrement & Deactivation | Tier 1, 2, 3, 4 | Stock decrement, `ativo = false` on zero balance, prevention of negative stock (`CHECK qtd >= 0`) |
| **F18** | Immediate Daily Sales Book Entry | Tier 1, 3, 4 | Simultaneous write to `lancamentos_diarios` in Card or Cash column |
| **F19** | Immutable Audit Trail Logging | Tier 1, 3, 4 | Snapshot record in `historico_baixas` with item code, description, quantity, price, and timestamp |
| **F20** | Front of Store POS Interface Contract | Tier 1, 3, 4 | Target amount, payment method (CARTAO/DINHEIRO), date parameter handling |
| **F21** | Interactive Deduction Preview Contract | Tier 1, 4 | Display payload contract (item list, debit quantities, subtotal, and delta) |
| **F22** | Inventory Management Flow | Tier 3, 4 | Multi-file import, restock quantity increments, duplicate barcode handling |
| **F23** | Daily Financial Aggregator View | Tier 1, 3, 4 | Daily totals: `totalCartaoCentavos`, `totalDinheiroCentavos`, `totalGeralCentavos` |
| **F24** | Monthly Financial Consolidation View | Tier 1, 3, 4 | Aggregated monthly entries, total expenses, net balance (`totalEntradas - totalSaidas`) |
| **F25** | Expense Management Engine & API | Tier 1, 2, 3, 4 | Monthly expense registration across categories, exclusion from sales revenue, net DRE |
| **F26** | Full E2E Test Suite & Hardening | All Tiers | 100% executable test coverage across Tiers 1-4 |

---

## 4. Test Suite File Structure

```
tests/e2e/
├── helpers/
│   ├── contract-loader.ts           # Dynamic module binder & progressive testability harness
│   ├── fixture-generator.ts         # In-memory Model P7 (.xlsx, .csv) workbook & buffer generator
│   └── test-database.ts             # Isolated DB utilities & cleanup helpers
├── tier1-feature-coverage.test.ts   # Tier 1: >= 5 test cases per inventoried feature
├── tier2-boundary-corner.test.ts    # Tier 2: Boundary, edge, adversarial, and overflow cases
├── tier3-cross-feature.test.ts      # Tier 3: Complete lifecycle cross-feature combinations
└── tier4-real-world-scenarios.test.ts # Tier 4: Realistic grocery store business operations
```

---

## 5. Verification & Acceptance Criteria
1. **Pass Rate**: 100% of implemented milestone contracts pass deterministically.
2. **Zero Float Drift**: Every arithmetic expectation matches integer cents exactly.
3. **Database Integrity**: All relational constraints (`onDelete: Restrict`, unique keys, non-negative quantities) are maintained and clean.
