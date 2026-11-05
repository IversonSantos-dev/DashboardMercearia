# Dispatch: M3 Explorer 3 (API Contracts, Edge Cases & Verification Suite Plan)

## Context
Milestone 3 requires API endpoints for suggestion and deduction execution, plus a comprehensive verification test suite.

## Scope
`src/app/api/baixa/sugestao/route.ts`
`src/app/api/baixa/executar/route.ts`
`src/app/api/baixa/historico/route.ts`
`tests/unit/baixa-inteligente.test.ts`
`tests/integration/baixa-transacao.test.ts`

## Requirements to Investigate
1. **API Contracts**:
   - `POST /api/baixa/sugestao`:
     - Request: `{ valorAlvoBRL?: string, valorAlvoCentavos?: number, formaPagamento: "CARTAO" | "DINHEIRO", data?: string }`
     - Response: `{ success: boolean, sugestao: { estrategia: string, itens: Array<{ id, codigo, barras, discriminacao, quantidadeDisponivel, quantidadeDebitar, unitarioCentavos, totalCentavos }>, totalSugeridoCentavos, deltaCentavos }, catalogoProximidade?: Array<...> }`
   - `POST /api/baixa/executar`:
     - Request: `{ itens: Array<{ produtoId: string, quantidadeDebitar: number }>, formaPagamento: "CARTAO" | "DINHEIRO", data: string }`
     - Response: `{ success: boolean, lancamentoId: string, totalDebitadoCentavos: number, itensBaixados: number }`
   - `GET /api/baixa/historico`:
     - Query: `?data=YYYY-MM-DD` or `?limit=50`
     - Returns audit trail with product names, values, and payment methods.
2. **Edge Cases**:
   - Target value <= 0 or NaN.
   - Insufficient stock / concurrent depletion.
   - Retroactive dates (e.g. sales performed yesterday).
   - Empty catalog / zero products with `ativo === true`.
3. **Verification Plan**:
   - Unit tests for all tiers of the algorithm.
   - Integration tests verifying ACID rollback, balance deactivation, daily sales column accuracy, and audit trail relations.

## Deliverables in Handoff
Write your findings and test specifications to `.agents/teamwork/m3_explorer_3/handoff.md`.
DO NOT edit source code directly.


## 2026-11-05T02:31:32Z
You are M3 Explorer 3 (API Contracts, Edge Cases & Verification Suite Plan).
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_3
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_3\DISPATCH.md
- src\app\api\inventario\import\route.ts (as reference for route structure)

Investigate and design the API route specifications and verification test suite:
1. `/api/baixa/sugestao` (POST): validation, response schema, performance.
2. `/api/baixa/executar` (POST): atomic execution, error handling.
3. `/api/baixa/historico` (GET): querying audit logs.
4. Comprehensive test plan: unit tests for algorithm tiers, integration tests for transaction atomicity, daily sales ledger, and concurrency.
Write your comprehensive report to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_3\handoff.md.
Do NOT edit any source code. When finished, send a brief message with your handoff path.
