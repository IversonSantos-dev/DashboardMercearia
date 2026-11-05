# Dispatch: M2 Fix Explorer 2 (Large Preamble Detection & Header Window Explorer)

## Context
Milestone 2 Gate 1 resulted in FAIL due to m2_challenger_1 REQUEST_CHANGES.
Observation D from `m2_challenger_1`: `detectP7Header` in `src/modules/parser-p7/index.ts:303` is hardcoded to `maxScan = Math.min(25, rows.length)`. Spreadsheets with >25 administrative rows (e.g. 50 lines before the table header) fail with `HEADER_NOT_FOUND`.

## Task
1. Read `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_challenger_1\handoff.md`.
2. Inspect `detectP7Header` in `src/modules/parser-p7/index.ts` (around lines 300-360).
3. Formulate an exact strategy to safely increase `maxScan` (e.g. to 100 or configurable), update the user error message, and ensure header detection remains fast (<2ms) and robust against trailing garbage.
4. Write your findings to `.agents/teamwork/m2_fix_explorer_2/handoff.md`.
DO NOT edit source code directly.

## 2026-11-05T02:06:38Z
You are M2 Fix Explorer 2 (Large Preamble Detection & Header Window Explorer).
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_explorer_2
Read:
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_explorer_2\DISPATCH.md
- c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_challenger_1\handoff.md
- src\modules\parser-p7\index.ts (specifically lines 280 to 360)

Investigate the preamble header scan limit currently capped at 25 lines (`maxScan = Math.min(25, rows.length)`). Formulate the exact fix strategy to safely expand this scan window to 100 lines, ensuring performance remains negligible (<2ms) and files with long administrative preambles are recognized without false positives.
Write your complete report to c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_fix_explorer_2\handoff.md.
Do NOT edit any source code. When finished, send a brief message with your handoff path.
