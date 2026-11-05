# Handoff Report — M3 Explorer 3: API Contracts, Edge Cases & Verification Suite Plan

## 1. Observation

### Codebase & Environmental Facts
1. **User Requirements (`ORIGINAL_REQUEST.md`)**:
   - `R3. Módulo de Baixa Inteligente por Valor`: Operator inputs Target Value (R$), Payment Method (Cartão or Dinheiro), Date (defaults to today, permits retroactive selection). System suggests items where $(Qtd \times Unitario) == Alvo$, closest exact combination, or proximity list.
   - `R4. Atomicidade, Débito e Histórico de Auditoria`: Confirmed deduction executed atomically: decrements `Qtd`, marks `ativo = false` when $Qtd = 0$, updates `lancamentos_diarios` in the respective column (Cartão or Dinheiro), logs immutable audit record in `historico_baixas`.
   - `R5. Arquitetura e Persistência`: Relational database with SQLite WAL mode via Prisma, structured for future Supabase/PostgreSQL migration.

2. **Database Schema (`prisma/schema.prisma`)**:
   - `ProdutoEstoque`:
     - Fields: `id` (cuid), `codigo` (@unique), `barras` (nullable), `ncm` (nullable), `discriminacao`, `unidade` (default "UN"), `quantidade` (Int >= 0), `unitarioCentavos` (Int), `totalCentavos` (Int), `ativo` (Boolean, default true).
     - Indices: `@@index([ativo, quantidade])`, `@@index([barras])`, `@@index([unitarioCentavos])`.
   - `LancamentoDiario`:
     - Fields: `id` (cuid), `data` (String "YYYY-MM-DD", indexed `@@index([data])`), `valorCartaoCentavos` (Int), `valorDinheiroCentavos` (Int), `totalDiarioCentavos` (Int), `observacoes` (String?).
   - `HistoricoBaixa`:
     - Fields: `id` (cuid), `lancamentoDiarioId` (String?, FK to `LancamentoDiario`, `onDelete: SetNull`), `produtoId` (String, FK to `ProdutoEstoque`, `onDelete: Restrict`), `codigoProduto` (snapshot), `discriminacaoProduto` (snapshot), `quantidadeBaixada` (Int), `unitarioCentavos` (snapshot), `totalCentavos` (Int), `formaPagamento` (String: "CARTAO" | "DINHEIRO"), `dataHora` (DateTime).

3. **Existing API Route Reference (`src/app/api/inventario/import/route.ts`)**:
   - Implements Next.js 15 App Router handler pattern: `export async function POST(req: NextRequest): Promise<NextResponse>`.
   - Returns typed JSON responses with `{ success: boolean, ... }` or `{ success: false, error: string, details?: any }`.
   - Uses HTTP status codes: 200 (Success), 400 (Bad Request), 413 (Payload Too Large), 422 (Unprocessable Entity), 500 (Internal Server Error).
   - Manages Prisma transactions via `prisma.$transaction(async (tx) => { ... })` with configured timeouts (`timeout: 30000, maxWait: 10000`).

4. **Monetary Engine (`src/modules/currency/index.ts`)**:
   - `brlToCentavos(val: string | number)` converts any formatted string ("R$ 1.234,56", "25,50", 25.5) into exact integer cents with half-up rounding. Throws `TypeError` on invalid strings or multiple signs; throws `RangeError` on NaN/infinite/overflow.
   - `centavosToBRL(centavos: number)` formats integer cents to Brazilian currency strings ("R$ 1.234,56").
   - `formatDecimalBRL(centavos: number)` formats integer cents to form input decimals ("1234,56").

5. **Existing E2E Test Suite Contracts (`tests/e2e/helpers/contract-loader.ts`)**:
   - `BaixaInteligenteContract`:
     - `findDeductionSuggestion(stock: StockCandidate[], valorAlvoCentavos: number): DeductionSuggestionResult`.
     - `DeductionSuggestionResult.strategy`: `'EXACT_UNIT' | 'EXACT_MULTIPLE' | 'EXACT_COMBINATION' | 'PROXIMITY_COMBINATION' | 'ASSISTED_CATALOG'`.
   - `TransacoesContract`:
     - `executeDeductionTransaction(params: ExecuteDeductionParams): Promise<ExecuteDeductionResult>`.
     - `ExecuteDeductionParams`: `{ valorAlvoCentavos: number; formaPagamento: 'CARTAO' | 'DINHEIRO'; dataLancamento: string; itens: Array<{ produtoId: string; quantidadeDebitar: number }>; operadorObservacao?: string }`.
     - `ExecuteDeductionResult`: `{ sucesso: boolean; lancamentoDiarioId: string; historicoIds: string[]; totalDebitadoCentavos: number }`.

6. **Dependencies (`package.json`)**:
   - Notice: `zod` is NOT currently installed in `dependencies`. Route validations must use strict zero-dependency TypeScript validation routines (matching `src/app/api/inventario/import/route.ts` and `src/modules/currency/index.ts`) to avoid external runtime bloat.

---

## 2. Logic Chain

### 2.1 Route Contract Design: `POST /api/baixa/sugestao`

#### Rationale & Request Processing
- **Dual Value Input**: In POS environments, operators may submit either raw integer cents from numerical keypad handlers (`valorAlvoCentavos: 2550`) or formatted strings from currency mask inputs (`valorAlvoBRL: "R$ 25,50"` or `"25,50"`). Supporting both with automatic normalization via `brlToCentavos` maximizes UI interoperability.
- **Query Optimization**: To keep route latency $< 10\text{ ms}$, the handler filters `prisma.produtoEstoque.findMany({ where: { ativo: true, quantidade: { gt: 0 } }, select: { id: true, codigo: true, barras: true, discriminacao: true, unidade: true, quantidade: true, unitarioCentavos: true } })`. SQLite uses the compound index `@@index([ativo, quantidade])`, skipping inactive and zero-balance items at the B-tree level.
- **Empty Inventory Resilience**: When inventory is completely depleted (0 active items with quantity > 0), the route returns HTTP 200 with `sugestao.estrategia = "SEM_ESTOQUE"` and `itens: []`. This allows the cashier UI to render an informative empty state banner without triggering a generic network error toast.

#### Concrete Endpoint Specification
- **Path**: `POST /api/baixa/sugestao`
- **Headers**: `Content-Type: application/json`
- **Request Body (JSON)**:
  ```typescript
  interface SugestaoRequestBody {
    valorAlvoCentavos?: number;       // e.g. 2550
    valorAlvoBRL?: string;            // e.g. "R$ 25,50" or "25,50"
    formaPagamento: "CARTAO" | "DINHEIRO";
    data?: string;                    // Optional ISO YYYY-MM-DD
    limiteAlternativas?: number;      // Optional, default 20, max 50
  }
  ```
- **Validation Rules**:
  - Target Value: If `valorAlvoCentavos` is provided, must be safe integer $> 0$. If `valorAlvoBRL` is provided, must parse successfully via `brlToCentavos` and result in $> 0$. Maximum allowed: `100_000_000` (R$ 1.000.000,00). If invalid, return HTTP 400.
  - `formaPagamento`: Case-insensitive normalization; must be `"CARTAO"` or `"DINHEIRO"`. If missing or invalid, return HTTP 400.
  - `data`: If provided, must match `/^\d{4}-\d{2}-\d{2}$/` and be a valid calendar date. Defaults to current server date in ISO format.
- **Response Body (HTTP 200)**:
  ```json
  {
    "success": true,
    "sugestao": {
      "estrategia": "EXACT_UNIT",
      "valorAlvoCentavos": 2550,
      "valorAlvoBRL": "R$ 25,50",
      "valorSugeridoCentavos": 2550,
      "valorSugeridoBRL": "R$ 25,50",
      "deltaCentavos": 0,
      "deltaBRL": "R$ 0,00",
      "itens": [
        {
          "produtoId": "clx...",
          "codigo": "001",
          "barras": "78910001",
          "discriminacao": "Arroz Tipo 1 5kg",
          "unidade": "UN",
          "quantidadeDisponivel": 20,
          "quantidadeDebitar": 1,
          "unitarioCentavos": 2550,
          "unitarioBRL": "R$ 25,50",
          "totalItemCentavos": 2550,
          "totalItemBRL": "R$ 25,50"
        }
      ]
    },
    "catalogoProximidade": [
      {
        "produtoId": "clx...",
        "codigo": "002",
        "barras": "78910002",
        "discriminacao": "Feijão Carioca 1kg",
        "unidade": "UN",
        "quantidadeDisponivel": 30,
        "unitarioCentavos": 850,
        "unitarioBRL": "R$ 8,50",
        "deltaCentavos": 1700
      }
    ],
    "tempoExecucaoMs": 1.45
  }
  ```

---

### 2.2 Route Contract Design: `POST /api/baixa/executar`

#### Rationale & Atomic Coordination
- **Atomic Stock Decrement & Deactivation**: Inside `prisma.$transaction`, each requested item must be verified for available stock: `prod.quantidade >= req.quantidadeDebitar` and `prod.ativo === true`. The decrement `quantidade = quantidade - req.quantidadeDebitar` and recalculated `totalCentavos = novaQuantidade * unitarioCentavos` are executed. If `novaQuantidade === 0`, `ativo` is automatically flipped to `false`.
- **Concurrency Protection**: The update is executed conditionally:
  `tx.produtoEstoque.updateMany({ where: { id: prod.id, quantidade: { gte: req.quantidadeDebitar } }, data: { ... } })`. If `count === 0`, concurrent sales depleted the stock between preview and execution. The transaction throws a concurrency error and rolls back cleanly with 0 writes, returning HTTP 409 Conflict.
- **Daily Sales Ledger Synchronization**: Sales on date `data` are recorded in `lancamentos_diarios`. If an entry for `data` already exists, `valorCartaoCentavos` or `valorDinheiroCentavos` and `totalDiarioCentavos` are incremented. If not, a new record is created. This guarantees that `Total Diário = Cartão + Dinheiro` is maintained continuously without floating point discrepancies.
- **Audit Logging**: An immutable snapshot is appended to `historico_baixas` for each deducted item, linking to `lancamentoDiario.id` and `produto.id` with historical snapshots of `codigoProduto`, `discriminacaoProduto`, and `unitarioCentavos`.

#### Concrete Endpoint Specification
- **Path**: `POST /api/baixa/executar`
- **Headers**: `Content-Type: application/json`
- **Request Body (JSON)**:
  ```typescript
  interface ExecutarRequestBody {
    valorAlvoCentavos?: number;
    formaPagamento: "CARTAO" | "DINHEIRO";
    data: string;                     // ISO Date YYYY-MM-DD (e.g. "2026-11-05")
    observacoes?: string;
    itens: Array<{
      produtoId: string;
      quantidadeDebitar: number;      // Integer >= 1
    }>;
  }
  ```
- **Validation Rules**:
  - `itens`: Non-empty array (`itens.length >= 1`). Duplicate `produtoId` entries are merged by summing `quantidadeDebitar`. Each `quantidadeDebitar` must be a positive integer (`Number.isInteger(q) && q > 0`). Return HTTP 400 on violations.
  - `formaPagamento`: Must be `"CARTAO"` or `"DINHEIRO"`. Return HTTP 400 on violations.
  - `data`: Regex `/^\d{4}-\d{2}-\d{2}$/` and valid calendar date. Retroactive dates are valid. Return HTTP 400 on violations.
- **Response Body (HTTP 200)**:
  ```json
  {
    "success": true,
    "lancamentoId": "clx_lanc_123",
    "totalDebitadoCentavos": 2550,
    "totalDebitadoBRL": "R$ 25,50",
    "formaPagamento": "CARTAO",
    "dataLancamento": "2026-11-05",
    "itensBaixados": 1,
    "historicoIds": ["clx_hist_456"],
    "detalhesItens": [
      {
        "produtoId": "clx_prod_789",
        "codigo": "001",
        "discriminacao": "Arroz Tipo 1 5kg",
        "quantidadeDebitada": 1,
        "quantidadeRestante": 19,
        "unitarioCentavos": 2550,
        "totalItemCentavos": 2550,
        "ativo": true
      }
    ]
  }
  ```
- **Error Responses**:
  - HTTP 400: Payload malformed, missing fields, non-integer quantity, invalid date or payment method.
  - HTTP 404: One or more `produtoId` does not exist in `produtos_estoque`.
  - HTTP 409: Concurrency conflict — stock was depleted by another session while confirming.
  - HTTP 422: Business rule violation — stock quantity is insufficient (`quantidade < quantidadeDebitar`) or item is inactive.
  - HTTP 500: Database engine or connection error.

---

### 2.3 Route Contract Design: `GET /api/baixa/historico`

#### Rationale & Query Design
- **Audit & Regulatory Compliance**: Operators and store owners need to inspect the immutable audit trail of deductions, filtered by date, product code, or payment method, with pagination to avoid memory exhaustion on large histories.
- **Index Utilization**: Queries filter by `dataHora` (indexed `@@index([dataHora])`), `produtoId` (indexed `@@index([produtoId])`), or join with `lancamentos_diarios` (`@@index([data])`).

#### Concrete Endpoint Specification
- **Path**: `GET /api/baixa/historico`
- **Query Parameters**:
  - `data`: string optional (`YYYY-MM-DD`).
  - `dataInicio` / `dataFim`: string optional (`YYYY-MM-DD`).
  - `codigo`: string optional (exact internal product code).
  - `formaPagamento`: string optional (`CARTAO` or `DINHEIRO`).
  - `limit`: integer optional (default 50, maximum 200).
  - `offset`: integer optional (default 0).
- **Response Body (HTTP 200)**:
  ```json
  {
    "success": true,
    "paginacao": {
      "totalRegistros": 42,
      "limit": 50,
      "offset": 0,
      "temMais": false
    },
    "totais": {
      "quantidadeTotalItensBaixados": 58,
      "valorTotalCentavos": 147500,
      "valorTotalBRL": "R$ 1.475,00"
    },
    "historico": [
      {
        "id": "clx_hist_456",
        "dataHora": "2026-11-05T14:32:00.000Z",
        "produtoId": "clx_prod_789",
        "codigoProduto": "001",
        "discriminacaoProduto": "Arroz Tipo 1 5kg",
        "quantidadeBaixada": 1,
        "unitarioCentavos": 2550,
        "unitarioBRL": "R$ 25,50",
        "totalCentavos": 2550,
        "totalBRL": "R$ 25,50",
        "formaPagamento": "CARTAO",
        "lancamentoDiarioId": "clx_lanc_123",
        "dataFiscalLancamento": "2026-11-05"
      }
    ]
  }
  ```

---

### 2.4 Edge Cases Catalog & Invariant Matrix

| # | Edge Case / Scenario | Severity | Expected Behavior & Mitigation |
|---|----------------------|----------|--------------------------------|
| **EC-01** | Target value $\le 0$ or NaN | High | Reject with HTTP 400. Engine throws `RangeError` / validation error. Error message specifies minimum valid amount (R$ 0,01). |
| **EC-02** | Target value exceeds `100_000_000` (R$ 1.000.000,00) | Medium | Reject with HTTP 400. Protects against computational explosion and unrealistic cash sales. |
| **EC-03** | Empty stock table (`produtos_estoque` has 0 rows) | Medium | Return HTTP 200 with `sugestao.estrategia = "SEM_ESTOQUE"`, `itens: []`, `catalogoProximidade: []`. No 500 error. |
| **EC-04** | All inventory products have `quantidade === 0` and `ativo === false` | Medium | Filtered out by query `where: { ativo: true, quantidade: { gt: 0 } }`. Same graceful empty response. |
| **EC-05** | Exact multiple exists, but available stock is smaller ($k > Qtd$) | High | Engine skips this product as an exact multiple candidate. Moves to next tier (combinations or proximity). |
| **EC-06** | Prime/odd target value (e.g. R$ 0,07 with stock of R$ 0,10) | Medium | Handled by Tier 3 (Minimal Delta Proximity). Suggests item minimizing $\|Total - Alvo\|$ and returns `deltaCentavos = +3` (or closest available). |
| **EC-07** | Two identical items with same unit price qualify for exact match | Low | Deterministic tie-breaker: select item with highest stock quantity to naturally balance inventory turnover. |
| **EC-08** | Multi-item deduction where Item 1 has stock, but Item 2 exceeds stock | Critical | Full ACID rollback. `prisma.$transaction` aborts. Stock of Item 1 remains untouched. Return HTTP 422 with specific product detail. |
| **EC-09** | Concurrent cashier race condition on last unit ($Qtd = 1$) | Critical | Conditional update with `where: { id, quantidade: { gte: debit } }`. The first transaction commits; the second fails (`count === 0`) and rolls back, returning HTTP 409 Conflict. |
| **EC-10** | Stock balance reaches zero ($Qtd_{nova} = 0$) | High | `ativo` flag updated to `false` in the same update statement. Item is immediately excluded from future suggestion queries. |
| **EC-11** | Duplicate `produtoId` in the execution payload array | Medium | Payload pre-processing aggregates quantities by `produtoId` before acquiring transaction locks, avoiding deadlocks or duplicate write errors. |
| **EC-12** | Retroactive sales date (e.g. recording yesterday's sale) | High | Fully supported. Route validates calendar format `YYYY-MM-DD`. `lancamentos_diarios` aggregates correctly under the retroactive date. |
| **EC-13** | Deletion of a product referenced in `historico_baixas` | High | Protected by Prisma foreign key constraint `onDelete: Restrict`. Database rejects deletion, preserving regulatory audit trail. |
| **EC-14** | Deletion of a daily sales ledger record | Low | Prisma foreign key `onDelete: SetNull` sets `lancamentoDiarioId = NULL` in `historico_baixas`, keeping audit snapshots intact. |
| **EC-15** | Payment method case mismatch or trailing spaces (`" cartao "`) | Low | Sanitized via `.trim().toUpperCase()`. If not in `["CARTAO", "DINHEIRO"]`, rejected with clear HTTP 400. |

---

### 2.5 Verification Test Suite Plan

The verification suite is structured in 3 dedicated test files ensuring complete coverage across unit algorithms, database transactions, and HTTP API routes:

```
tests/
├── unit/
│   └── baixa-inteligente.test.ts      # Unit tests for 4-tier algorithm
└── integration/
    ├── baixa-transacao.test.ts        # Database integration for ACID transactions
    └── baixa-api.test.ts              # Next.js App Router API integration tests
```

#### Plan 1: `tests/unit/baixa-inteligente.test.ts` (Unit Test Suite)
- **Suite A: Tier 1 — Exact Unit & Multiple Match**
  1. `U-T1-01`: Matches single product when `(1 * unitarioCentavos) === valorAlvoCentavos` with `quantidade >= 1`.
  2. `U-T1-02`: Tie-breaking chooses product with larger stock when multiple products share identical unit price.
  3. `U-T1-03`: Ignores products with `quantidade === 0` even when unit price equals target value.
  4. `U-T1-04`: Matches multiple units `(k * unitarioCentavos) === valorAlvoCentavos` when $1 < k \le quantidade$.
  5. `U-T1-05`: Rejects multiple match when required $k > quantidade$ available.
  6. `U-T1-06`: Prefers unit match ($k=1$) over multiple match ($k>1$) when both exist.
- **Suite B: Tier 2 — Exact Combinations (Two-Sum & Three-Sum)**
  7. `U-T2-01`: Finds exact combination of 2 distinct products ($A + B = \text{Alvo}$) in $< 2\text{ ms}$ via Hash Map.
  8. `U-T2-02`: Finds exact combination of 3 distinct products ($A + B + C = \text{Alvo}$) within bounded subset-sum.
  9. `U-T2-03`: Does not re-use a single-unit product across multiple combination slots.
  10. `U-T2-04`: Allows combining multiple units of Item A with Item B (e.g. $2A + 1B = \text{Alvo}$) if available.
- **Suite C: Tier 3 — Minimal Delta Proximity Match**
  11. `U-T3-01`: When no exact combination exists, returns nearest combination minimizing $\|Total - Alvo\|$.
  12. `U-T3-02`: Handles prime/odd targets (e.g. R$ 0,07 with lowest item R$ 0,10), returning correct delta.
  13. `U-T3-03`: Sets `estrategia = "PROXIMITY_COMBINATION"` and verifies non-zero `deltaCentavos`.
- **Suite D: Tier 4 — Interactive Assisted Catalog**
  14. `U-T4-01`: Generates proximity-ranked alternative list sorted by $\|unitarioCentavos - valorAlvoCentavos\|$.
  15. `U-T4-02`: Excludes zero-stock and inactive products from the catalog.
  16. `U-T4-03`: Respects `limiteAlternativas` parameter.
- **Suite E: Algorithmic Edge Cases & Performance Benchmarks**
  17. `U-T5-01`: Returns empty suggestion with `SEM_ESTOQUE` when given empty stock array.
  18. `U-T5-02`: Throws `RangeError` on `valorAlvoCentavos <= 0` or non-integer input.
  19. `U-T5-03`: Performance benchmark: executes 2,000 candidate SKUs in $< 5\text{ ms}$.

#### Plan 2: `tests/integration/baixa-transacao.test.ts` (Database Transaction Suite)
- **Suite A: Atomic Stock Decrement & Deactivation**
  1. `I-TX-01`: Atomically decrements single product quantity and updates `totalCentavos`.
  2. `I-TX-02`: Sets `ativo = false` and `totalCentavos = 0` when stock reaches zero.
  3. `I-TX-03`: Executes multi-item atomic decrement across 3 distinct products in a single transaction.
- **Suite B: Rollback & Transactional Integrity**
  4. `I-TX-04`: Rolls back entire transaction when one item requested exceeds available stock (0 partial writes).
  5. `I-TX-05`: Rejects deduction for inactive product (`ativo === false`) and rolls back.
  6. `I-TX-06`: Rejects deduction for non-existent product ID and rolls back.
- **Suite C: Concurrency & Race Condition Defense**
  7. `I-TX-07`: Executes 2 concurrent transactions competing for the last unit ($Qtd = 1$). Exactly 1 succeeds, 1 throws concurrency conflict, ending stock is exactly 0 (never negative).
- **Suite D: Daily Sales Ledger Integration (`lancamentos_diarios`)**
  8. `I-TX-08`: Records transaction under `valorCartaoCentavos` when `formaPagamento = "CARTAO"`.
  9. `I-TX-09`: Records transaction under `valorDinheiroCentavos` when `formaPagamento = "DINHEIRO"`.
  10. `I-TX-10`: Accumulates multiple transactions on the same date into a unified daily total (`Total = Cartão + Dinheiro`).
  11. `I-TX-11`: Supports retroactive date entry for previous day fiscal entries.
- **Suite E: Immutable Audit Trail (`historico_baixas`)**
  12. `I-TX-12`: Inserts audit record with immutable snapshot of code, description, unit price, quantity, and total.
  13. `I-TX-13`: Foreign key constraint enforces `onDelete: Restrict` on product deletion.
  14. `I-TX-14`: Foreign key constraint enforces `onDelete: SetNull` on daily sales entry deletion.

#### Plan 3: `tests/integration/baixa-api.test.ts` (API Routes Suite)
- **Suite A: `POST /api/baixa/sugestao`**
  1. `I-API-01`: Returns 200 OK with exact suggestion for integer `valorAlvoCentavos`.
  2. `I-API-02`: Returns 200 OK with exact suggestion for BRL formatted string `valorAlvoBRL: "R$ 25,50"`.
  3. `I-API-03`: Returns 400 Bad Request on negative, zero, or non-numeric target value.
  4. `I-API-04`: Returns 400 Bad Request on invalid `formaPagamento`.
  5. `I-API-05`: Returns 200 OK with `SEM_ESTOQUE` when inventory is empty.
- **Suite B: `POST /api/baixa/executar`**
  6. `I-API-06`: Returns 200 OK on successful deduction, returning `lancamentoId` and `historicoIds`.
  7. `I-API-07`: Returns 400 Bad Request on empty `itens` array or negative quantity.
  8. `I-API-08`: Returns 422 Unprocessable Entity when requested quantity exceeds stock.
  9. `I-API-09`: Returns 404 Not Found when product ID does not exist.
  10. `I-API-10`: Returns 409 Conflict when concurrent modification occurs.
  11. `I-API-11`: Merges duplicate `produtoId` items in payload and deducts correctly.
- **Suite C: `GET /api/baixa/historico`**
  12. `I-API-12`: Returns 200 OK with audit list filtered by date.
  13. `I-API-13`: Returns 200 OK with pagination metadata (`limit`, `offset`, `totalRegistros`, `temMais`).
  14. `I-API-14`: Returns 200 OK filtered by `formaPagamento` ("CARTAO" / "DINHEIRO").

---

## 3. Caveats

1. **Fractional Stock Quantities (Kg/Granel)**:
   The current Prisma schema defines `quantidade: Int` for `ProdutoEstoque` and `HistoricoBaixa`. Products sold strictly by discrete packaging (UN, CX, PCT, LT) are natively represented. If bulk products (e.g. 1.250 kg) are required in future milestones, a fixed-point integer representation (e.g. grams `quantidadeGramas: Int`) or Decimal schema migration will be necessary.
2. **SQLite In-Memory Concurrency & WAL Locks**:
   In SQLite WAL mode, write operations are serialized via a single writer lock. Under high parallel concurrency tests (e.g. 50 parallel requests), SQLite may throw `SQLITE_BUSY` if `busy_timeout` is exceeded. Our Prisma configuration in `src/lib/prisma.ts` sets `PRAGMA busy_timeout = 5000;`, which safely mitigates concurrency bursts for retail storefront volumes.
3. **Daily Sales Consolidation Model**:
   `LancamentoDiario` has an indexed `data` field (`YYYY-MM-DD`). In our contract, the transaction searches for an existing entry for that date and increments `valorCartaoCentavos` / `valorDinheiroCentavos` / `totalDiarioCentavos`. If no entry exists, it creates one. This ensures one consolidated row per date while preserving complete per-transaction granularity in `historico_baixas`.

---

## 4. Conclusion

The architectural investigation and contract specification for **Milestone 3 (API Contracts, Edge Cases & Verification Suite Plan)** is complete and fully documented.

Key deliverables formulated:
- **API Contracts**: Fully detailed request/response schemas, validation rules, error codes, and performance budgets for:
  - `POST /api/baixa/sugestao`
  - `POST /api/baixa/executar`
  - `GET /api/baixa/historico`
- **Edge Cases Catalog**: 15 concrete boundary cases analyzed with explicit mitigation strategies and HTTP status mappings.
- **Verification Suite Plan**: Complete specifications for 19 unit tests (`baixa-inteligente.test.ts`), 14 transactional integration tests (`baixa-transacao.test.ts`), and 14 API route integration tests (`baixa-api.test.ts`), directly matching the requirements in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and the existing E2E suite.

---

## 5. Verification Method

### How to Independently Verify This Report
1. **Inspect Handoff Report**:
   Read `.agents/teamwork/m3_explorer_3/handoff.md` and check interface alignment against:
   - `prisma/schema.prisma`
   - `src/modules/currency/index.ts`
   - `tests/e2e/helpers/contract-loader.ts`
2. **Execute Existing Test Harness**:
   Verify that current M1/M2 tests pass and Vitest environment is operational:
   ```powershell
   npx vitest run tests/unit/currency.test.ts
   npx vitest run tests/integration/inventory-import.test.ts
   ```
3. **Invalidation Conditions**:
   This contract specification would be invalidated if:
   - Floating-point representations were introduced into the API request/response payloads instead of integer cents or strict BRL formatting.
   - The stock decrement operation permitted negative values or failed to roll back on partial debit failures.
   - The deduction engine latency exceeded 20ms for catalogs of up to 5,000 SKUs.
