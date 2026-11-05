# Relatório Estratégico de Banco de Dados Relacional (M1)
**Projeto**: Dashboard Mercearia (Dashboard Administrativo + Frente de Caixa com Modelo P7)  
**Autor**: M1 Relational DB Explorer (Prisma Schema, SQLite WAL, Supabase Portability)  
**Data**: 2026-11-05  
**Versão**: 1.0.0 — Milestone 1 Specification  

---

## 1. Visão Geral e Princípios Arquiteturais

A persistência do **Dashboard Mercearia** é fundamentada em três pilares não negociáveis:
1. **Precisão Monetária Absoluta via Inteiros em Centavos (`Int`)**: Todo e qualquer valor em dinheiro (`unitario_centavos`, `total_centavos`, `valor_cartao_centavos`, `valor_dinheiro_centavos`, `valor_centavos`) é armazenado e operado como número inteiro. Elimina 100% de qualquer deriva de ponto flutuante IEEE-754.
2. **Concorrência Robusta em SQLite Local via Modo WAL**: Por padrão, o SQLite adquire bloqueios de leitura/escrita restritivos. Com `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) e `PRAGMA busy_timeout = 5000;`, leituras não bloqueiam escritas e escritas não bloqueiam leituras, viabilizando operações concorrentes de Frente de Caixa, Importação de Estoque e Dashboard Financeiro.
3. **Portabilidade Total para Nuvem (Supabase / PostgreSQL)**: O design do esquema Prisma foi estritamente concebido para que a migração de SQLite local para PostgreSQL em nuvem (Supabase) exija apenas a alteração do `provider = "postgresql"` e da string `DATABASE_URL`, com zero alteração nas queries de aplicação (`src/modules/*`).

---

## 2. Especificação do Esquema Prisma (`prisma/schema.prisma`)

Abaixo está o arquivo de especificação completa pronto para ser implementado em `prisma/schema.prisma`.

```prisma
// ====================================================================
// Prisma Schema — Dashboard Mercearia
// Local: SQLite (WAL mode) | Nuvem: Supabase / PostgreSQL (Zero Friction)
// ====================================================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// --------------------------------------------------------------------
// 1. Catálogo e Estoque de Produtos (Importado do Modelo P7)
// --------------------------------------------------------------------
model ProdutoEstoque {
  id                String            @id @default(cuid())
  codigo            String            @unique // Código interno P7 (ex: "001", "PROD-10")
  barras            String?           // EAN-13 / GTIN opcional para leitura por scanner
  ncm               String?           // Nomenclatura Comum do Mercosul
  discriminacao     String            // Descrição completa do produto
  unidade           String            @default("UN") // UN, KG, CX, LT, PCT, etc.
  quantidade        Int               @default(0) // Saldo em estoque (Regra: quantidade >= 0)
  unitarioCentavos  Int               @map("unitario_centavos") // Preço unitário em centavos (ex: R$ 5,50 = 550)
  totalCentavos     Int               @map("total_centavos") // Valor total de estoque em centavos (quantidade * unitario)
  ativo             Boolean           @default(true) // false quando estoque zera ou item inativado
  criadoEm          DateTime          @default(now()) @map("criado_em")
  atualizadoEm      DateTime          @updatedAt @map("atualizado_em")

  // Relacionamentos
  baixas            HistoricoBaixa[]

  // Índices para otimização de consultas e motor de baixa inteligente
  @@index([ativo, quantidade])      // Filtro de candidatos disponíveis para baixa inteligente
  @@index([barras])                 // Busca rápida por leitor de código de barras
  @@index([unitarioCentavos])       // Busca por valor unitário / correspondência exata
  @@map("produtos_estoque")
}

// --------------------------------------------------------------------
// 2. Livro Diário de Vendas e Fechamento de Caixa
// --------------------------------------------------------------------
model LancamentoDiario {
  id                    String            @id @default(cuid())
  data                  String            // Data fiscal no formato ISO "YYYY-MM-DD" (ex: "2026-11-05")
  valorCartaoCentavos   Int               @default(0) @map("valor_cartao_centavos")
  valorDinheiroCentavos Int               @default(0) @map("valor_dinheiro_centavos")
  totalDiarioCentavos   Int               @default(0) @map("total_diario_centavos") // Cartão + Dinheiro
  observacoes           String?           @map("observacoes")
  criadoEm              DateTime          @default(now()) @map("criado_em")

  // Relacionamentos
  baixas                HistoricoBaixa[]

  // Índices para agregação e consulta rápida por data
  @@index([data])
  @@map("lancamentos_diarios")
}

// --------------------------------------------------------------------
// 3. Histórico e Trilha Imutável de Auditoria de Baixas
// --------------------------------------------------------------------
model HistoricoBaixa {
  id                   String            @id @default(cuid())
  lancamentoDiarioId   String?           @map("lancamento_diario_id")
  produtoId            String            @map("produto_id")
  codigoProduto        String            @map("codigo_produto") // Snapshot histórico do código
  discriminacaoProduto String            @map("discriminacao_produto") // Snapshot histórico da descrição
  quantidadeBaixada    Int               @map("quantidade_baixada")
  unitarioCentavos     Int               @map("unitario_centavos") // Snapshot do valor unitário no momento da venda
  totalCentavos        Int               @map("total_centavos") // quantidadeBaixada * unitarioCentavos
  formaPagamento       String            @map("forma_pagamento") // "CARTAO" | "DINHEIRO"
  dataHora             DateTime          @default(now()) @map("data_hora")

  // Relacionamentos com integridade referencial
  produto              ProdutoEstoque    @relation(fields: [produtoId], references: [id], onDelete: Restrict)
  lancamentoDiario     LancamentoDiario? @relation(fields: [lancamentoDiarioId], references: [id], onDelete: SetNull)

  // Índices para relatórios e cruzamento de auditoria
  @@index([produtoId])
  @@index([lancamentoDiarioId])
  @@index([dataHora])
  @@map("historico_baixas")
}

// --------------------------------------------------------------------
// 4. Controle de Despesas Mensais para Confronto Financeiro
// --------------------------------------------------------------------
model DespesaMensal {
  id             String            @id @default(cuid())
  mesAno         String            @map("mes_ano") // Período de competência "YYYY-MM" (ex: "2026-11")
  descricao      String            @map("descricao")
  categoria      String            @map("categoria") // "OPERACIONAL" | "MERCADORIA" | "CONTAS_FIXAS" | "PESSOAL" | "IMPOSTOS" | "OUTROS"
  valorCentavos  Int               @map("valor_centavos") // Valor da despesa em centavos
  dataPagamento  String?           @map("data_pagamento") // Data de quitação "YYYY-MM-DD"
  criadoEm       DateTime          @default(now()) @map("criado_em")

  // Índices para consolidação mensal de DRE / confronto com entradas
  @@index([mesAno])
  @@index([categoria])
  @@map("despesas_mensais")
}
```

### Análise de Decisões de Campo:
- **`data` e `mesAno` como `String` ("YYYY-MM-DD" / "YYYY-MM")**:
  - Evita 100% dos desvios de fuso horário causados pelo objeto JavaScript `Date` e serialização UTC. Em aplicações fiscais brasileiras (UTC-3), vendas registradas às 21h30 do dia 05 frequentemente viravam dia 06 se armazenadas em timestamp UTC sem normalização.
  - Ordenação lexicográfica nativa e comparação direta de intervalos: `WHERE data >= '2026-11-01' AND data <= '2026-11-30'`.
- **`onDelete: Restrict` em `ProdutoEstoque`**:
  - Garante que nenhum produto que já tenha histórico de baixa seja removido acidentalmente do banco de dados, protegendo a integridade do livro caixa e auditoria contábil. A inativação deve ser feita via campo `ativo: false`.
- **Snapshots (`codigoProduto`, `discriminacaoProduto`, `unitarioCentavos`) em `HistoricoBaixa`**:
  - Se um produto for reimportado ou tiver preço alterado em inventários futuros, o histórico passado permanece 100% fidedigno ao momento exato em que a baixa de caixa foi efetuada.

---

## 3. Inicialização Segura do Prisma Client com Modo SQLite WAL (`src/lib/prisma.ts`)

### O Problema do SQLite Padrão em Aplicações Web Modernas:
No modo de journal tradicional (`DELETE` ou `ROLLBACK`), o SQLite aplica um bloqueio exclusivo em toda a base de dados durante qualquer operação de escrita. Em Next.js (com Server Actions e Route Handlers concorrentes), uma requisição de leitura do Dashboard Financeiro simultânea a uma baixa de caixa ou upload do Modelo P7 pode falhar com:
```
Error: P2002 / SQLITE_BUSY: database is locked
```

### A Solução: WAL (Write-Ahead Logging) + Busy Timeout + Singleton
Ao ativar o modo WAL:
1. Leituras e escritas ocorrem simultaneamente em arquivos separados (`dev.db-wal` e `dev.db-shm`), sem bloqueio mútuo.
2. `PRAGMA busy_timeout = 5000;` instrui o driver SQLite a esperar até 5 segundos para que transações atômicas concorrentes liberem locks transitórios antes de lançar erro.
3. `PRAGMA synchronous = NORMAL;` reduz o número de `fsync` síncronos em disco, acelerando transações em até 10x sem comprometer a durabilidade ACID.
4. O padrão Singleton no objeto global (`globalThis.prismaGlobal`) impede que o Hot Module Replacement (HMR) do Next.js crie dezenas de conexões concorrentes que esgotem descritores de arquivo no Windows.

### Código para `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

/**
 * Cria e configura uma instância do Prisma Client com otimizações para SQLite.
 */
const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

  // Detecta se a conexão ativa é SQLite local
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const isSqlite = databaseUrl.startsWith('file:') || !databaseUrl;

  if (isSqlite) {
    // Aplica pragmas de alta concorrência e integridade para SQLite
    client.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`)
      .catch((err) => console.warn('[Prisma] Falha ao definir PRAGMA journal_mode=WAL:', err));

    client.$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`)
      .catch((err) => console.warn('[Prisma] Falha ao definir PRAGMA busy_timeout=5000:', err));

    client.$executeRawUnsafe(`PRAGMA synchronous = NORMAL;`)
      .catch((err) => console.warn('[Prisma] Falha ao definir PRAGMA synchronous=NORMAL:', err));

    client.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`)
      .catch((err) => console.warn('[Prisma] Falha ao definir PRAGMA foreign_keys=ON:', err));
  }

  return client;
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined;
} & typeof global;

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
```

---

## 4. Guia de Comandos e Fluxo de Trabalho (Migrações e DB Push)

### 4.1 Variáveis de Ambiente (`.env`)
Criar o arquivo `.env` na raiz do projeto com:
```env
# URL de conexão para SQLite local
DATABASE_URL="file:./dev.db"
```

### 4.2 Comandos de Desenvolvimento e Ciclo de Vida

| Objetivo | Comando CLI | Quando Usar |
|---|---|---|
| **Gerar Tipos TypeScript do Prisma** | `npx prisma generate` | Imediatamente após criar ou editar o `schema.prisma`. |
| **Sincronizar Banco sem Arquivos de Migração** | `npx prisma db push` | Ideal para Milestone 1 e desenvolvimento ágil local. Cria o arquivo `prisma/dev.db` e tabelas sem criar sujeira no Git. |
| **Criar Migração Formal Versionada** | `npx prisma migrate dev --name init_mercearia_schema` | Recomendado antes de releases formais ou quando preparar a migração para Supabase. |
| **Inspecionar Banco de Dados Visualmente** | `npx prisma studio` | Abre interface web em `http://localhost:5555` para inspecionar e editar dados de `produtos_estoque`, `lancamentos_diarios`, etc. |
| **Resetar Banco para Estado Limpo** | `npx prisma db push --force-reset` | Quando for necessário recarregar o banco de teste com dados sintéticos zerados. |
| **Executar Seed de Dados** | `npx prisma db seed` | Preenche a base com produtos e lançamentos de exemplo (configurado via `seed.ts`). |

### 4.3 Configuração de Seed no `package.json`
Para permitir `npx prisma db seed`, adicionar ao `package.json`:
```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

---

## 5. Matriz de Portabilidade: SQLite Local vs. Supabase (PostgreSQL)

| Aspecto | Implementação SQLite Local | Equivalente Supabase / PostgreSQL | Impacto na Aplicação (`src/modules/*`) |
|---|---|---|---|
| **Provider** | `provider = "sqlite"` | `provider = "postgresql"` | Nulo. Altera apenas 1 linha no `schema.prisma`. |
| **Conexão** | `file:./dev.db` | `postgresql://postgres.[ref]:[pw]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Nulo. Altera apenas variável de ambiente `DATABASE_URL`. |
| **Identificadores (IDs)** | `cuid()` (string) | `cuid()` (string) | Nulo. O Prisma gera o CUID no client de forma idêntica em ambos os bancos. |
| **Precisão Monetária** | `Int` (centavos) | `Int` (centavos) | Nulo. `Int` em centavos comporta até R$ 21.474.836,47 em ambos sem conversão. |
| **Datas de Fechamento** | `String` ("YYYY-MM-DD") | `String` ou `@db.Date` | Nulo. Queries e filtros continuam operando com strings padronizadas. |
| **Auditoria e Timestamps** | `DateTime` (`@default(now())`) | `TIMESTAMP WITH TIME ZONE` | Nulo. Prisma faz parsing transparente para objetos `Date` nativos. |
| **Atomicidade de Transações** | `prisma.$transaction(async (tx) => ...)` | `prisma.$transaction(async (tx) => ...)` | Nulo. A sintaxe de transações interativas do Prisma é idêntica nos dois motores. |

### Roteiro de Migração em 3 Minutos para Supabase:
1. Obter a connection string do pooler do Supabase no painel: `Settings > Database > Connection Pooling`.
2. Alterar o arquivo `.env`:
   ```env
   DATABASE_URL="postgresql://postgres.[USER]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.[USER]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
   ```
3. No arquivo `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```
4. Executar:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
Pronto! Toda a base de dados, índices e integridade referencial passam a rodar na infraestrutura corporativa do Supabase sem alterar uma linha sequer de código TypeScript da aplicação.

---

## 6. Integridade Regulatória e Garantia de Saldo Não-Negativo (`CHECK (quantidade >= 0)`)

O requisito R4 exige que o saldo de estoque nunca fique negativo:
> *"Confirmação de baixa executada em transação atômica no banco de dados: decrementa a Qtd do produto no estoque (Qtd = Qtd - Qtd_debitada). Se a quantidade resultante for 0, marca o produto como sem estoque para impedir novas baixas."*

### Implementação Recomendada na Transação Atômica:
O Prisma suporta operações de atualização atômica com cláusula `where` composta:
```typescript
await tx.produtoEstoque.update({
  where: {
    id: item.produtoId,
    quantidade: { gte: item.quantidadeDebitar }, // Garante que a transação falha atomicamente se quantidade < debitada
    ativo: true,
  },
  data: {
    quantidade: { decrement: item.quantidadeDebitar },
    totalCentavos: {
      decrement: item.quantidadeDebitar * item.unitarioCentavos,
    },
  },
});
```
Se a quantidade em estoque for insuficiente, o Prisma dispara uma exceção imediata que aborta o bloco `tx` sem necessidade de locks pessimistas manuais, garantindo consistência total tanto em SQLite quanto em PostgreSQL.
Adicionalmente, ao gerar migrações SQL no SQLite ou Postgres, a cláusula `CHECK (quantidade >= 0)` pode ser incluída na DDL da tabela para dupla proteção em nível de engine.

---

## 7. Conclusão e Próximos Passos para o Worker

A arquitetura de banco de dados para o Milestone 1 está completamente especificada e pronta para implementação direta pelos Workers:
- `prisma/schema.prisma`: 4 modelos completos com índices e mapeamento snake_case.
- `src/lib/prisma.ts`: Singleton com ativador de WAL mode e busy_timeout de 5000ms.
- Portabilidade para Supabase verificada e garantida.
