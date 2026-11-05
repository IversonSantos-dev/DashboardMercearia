# Dispatch: M4 Explorer 3 (Financial Dashboard, Monthly Closure & Expenses)

## Context
Milestone 4 encompasses the Financial Dashboard and Cash Closure per requirements R1, R5 and features F23, F24, F25.

## Scope
`src/app/financeiro/`, `src/app/api/financeiro/`, `src/app/api/despesas/`, and shared navigation shell (`src/components/layout/`).

## Requirements to Investigate & Design
1. **Daily Financial View (`F23`)**:
   - Table of daily sales: Data (YYYY-MM-DD), Cartão (BRL), Dinheiro (BRL), Total Diário (`Total = Cartão + Dinheiro`).
   - Strict monetary accuracy with integer cents.
   - Filter by date range (e.g. current month, custom dates).
2. **Monthly Financial Consolidation View (`F24`)**:
   - Month picker (e.g. "Novembro / 2026").
   - Summary metric cards: Total Cartão, Total Dinheiro, Total Geral Entradas, Total Saídas (Despesas), Saldo Líquido (`Entradas - Saídas`).
   - Confrontation table and visual breakdown.
3. **Expense Management Subsystem (`F25`)**:
   - API endpoints: `GET /api/despesas`, `POST /api/despesas`, `DELETE /api/despesas/[id]`.
   - Database model `despesas_mensais`: `id`, `descricao`, `categoria`, `valorCentavos`, `data`, `mesReferencia`, `pago`.
   - UI modal to register expenses with category (Aluguel, Energia, Fornecedores, Pessoal, Diversos), date, value (BRL).
4. **App Navigation Shell**:
   - Top navbar / sidebar with brand identity ("Mercearia - Controle & Caixa").
   - Navigation links: Frente de Caixa (`/caixa`), Estoque (`/inventario`), Financeiro (`/financeiro`), Dashboard (`/`).

## Deliverables in Handoff
Write your component architecture, API endpoint specs, and code blueprints to `.agents/teamwork/m4_explorer_3/handoff.md`.
DO NOT edit source code directly.


## 2026-11-05T11:50:10Z
You are M4 Explorer 3 (Financial Dashboard, Monthly Closure & Expenses).
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_3
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_3\DISPATCH.md
- prisma\schema.prisma (LancamentoDiario & DespesaMensal models)

Investigate and design the Financial Dashboard & Expense Subsystem:
1. Daily Financial View: Table with Date, Cartão, Dinheiro, Total Diário (`Total = Cartão + Dinheiro`).
2. Monthly Financial Consolidation View: Monthly picker, Total Cartão, Total Dinheiro, Total Entradas, Total Despesas, Saldo Líquido (`Entradas - Saídas`).
3. Expense Management Subsystem: API `/api/despesas` (GET/POST/DELETE) and UI modal for registering categorized expenses.
4. Financial query API `GET /api/financeiro/consolidado` and `GET /api/financeiro/diario`.
5. Global app navigation shell (navbar/header linking Home, Caixa, Inventário, Financeiro).
Write your complete report to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_3\handoff.md.
Do NOT edit any source code. When finished, send a brief message with your handoff path.
