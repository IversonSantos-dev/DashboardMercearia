# Dispatch: M4 Explorer 1 (POS Frente de Caixa & Deduction Preview Modal)

## Context
Milestone 4 encompasses the User Interface & Financial Dashboard per requirements R3, R4 and features F20, F21.

## Scope
`src/app/caixa/` and related UI components (`src/components/caixa/`).

## Requirements to Investigate & Design
1. **Frente de Caixa POS Interface (`/caixa`)**:
   - Operator inputs: Target Value (R$) with currency formatting/mask, Payment Method toggle (`CARTAO` vs `DINHEIRO`), Date picker (defaults to today's date, allows retroactive selection).
   - "Buscar Sugestão" trigger button calling `POST /api/baixa/sugestao`.
   - Results panel: displays strategy used (`EXACT_UNIT`, `EXACT_MULTIPLE`, `EXACT_COMBINATION`, `PROXIMITY_COMBINATION`, `ASSISTED_CATALOG`), total suggested value, delta, and list of suggested items.
   - Assisted catalog section: interactive table of alternative products for manual selection.
2. **Interactive Deduction Preview Modal (`F21`)**:
   - Confirmation dialog before executing deduction.
   - Displays for each item: Código, Barras, Discriminação, Quantidade a Debitar, Valor Unitário (R$), and Valor Total (R$).
   - Shows summary: Total da Baixa, Forma de Pagamento, Data Fiscal.
   - "Confirmar Baixa" button calling `POST /api/baixa/executar`.
   - Success state displaying receipt details and link to view daily sales.
3. Integration with React 19 / Next.js 15 App Router, Tailwind CSS, and Lucide icons.

## Deliverables in Handoff
Write your component architecture, state management, UX flow, and code blueprints to `.agents/teamwork/m4_explorer_1/handoff.md`.
DO NOT edit source code directly.

## 2026-11-05T11:50:09Z
You are M4 Explorer 1 (POS Frente de Caixa & Deduction Preview Modal).
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_1
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_1\DISPATCH.md
- src\app\api\baixa\sugestao\route.ts
- src\app\api\baixa\executar\route.ts

Investigate and design the Frente de Caixa UI (`src/app/caixa/page.tsx`) and Deduction Preview Modal:
1. Target value input (with BRL currency formatting), Payment method toggle (Cartão / Dinheiro), and Date picker (default today, allows retroactive).
2. "Buscar Sugestão" trigger calling `/api/baixa/sugestao` and rendering suggestion card and assisted catalog.
3. Interactive confirmation modal displaying Code, Barcode, Description, Quantity to Deduct, Unit Price, and Total.
4. "Confirmar Baixa" executing `/api/baixa/executar` and showing receipt confirmation.
Write your complete report to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_1\handoff.md.
Do NOT edit any source code. When finished, send a brief message with your handoff path.
