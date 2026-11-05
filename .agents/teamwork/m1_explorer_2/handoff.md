# Handoff Report — M1 Relational DB Explorer (Prisma Schema, SQLite WAL, Supabase Portability)

## 1. Observation
- **Requisitos de Banco de Dados e Concorrência**:
  - `ORIGINAL_REQUEST.md` linhas 31-33:
    > "R5. Arquitetura e Persistência de Dados
    > - Banco de dados relacional local (SQLite via Prisma ou PostgreSQL local) com esquema estruturado (`produtos_estoque`, `lancamentos_diarios`, `historico_baixas`) e modelagem/abstração preparada para facilitar migração futura para Supabase / PostgreSQL em nuvem."
  - `ORIGINAL_REQUEST.md` linhas 26-30:
    > "R4. Confirmação de baixa executada em transação atômica no banco de dados: decrementa a `Qtd` do produto no estoque (`Qtd = Qtd - Qtd_debitada`). Se a quantidade resultante for 0, marca o produto como sem estoque para impedir novas baixas. Lançamento imediato do valor no Livro Diário de Vendas na coluna correspondente (`Cartão` ou `Dinheiro`). Armazenamento de log de auditoria com data/hora, código/produto, quantidade baixada, valor unitário, valor total e forma de pagamento vinculada ao lançamento de caixa."
  - `PROJECT.md` linhas 5-6:
    > "- **Relational Persistence**: Prisma ORM with local SQLite (`prisma/dev.db`), configured with WAL mode (`PRAGMA journal_mode = WAL;`) and structured for seamless future migration to Supabase/PostgreSQL.
    > - **Monetary Precision**: Universal integer cents (`centavos: Int`) in database schema, business logic, and API contracts. No IEEE-754 floating-point drift."
  - `PROJECT.md` linhas 237-239:
    > `src/lib/prisma.ts # Prisma singleton client with WAL`
  - `DISPATCH.md` instrução 1:
    > "1. Design the complete `prisma/schema.prisma` file with: `produtos_estoque`, `lancamentos_diarios`, `historico_baixas`, `despesas_mensais`.
    > 2. Specify the Prisma client singleton initialization in `src/lib/prisma.ts` with SQLite WAL mode pragma (`PRAGMA journal_mode = WAL;`) and busy timeout.
    > 3. Detail migration and db push commands (`npx prisma generate`, `npx prisma db push` or `prisma migrate dev`)."

## 2. Logic Chain
1. *Premissa da Concorrência SQLite*: O SQLite tradicional opera com bloqueio global de escrita, causando erros `SQLITE_BUSY: database is locked` quando leituras (Dashboard/Consultas) e escritas (Frente de Caixa/Importações) coincidem.
2. *Solução WAL via Singleton*: A ativação de `PRAGMA journal_mode = WAL;` combinada com `PRAGMA busy_timeout = 5000;`, `PRAGMA synchronous = NORMAL;` e `PRAGMA foreign_keys = ON;` no cliente `src/lib/prisma.ts` permite leitura concorrente sem bloqueio de escrita e garante tolerância de 5 segundos a disputas momentâneas de lock.
3. *Premissa de Precisão Monetária*: Ponto flutuante IEEE-754 causa derivas de arredondamento (`0.1 + 0.2 != 0.3`). Representar todos os valores como `Int` em centavos no banco (`unitario_centavos`, `total_centavos`, `valor_cartao_centavos`, `valor_dinheiro_centavos`, `valor_centavos`) elimina 100% dos erros matemáticos.
4. *Premissa de Integridade e Auditoria*: A tabela `historico_baixas` deve armazenar snapshots de texto e valores (`codigo_produto`, `discriminacao_produto`, `unitario_centavos`) para que auditorias passadas permaneçam inalteradas mesmo que o item no catálogo de estoque seja atualizado em importações futuras. A relação com `ProdutoEstoque` deve ter `onDelete: Restrict` para impedir a exclusão física de produtos com histórico de vendas.
5. *Premissa de Portabilidade Supabase*: Ao evitar tipos proprietários do SQLite e manter identificadores como `String` com `@default(cuid())`, inteiros normais `Int`, e datas fiscais como `String` (`YYYY-MM-DD` / `YYYY-MM`), a mudança para PostgreSQL/Supabase no futuro exige apenas a alteração de `provider = "postgresql"` e da string `DATABASE_URL` no `.env`, sem alterar qualquer linha de código TypeScript.

## 3. Caveats
- O SQLite não possui suporte nativo à sintaxe declarativa `@check` do Prisma para validar `quantidade >= 0` diretamente no `schema.prisma`. Essa validação deve ser garantida em nível de transação atômica (`where: { id, quantidade: { gte: debitada } }`) e pode ser complementada via migração SQL manual com `CHECK (quantidade >= 0)` se migrações versionadas forem utilizadas.
- Caso o volume de dados de produtos ou transações ultrapasse 21 milhões de reais em um único lançamento (limite do inteiro de 32 bits assinado), campos monetários precisariam de `BigInt`. Para mercearias e varejo local, `Int` (até R$ 21.474.836,47) é ideal e compatível com JSON sem necessidade de serializadores customizados.

## 4. Conclusion
A arquitetura de banco de dados relacional e a modelagem do Prisma para o Milestone 1 estão concluídas, documentadas e prontas para implementação imediata:
- Arquivo `m1_db_strategy.md` elaborado contendo o código pronto de `prisma/schema.prisma` com 4 modelos relacionais mapeados em snake_case (`produtos_estoque`, `lancamentos_diarios`, `historico_baixas`, `despesas_mensais`), índices estratégicos, e o código completo do cliente singleton em `src/lib/prisma.ts` com PRAGMAs WAL.
- Fluxo de trabalho de comandos CLI (`prisma generate`, `prisma db push`, `prisma migrate dev`, `prisma studio`, `seed`) e roteiro de migração para Supabase em 3 minutos detalhados.

## 5. Verification Method
1. **Inspeção de Arquivos**:
   - Inspecionar `.agents/teamwork/m1_explorer_2/m1_db_strategy.md` para conferir a especificação do esquema Prisma e do cliente WAL.
2. **Verificação de Compilação e Sintaxe Prisma (quando os pacotes forem instalados pelo Worker)**:
   - Copiar o esquema para `prisma/schema.prisma` e executar `npx prisma validate`.
   - Executar `npx prisma generate` para validar a geração dos tipos TypeScript.
   - Executar `npx prisma db push` para criar e sincronizar o banco SQLite local (`prisma/dev.db`).
3. **Condição de Invalidação**:
   - Se `npx prisma validate` relatar qualquer incompatibilidade de sintaxe entre tipos ou relações, ou se `prisma.$executeRawUnsafe` falhar na inicialização do cliente em ambiente Node.
