## 2026-11-05T01:30:19Z
Your working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m2_explorer_3
Your identity: M2 Import API & Ingestion Explorer

MANDATORY FIRST STEP:
Read the user requirements at:
c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture at:
c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\PROJECT.md
Read the fiscal specification at:
c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\explorer_survey_2\survey_model_p7.md

Milestone 2 Scope:
1. Design the API endpoint src/app/api/inventario/import/route.ts accepting multipart/form-data:
   - Validates file presence and extension (.xlsx, .csv).
   - Calls parseModelP7File(buffer, fileName).
   - Returns preview and validation report if query param ?dryRun=true.
   - Executes transactional upsert into produtos_estoque via Prisma (prisma.$transaction) on confirmation:
     Upsert by codigo: update existing stock quantity (quantidade = quantidade_importada), unit price, total, or insert new record.
   - Sets ativo = true when quantity > 0.
2. Design integration tests (tests/integration/inventory-import.test.ts) validating the API route and database persistence.
3. Write your recommendations in handoff.md and send a message when finished.
