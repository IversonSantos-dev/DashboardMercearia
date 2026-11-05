# Dispatch: M4 Explorer 2 (Inventory Management UI)

## Context
Milestone 4 encompasses the User Interface per requirement R2 and feature F22.

## Scope
`src/app/inventario/` and related UI components (`src/components/inventario/`).

## Requirements to Investigate & Design
1. **Model P7 File Upload Interface (`/inventario`)**:
   - Drag & drop and file picker supporting `.xlsx`, `.xls`, `.csv`.
   - Automatic dry run preview via `POST /api/inventario/import?dryRun=true`.
   - Preview card: Total itens lidos, itens válidos, itens em quarentena, valor total do inventário.
   - Quarantine warnings accordion displaying row number, code, severity (`WARNING` / `ERROR`), and reason.
   - "Confirmar Importação" button triggering transactional ingestion (`dryRun=false`).
2. **Stock Catalog Table**:
   - Live query of `produtos_estoque` with search by code, barcode, or description.
   - Status badge (`Em Estoque` with green badge vs `Esgotado` with red/gray badge).
   - Columns: Código, Barras, Discriminação, Unidade, Quantidade, Unitário (BRL), Total (BRL), Status.
   - API endpoint `/api/inventario/produtos` for searching and paginating stock.
3. Integration with Tailwind CSS and Lucide icons.

## Deliverables in Handoff
Write your component architecture, API endpoint specs, and code blueprints to `.agents/teamwork/m4_explorer_2/handoff.md`.
DO NOT edit source code directly.

## 2026-11-05T11:50:10Z
From: 909b2f8c-83c6-47de-829a-608c7e57ee1e
You are M4 Explorer 2 (Inventory Management UI).
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_2
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_2\DISPATCH.md
- src\app\api\inventario\import\route.ts

Investigate and design the Inventory Management UI (`src/app/inventario/page.tsx`):
1. Model P7 file uploader (drag & drop + file picker) supporting `.xlsx`, `.xls`, `.csv`.
2. Dry run preview integration via `POST /api/inventario/import?dryRun=true` with summary card and quarantine warnings accordion.
3. Commit button executing real batch ingestion (`dryRun=false`).
4. Live stock catalog table with search by code/barcode/description, status badges (Em Estoque / Esgotado), and pagination.
5. Search/listing API endpoint `GET /api/inventario/produtos`.
Write your complete report to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m4_explorer_2\handoff.md.
Do NOT edit any source code. When finished, send a brief message with your handoff path.
