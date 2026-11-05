# Project: Dashboard Mercearia (Dashboard Administrativo e Frente de Caixa com Modelo P7)

## Architecture
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS + Lucide React + shadcn/ui.
- **Relational Persistence**: Prisma ORM with local SQLite (`prisma/dev.db`), configured with WAL mode (`PRAGMA journal_mode = WAL;`) and structured for seamless future migration to Supabase/PostgreSQL.
- **Monetary Precision**: Universal integer cents (`centavos: Int`) in database schema, business logic, and API contracts. No IEEE-754 floating-point drift.
- **Domain Modules**:
  - `src/modules/currency`: Integer-cents conversion, arithmetic, and BRL formatting (`R$ 0,00`).
  - `src/modules/database`: Prisma client singleton, connection lifecycle, and transaction helpers.
  - `src/modules/parser-p7`: Model P7 file parser, dynamic header detector, CSV sniffer, encoding transcoder, and row validator.
  - `src/modules/baixa-inteligente`: Multi-tier deduction algorithm (exact unit, exact multiple, hash-map combinations, proximity matching, assisted catalog).
  - `src/modules/transacoes`: Atomic deduction transaction coordinator, zero-balance stock deactivator, daily sales book logger, and immutable audit trail.
  - `src/modules/financeiro`: Daily sales aggregator (Card vs Cash vs Total), monthly consolidation, and expense confrontation.
- **Data Flow**:
  1. *Inventário*: Upload `.xlsx`/`.csv` -> `parser-p7` -> validation & preview -> bulk upsert into `produtos_estoque`.
  2. *Frente de Caixa*: Input (Valor Alvo, Pagamento, Data) -> `baixa-inteligente` -> operator preview -> `transacoes` (ACID transaction: decrement `produtos_estoque`, insert `lancamentos_diarios`, insert `historico_baixas`).
  3. *Dashboard*: Query `lancamentos_diarios` & `despesas_mensais` -> `financeiro` -> Daily Cash View (Card/Cash/Total) & Monthly Closure View.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Next.js 15 + React 19 + TypeScript Foundation | Greenfield fullstack project structure with Tailwind, Lucide, and component setup | M1 | Survey 1 |
| F2 | Prisma ORM & SQLite with WAL mode | Relational DB setup abstracted for seamless Supabase/PostgreSQL migration | M1 | Survey 1 / R5 |
| F3 | Relational Schema & Migrations | Models: `produtos_estoque`, `lancamentos_diarios`, `historico_baixas`, `despesas_mensais` with constraints | M1 | Survey 1 / R5 |
| F4 | Strict Integer-Cents Monetary Engine | `currency.ts` library eliminating float drift; BRL string parsing and formatting | M1 | Survey 1 & 3 / R1 |
| F5 | Automated Testing Infrastructure | Vitest configuration, test runners, and assertions for unit & integration tests | M1 | Survey 1 |
| F6 | Dynamic Header Anchor Detection | Algorithmic scoring of 5 anchors (Código, Barras, Discriminação, Qtd, Unitário) skipping administrative preamble | M2 | Survey 2 / R2 |
| F7 | Delimiter Sniffer & Encoding Transcoder | Autodetects `;`, `,`, `\t` and transcode UTF-8 / Windows-1252 / ISO-8859-1 | M2 | Survey 2 / R2 |
| F8 | Model P7 Spreadsheet Parser (.xlsx, .csv) | Robust parser extracting Código, Barras, NCM, Discriminação, Unid, Qtd, Unitário (centavos), Total | M2 | Survey 2 / R2 |
| F9 | Stop Condition & Summary Row Detector | Automatically detects and skips footer totals, `TOTAL GERAL`, signatures | M2 | Survey 2 / R2 |
| F10 | Row Validation & Quarantine Engine | Granular row validation reporting corruptions, missing fields, and quarantine list | M2 | Survey 2 / R2 |
| F11 | Synthetic P7 Test Fixtures | 6 realistic test files (.xlsx, .csv, long preambles, Latin1, delimiters, edge cases) | M2 | Survey 2 / R2 |
| F12 | Inventory Import API & Bulk Ingestion | API endpoint and service for transactional batch upsert of parsed items into DB | M2 | Survey 2 / R2 |
| F13 | Exact Unit & Multiple Deduction Engine | Tier 1 matching: `(1 * Unitário) == Alvo` and `(Qtd * Unitário) == Alvo` | M3 | Survey 3 / R3 |
| F14 | Exact Combinations Deduction Engine | Tier 2 matching: Hash-Map Two-Sum / Three-Sum bounded subset-sum in < 2ms | M3 | Survey 3 / R3 |
| F15 | Minimal Delta Proximity Deduction | Tier 3 matching: Nearest combination minimizing `\|Total - Alvo\|` | M3 | Survey 3 / R3 |
| F16 | Interactive Proximity Catalog | Tier 4 fallback: Ranked list of items ordered by unit price delta for manual pick | M3 | Survey 3 / R3 |
| F17 | Atomic Stock Decrement & Deactivation | Atomic `Qtd = Qtd - debitada`, `ativo = false` on zero balance, `CHECK (qtd >= 0)` | M3 | Survey 3 / R4 |
| F18 | Immediate Daily Sales Book Entry | Simultaneous insertion into `lancamentos_diarios` in Card or Cash column | M3 | Survey 3 / R4 |
| F19 | Immutable Audit Trail Logging | Insertion of complete audit record into `historico_baixas` with foreign keys | M3 | Survey 3 / R4 |
| F20 | Front of Store POS UI (Frente de Caixa) | Operational view: Target Value input, Payment Method, Retroactive Date selection | M4 | Survey 3 / R3 |
| F21 | Interactive Deduction Preview Modal | Confirmation modal showing Code, Barcode, Description, Qtd, Unit Price, Total | M4 | Survey 3 / R3 |
| F22 | Inventory Management UI | File upload, parsed preview, validation warnings/quarantine, stock catalog table | M4 | Survey 2 / R2 |
| F23 | Daily Financial Dashboard View | Daily sales table with Card, Cash, and Total columns (`Total = Card + Cash`) | M4 | Survey 3 / R1 |
| F24 | Monthly Financial Consolidation View | Monthly cumulative Card, Cash, Total Entries, and confrontation with Expenses | M4 | Survey 3 / R1 |
| F25 | Expense Management UI & API | Expense registration and categorization for monthly net balance confrontation | M4 | Survey 3 / R1 |
| F26 | Full E2E Test Suite & Coverage Hardening | 100% pass of E2E Tiers 1-4 and adversarial white-box coverage hardening (Tier 5) | M5 | Dual Track / All |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation, Relational DB & Monetary Precision | Setup Next.js, Prisma SQLite with WAL, schema models, currency utilities, Vitest | none | PLANNED |
| M2 | Model P7 Inventory Parser, Importer & Synthetic Fixtures | Dynamic header detector, CSV sniffer/transcoder, parser, validation, synthetic files, import API | M1 | PLANNED |
| M3 | Intelligent Deduction Engine & Atomic Transaction Subsystem | Multi-tier algorithm (exact, combinations, proximity), atomic stock debit, daily sales & audit trail | M1 | PLANNED |
| M4 | User Interface & Financial Dashboard | Frente de Caixa POS, deduction preview modal, inventory UI, daily sales view, monthly closure & expenses UI | M2, M3 | PLANNED |
| M5 | Final Milestone: E2E Test Pass & Hardening | Pass 100% of E2E test suite (Tiers 1-4) and execute Tier 5 adversarial hardening | M4, TEST_READY | PLANNED |

## Parallel Track: E2E Testing
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | Requirement-Driven Opaque-Box E2E Test Suite | Test runner harness, synthetic data, test cases Tiers 1-4, publication of TEST_READY.md | M1 | IN_PROGRESS |
