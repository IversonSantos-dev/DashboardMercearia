# Dispatch: M3 Explorer 1 (Deduction Algorithm & Combinatorial Search)

## Context
Milestone 3 focuses on the Intelligent Deduction Engine (Baixa Inteligente por Valor) per requirements R3 and features F13, F14, F15, F16.

## Scope
`src/modules/baixa-inteligente/`

## Requirements to Investigate
1. **Tier 1 (Exact Unit & Multiple)**:
   - Given `valorAlvoCentavos > 0`, find product where `(1 * unitarioCentavos) === valorAlvoCentavos` with `quantidade >= 1` and `ativo === true`.
   - If not found, find product where `(k * unitarioCentavos) === valorAlvoCentavos` with `1 < k <= quantidade` and `ativo === true`.
2. **Tier 2 (Exact Combinations - Two-Sum / Multi-Item)**:
   - If no single product matches exactly, search combinations of 2 or 3 distinct products where `sum(k_i * unitarioCentavos_i) === valorAlvoCentavos` within available quantities. Must execute in < 2ms using hash-maps / bounded search.
3. **Tier 3 (Minimal Delta Proximity)**:
   - If no exact multiple or combination exists, find the nearest combination minimizing `|sum - valorAlvoCentavos|`.
4. **Tier 4 (Assisted Interactive Catalog)**:
   - Provide a ranked list of available products ordered by unit price proximity to `valorAlvoCentavos` for assisted manual selection.
5. All calculations in integer cents using `src/modules/currency/index.ts`.

## Deliverables in Handoff
Write your full analysis, algorithm pseudocode, data structures, and edge-case handling to `.agents/teamwork/m3_explorer_1/handoff.md`.
DO NOT edit source code directly.


## 2026-11-05T02:31:32Z
You are M3 Explorer 1 (Deduction Algorithm & Combinatorial Search).
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_1
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_1\DISPATCH.md
- src\modules\currency\index.ts
- prisma\schema.prisma

Investigate and design the intelligent deduction engine in `src/modules/baixa-inteligente/`:
1. Multi-tier matching (exact unit q=1, exact multiple q>1, fast hash-map combinations for 2-3 items in < 2ms, minimal delta proximity match, assisted catalog).
2. Strict integer cents arithmetic with zero floating-point inaccuracy.
3. Filtering for active stock (`quantidade > 0` and `ativo === true`).
Write your comprehensive report to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_explorer_1\handoff.md.
Do NOT edit any source code. When finished, send a brief message with your handoff path.
