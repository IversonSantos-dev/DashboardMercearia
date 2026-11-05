## 2026-11-05T01:40:41Z
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_worker
Your identity: M2 Implementation Worker (Model P7 Inventory Parser, Synthetic Fixtures & Import API)

MANDATORY FIRST STEP:
Read the user requirements at:
c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture and interface contracts at:
c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md

MANDATORY EXPLORER STRATEGY BLUEPRINTS (Read all 3 thoroughly before writing code):
1. c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_1\handoff.md
   (Code ready at: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_1\proposed_index.ts)
2. c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_2\handoff.md
   (Code ready at: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_2\spec_fixtures_and_tests.md)
3. c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_3\handoff.md
   (Code ready in handoff sections 4.1 and 4.2)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership:
You own exclusively:
- `src/modules/parser-p7/index.ts`
- `tests/fixtures/generate-fixtures.ts`
- `tests/fixtures/p7_padrao_completo.xlsx`
- `tests/fixtures/p7_padrao_completo.csv`
- `tests/fixtures/p7_preambulo_longo.xlsx`
- `tests/fixtures/p7_encoding_latin1.csv`
- `tests/fixtures/p7_delimitador_virgula.csv`
- `tests/fixtures/p7_casos_limite_e_erros.xlsx`
- `tests/unit/parser-p7.test.ts`
- `src/app/api/inventario/import/route.ts`
- `tests/integration/inventory-import.test.ts`

Tasks to execute:
1. Implement `src/modules/parser-p7/index.ts` from m2_explorer_1 proposed_index.ts. Ensure dynamic header anchor scoring (score >= 4/5), delimiter sniffer (;, ,, \t), Windows-1252/UTF-8 transcoding, stop conditions, currency centavos conversion via `src/modules/currency`, and row validation/quarantine.
2. Implement `tests/fixtures/generate-fixtures.ts` from m2_explorer_2 spec and execute it via `npx tsx tests/fixtures/generate-fixtures.ts` to generate all 6 synthetic test fixtures.
3. Implement `tests/unit/parser-p7.test.ts` from m2_explorer_2 spec.
4. Implement `src/app/api/inventario/import/route.ts` from m2_explorer_3 handoff (supports multipart/form-data, ?dryRun=true preview, duplicate consolidation, chunked transactional upsert via Prisma with ativo=true).
5. Implement `tests/integration/inventory-import.test.ts` from m2_explorer_3 handoff.
6. Run all verification checks:
   - `pnpm test` (verify all unit and integration tests pass 100%)
   - `npx tsc --noEmit` (verify 0 compilation errors)
   - `pnpm build` (verify Next.js production build succeeds)
7. Write `handoff.md` summarizing what you implemented, command outputs, test results, and file layout.
8. Send a message to the orchestrator when finished.
