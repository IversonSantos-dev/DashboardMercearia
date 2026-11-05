# Handoff Report — Survey Explorer 1 (System Architect & Stack Explorer)

## 1. Observation
- **Ambiente Host Verificado**:
  - Comando: `node -v; npm -v; pnpm -v; python --version; git --version`
  - Saída do comando:
    ```
    v24.20.0
    11.19.0
    10.4.1
    Python 3.14.0
    git version 2.54.0.windows.1
    ```
  - Verificação de SQLite nativo do Node.js:
    - Comando: `node -e "const sqlite = require('node:sqlite'); console.log('node:sqlite is available!', sqlite);"`
    - Saída: `node:sqlite is available! { DatabaseSync: [Function: DatabaseSync], ... }`
  - Verificação de SQLite no Python:
    - Comando: `python -c "import sqlite3; print(sqlite3.sqlite_version)"`
    - Saída: `3.50.4`
  - Diretório de trabalho raiz: `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia` é um repositório greenfield sem arquivos de código legados.
- **Requisitos do Usuário**:
  - Arquivo: `.agents/teamwork/ORIGINAL_REQUEST.md` (Linhas 12-58):
    - R1: Registro de vendas diárias por data (Cartão, Dinheiro, Total = Cartão + Dinheiro), consolidação mensal vs saídas/despesas, precisão estrita em BRL sem float jitter.
    - R2: Parser de inventário Modelo P7 (`.xlsx`, `.csv`) reconhecendo colunas e descartando cabeçalhos administrativos prévios.
    - R3: Algoritmo de sugestão de baixa por valor alvo (múltiplo exato ou combinação mais próxima com prévia antes da confirmação).
    - R4: Atomicidade de transação de débito de estoque (`Qtd = Qtd - Qtd_debitada`, flag inativo se `Qtd <= 0`), lançamento simultâneo no livro diário e histórico de auditoria.
    - R5: Banco relacional local (SQLite via Prisma) modelado para migração transparente para Supabase/PostgreSQL.

## 2. Logic Chain
1. *A partir da observação do ambiente host*: O ambiente possui `Node.js v24.20.0` e `pnpm v10.4.1` já instalados globalmente. `pnpm` oferece resolução rápida e eficiente no Windows sem duplicar dependências.
2. *A partir do requisito de execução local sem atrito*: Uma arquitetura baseada em Next.js 15 (App Router) elimina a necessidade de executar processos separados (Vite + Express), gerenciar portas concorrentes (`5173` vs `3001`), ou configurar proxies e CORS. Uma única porta (`localhost:3000`) serve a UI e os endpoints de API/Server Actions.
3. *A partir do requisito R5 (SQLite -> Supabase/PostgreSQL)*:
   - Drizzle ORM exigiria refatoração de código de esquema ao migrar de `drizzle-orm/sqlite-core` para `drizzle-orm/pg-core`.
   - O Prisma ORM permite migrar para Supabase alterando exclusivamente `provider = "postgresql"` e `url = env("DATABASE_URL")` no `schema.prisma`. Todas as chamadas de API, transações e modelos de dados permanecem 100% inalterados.
   - O Prisma resolve a atomicidade (R4) via `prisma.$transaction(async (tx) => { ... })` com garantia de reversão total (ACID) em caso de falha.
4. *A partir do requisito R1 de precisão numérica monetária estrita*:
   - Números de ponto flutuante em JavaScript (`0.1 + 0.2 = 0.30000000000000004`) causam desvios em somas acumuladas de caixa e inventário.
   - A convenção arquitetural de inteiros em centavos (`valor_unitario_centavos: Int`, `valor_cartao_centavos: Int`, etc.) no banco e no backend elimina qualquer imprecisão de cálculo.
5. *A partir dos requisitos R2, R3 e R4*:
   - Separar a lógica do domínio (`src/modules/parser-p7`, `src/modules/baixa-inteligente`, `src/modules/transacao-caixa`, `src/modules/financeiro`) dos componentes de UI permite testabilidade automatizada e isolada (Vitest) sem overhead de navegador.

## 3. Caveats
- O Windows possui travas de arquivo mais rígidas em bancos SQLite sob concorrência. Foi especificado o padrão Singleton (`globalThis.prisma`) e a ativação do modo WAL (`PRAGMA journal_mode = WAL;`) para evitar erros de `EBUSY` durante o Hot Reload em desenvolvimento.
- As particularidades detalhadas de colunas fiscais do Modelo P7 e os algoritmos exatos de busca combinatorial por valor alvo estão sendo aprofundados pelos exploradores especialistas paralelos (`explorer_survey_2` e `explorer_survey_3`). As interfaces de módulo e tabelas definidas aqui foram desenhadas para acomodar plenamente os requisitos de ambos.

## 4. Conclusion
A stack recomendada e desenhada em detalhes no relatório `survey_architecture.md` é:
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS + Lucide React + shadcn/ui.
- **ORM & Banco**: Prisma ORM com SQLite local (`prisma/dev.db`), estruturado para migração direta ao Supabase PostgreSQL via troca de provider.
- **Precisão Financeira**: Armazenamento e operações em inteiros representando centavos (`centavos: number / Int`), com módulo central de conversão e formatação BRL em `src/lib/currency.ts`.
- **Organização Modular**: Arquitetura orientada a domínios em `src/modules/` para desacoplamento e testes unitários/integrados imediatos com Vitest.

## 5. Verification Method
Para auditar e verificar as conclusões e configurações:
1. Inspecionar o documento técnico detalhado:
   `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\explorer_survey_1\survey_architecture.md`
2. Testar o ambiente host no terminal Windows:
   `node -v; pnpm -v; python --version`
3. Validar a sintaxe do esquema Prisma e sua compatibilidade com SQLite e PostgreSQL conforme descrito na Seção 3 do relatório técnico.
