# Relatório de Levantamento e Arquitetura do Sistema
**Projeto**: Dashboard Mercearia (Dashboard Administrativo + Frente de Caixa com Baixa Inteligente P7)  
**Autor**: Survey Explorer 1 (System Architect & Stack Explorer)  
**Data**: 2026-11-05  
**Ambiente Host**: Windows 11 | Node.js v24.20.0 | pnpm v10.4.1 | npm v11.19.0 | Python 3.14.0  

---

## 1. Sumário Executivo & Decisões Arquiteturais (ADRs)

### ADR-01: Framework Full-Stack
* **Decisão**: Adotar **Next.js 15 (App Router)** com **React 19**, **Tailwind CSS**, **Lucide React** e componentes inspirados no **shadcn/ui**.
* **Motivação**:
  1. *Execução local sem atrito*: Uma única porta (`localhost:3000`), um único comando (`pnpm dev`), zero configuração de proxy reverso ou CORS entre frontend e backend.
  2. *Full-stack unificado*: O processamento pesado de arquivos (`.xlsx`, `.csv` do Modelo P7) e transações atômicas com SQLite rodam no lado do servidor em Node.js (Route Handlers e Server Actions), sem expor regras de negócio ou conexões de banco ao browser.
  3. *Tipagem ponta a ponta*: Tipos TypeScript compartilhados diretamente entre banco de dados (Prisma), rotas de API e componentes de UI do caixa e dashboard.

### ADR-02: Persistência Relacional e Abstração para Supabase / PostgreSQL
* **Decisão**: Adotar **SQLite** local gerenciado via **Prisma ORM**.
* **Motivação**:
  1. *Zero atrito inicial*: Não requer instalação de Docker, servidores PostgreSQL locais ou credenciais externas na máquina Windows do operador. O banco reside em um único arquivo local (`prisma/dev.db`).
  2. *Migração transparente para Supabase*: O Prisma utiliza um esquema declarativo (`schema.prisma`). Para migrar para Supabase/PostgreSQL em nuvem, basta alterar no `schema.prisma`:
     ```prisma
     datasource db {
       provider = "postgresql" // antes: "sqlite"
       url      = env("DATABASE_URL")
     }
     ```
     Todas as queries do repositório (`prisma.produtoEstoque.*`, `prisma.$transaction(...)`) permanecem 100% idênticas, sem necessidade de reescrever uma única linha de SQL ou queries da aplicação.
  3. *Atomicidade e Transações ACID*: O Prisma suporta transações interativas nativas (`prisma.$transaction(async (tx) => { ... })`), garantindo rollback imediato se houver qualquer violação de regra de negócio durante a baixa de estoque.
  4. *Prisma Studio integrado*: Permite inspecionar tabelas e dados visualmente via interface web nativa (`pnpm prisma studio` na porta 5555).

### ADR-03: Precisão Monetária Estrita (Padrão Inteiro em Centavos)
* **Decisão**: Armazenar e processar todos os valores monetários em **números inteiros representando centavos** (`centavos: number` ou `BigInt`).
* **Motivação**:
  1. Elimina completamente os clássicos erros de ponto flutuante do JavaScript (ex.: `0.1 + 0.2 = 0.30000000000000004` ou `19.90 * 3 = 59.699999999999996`).
  2. No banco de dados, os campos monetários são `INTEGER`, garantindo compatibilidade estrita entre SQLite e PostgreSQL.
  3. Conversão para exibição formatada em Real Brasileiro (`R$ 0,00`) ocorre apenas na camada de apresentação via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

### ADR-04: Separação Limpa de Domínios (Modular Core Decoupling)
* **Decisão**: Isolar a lógica de negócio central em módulos puros e desacoplados do framework web (`src/modules/*`).
* **Motivação**:
  - `src/modules/parser-p7/`: Motor de leitura, detecção de cabeçalho e validação do Livro Modelo P7.
  - `src/modules/baixa-inteligente/`: Algoritmo de busca e sugestão de combinações de produtos por valor alvo.
  - `src/modules/transacao-caixa/`: Orquestração atômica de débito de estoque, lançamento diário e auditoria.
  - `src/modules/financeiro/`: Agregação diária e consolidação mensal de entradas vs despesas.
  Isso permite testar 100% dos fluxos de negócio via testes unitários e de integração rápidos (Vitest) sem depender de subir servidor web ou simular cliques de navegador.

---

## 2. Diagnóstico do Ambiente Host (Windows)

| Recurso | Versão Detectada | Status / Observações |
|---|---|---|
| **Sistema Operacional** | Windows (PowerShell) | Suporta comandos nativos e caminhos com barras normais ou invertidas |
| **Node.js** | `v24.20.0` | Versão moderna com suporte nativo a ES Modules, `fetch` e `node:sqlite` |
| **pnpm** | `v10.4.1` | Gerenciador de pacotes global padrão, de alta velocidade e economia de disco |
| **npm** | `v11.19.0` | Gerenciador secundário de fallback disponível |
| **Python** | `3.14.0` | SQLite integrado versão `3.50.4` |
| **Git** | `2.54.0.windows.1` | Controle de versão operacional |

### Particularidades do Windows & Mitigações
1. **File Locking no SQLite (EBUSY)**:
   - No Windows, processos que mantém arquivos abertos bloqueiam acessos concorrentes mais rigidamente que em Linux.
   - *Mitigação*: Implementar padrão Singleton para a instância do `PrismaClient` no Next.js (`globalThis.prisma`), evitando que o Hot Module Replacement (HMR) abra múltiplas conexões concorrentes durante o desenvolvimento.
   - Ativar modo WAL no SQLite (`PRAGMA journal_mode = WAL;`) para permitir leituras concorrentes sem bloquear escritas.
2. **Portabilidade de scripts**:
   - Utilizar comandos no `package.json` agnósticos ao sistema operacional (evitar sintaxes específicas de `sh` como `export VAR=val`, usando `dotenv` ou variáveis pelo próprio Next.js).

---

## 3. Modelagem Relacional & Esquema Prisma (SQLite -> PostgreSQL)

O arquivo `prisma/schema.prisma` foi desenhado com tipos padrão suportados nativamente tanto pelo SQLite quanto pelo PostgreSQL do Supabase:

```prisma
datasource db {
  provider = "sqlite" // Para Supabase, alterar apenas para "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// 1. Catálogo e Estoque Atual (baseado no Inventário Modelo P7)
model ProdutoEstoque {
  id                    String            @id @default(uuid())
  codigo                String            @unique // Código interno no P7
  barras                String?           // EAN / GTIN de código de barras
  ncm                   String?           // Classificação fiscal NCM
  discriminacao         String            // Descrição do produto
  unidade               String            @default("UN") // UN, CX, KG, LT, etc.
  quantidade            Float             @default(0) // Suporta unidades fracionárias (ex: 1.250 kg)
  valorUnitarioCentavos Int               // Preço unitário em centavos (R$ 19,90 -> 1990)
  valorTotalCentavos    Int               // quantidade * valorUnitarioCentavos
  ativo                 Boolean           @default(true) // false quando quantidade <= 0
  criadoEm              DateTime          @default(now())
  atualizadoEm          DateTime          @updatedAt

  historicoBaixas       HistoricoBaixa[]

  @@index([barras])
  @@index([discriminacao])
  @@index([ativo])
  @@map("produtos_estoque")
}

// 2. Livro Diário de Vendas e Fechamento de Caixa
model LancamentoDiario {
  id                   String           @id @default(uuid())
  data                 DateTime         // Data da venda (permite lançamentos retroativos)
  dataTexto            String           // Formato "YYYY-MM-DD" para agrupamentos e filtros indexados
  tipo                 String           @default("ENTRADA") // "ENTRADA" (venda) ou "SAIDA" (estorno)
  categoria            String           @default("VENDA_BALCAO") // "VENDA_BALCAO", "VENDA_P7", etc.
  valorCartaoCentavos  Int              @default(0) // Valor em centavos recebido em Cartão
  valorDinheiroCentavos Int             @default(0) // Valor em centavos recebido em Dinheiro
  valorTotalCentavos   Int              // valorCartaoCentavos + valorDinheiroCentavos
  descricao            String?          // Observação opcional do operador
  criadoEm             DateTime         @default(now())
  atualizadoEm         DateTime         @updatedAt

  itensBaixa           HistoricoBaixa[]

  @@index([dataTexto])
  @@index([data])
  @@map("lancamentos_diarios")
}

// 3. Histórico de Auditoria e Baixas de Estoque
model HistoricoBaixa {
  id                    String           @id @default(uuid())
  lancamentoId          String?          // Vínculo com o lançamento no Livro Diário
  lancamento            LancamentoDiario? @relation(fields: [lancamentoId], references: [id], onDelete: SetNull)
  produtoId             String
  produto               ProdutoEstoque   @relation(fields: [produtoId], references: [id], onDelete: Restrict)
  codigoProdutoSnapshot String           // Snapshot do código no momento da baixa
  discriminacaoSnapshot String           // Snapshot da descrição no momento da baixa
  quantidadeDebitada    Float            // Quantidade baixada nesta operação
  valorUnitarioCentavos Int              // Preço unitário no momento da baixa
  valorTotalCentavos    Int              // quantidadeDebitada * valorUnitarioCentavos
  formaPagamento        String           // "CARTAO" ou "DINHEIRO"
  dataOperacao          DateTime         @default(now())
  motivo                String           @default("BAIXA_INTELIGENTE_P7") // "BAIXA_INTELIGENTE_P7" ou "AJUSTE_MANUAL"

  @@index([lancamentoId])
  @@index([produtoId])
  @@index([dataOperacao])
  @@map("historico_baixas")
}

// 4. Despesas Operacionais e Saídas (Confronto Mensal R1)
model DespesaMensal {
  id                String       @id @default(uuid())
  data              DateTime
  dataTexto         String       // "YYYY-MM-DD"
  categoria         String       // "FORNECEDOR", "ENERGIA", "ALUGUEL", "PESSOAL", "OUTROS"
  descricao         String
  valorCentavos     Int          // Valor em centavos
  formaPagamento    String       // "DINHEIRO", "PIX", "BOLETO", "TRANSFERENCIA"
  criadoEm          DateTime     @default(now())
  atualizadoEm      DateTime     @updatedAt

  @@index([dataTexto])
  @@map("despesas_mensais")
}
```

### Roteiro de Migração Futura para Supabase (Passo a Passo)
1. Criar projeto no Supabase e copiar a string de conexão:
   `DATABASE_URL="postgresql://postgres.[ref]:[senha]@aws-0-[regiao].pooler.supabase.com:6543/postgres?pgbouncer=true"`
2. No arquivo `prisma/schema.prisma`, alterar `provider = "sqlite"` para `provider = "postgresql"`.
3. Executar `npx prisma db push` ou `npx prisma migrate deploy`.
4. Os dados locais podem ser exportados via script de dump JSON e inseridos no Supabase via `prisma.$transaction`.

---

## 4. Estratégia de Precisão Monetária (Centavos & Matemática Exata)

Para garantir fidelidade numérica total sem arredondamentos imperfeitos em BRL:

### Módulo de Utilidades Monetárias (`src/lib/currency.ts`)
```typescript
/**
 * Converte valor em formato string ou float (ex: "19,90", "R$ 19,90", 19.9) para centavos inteiros (1990).
 */
export function toCents(val: string | number): number {
  if (typeof val === 'number') {
    return Math.round(val * 100);
  }
  const clean = val
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * Converte centavos inteiros para formato monetário brasileiro BRL (ex: 1990 -> "R$ 19,90").
 */
export function formatBRL(cents: number): string {
  const reais = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(reais);
}

/**
 * Multiplica quantidade fracionária por preço unitário em centavos mantendo precisão exata.
 */
export function calculateLineTotalCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}
```

---

## 5. Arquitetura de Módulos e Separação de Responsabilidades

```
+-----------------------------------------------------------------------------------+
|                                 CAMADA DE APRESENTAÇÃO (UI)                       |
|   +-----------------------+ +-------------------------+ +---------------------+   |
|   |   Frente de Caixa     | |    Gestão de Estoque    | | Dashboard Financeiro|   |
|   | (PDV & Baixa Assist.) | | (Importação Modelo P7)  | | (Fechamento Caixa)  |   |
|   +-----------+-----------+ +------------+------------+ +----------+----------+   |
+---------------|--------------------------|-------------------------|--------------+
                |                          |                         |
+---------------v--------------------------v-------------------------v--------------+
|                          CAMADA DE API / SERVER ACTIONS                           |
|   /api/caixa/sugestao      /api/estoque/import        /api/financeiro/resumo-dia  |
|   /api/caixa/baixa-atomica /api/estoque/produtos      /api/financeiro/resumo-mes  |
+---------------+--------------------------+-------------------------+--------------+
                |                          |                         |
+---------------v--------------------------v-------------------------v--------------+
|                             NÚCLEO DE NEGÓCIO (src/modules/*)                     |
|   +-----------------------+ +-------------------------+ +---------------------+   |
|   |  baixa-inteligente/   | |       parser-p7/        | |     financeiro/     |   |
|   | - Algoritmo Valor     | | - Detecção Cabeçalho    | | - Agregação Cartão  |   |
|   | - Múltiplo Unitário   | | - Normalização .xlsx/csv| | - Agregação Dinheiro|   |
|   | - Busca por Proximid. | | - Validação Fiscal      | | - Balanço Despesas  |   |
|   +-----------+-----------+ +------------+------------+ +----------+----------+   |
|               |                          |                         |              |
|               +--------------------------v-------------------------+              |
|                             transacao-caixa/atomic-service                        |
|                             - Transação Atômica ACID                              |
|                             - Decremento Estoque / Flag Ativo                     |
|                             - Lançamento Diário & Log Auditoria                   |
+------------------------------------------+----------------------------------------+
                                           |
+------------------------------------------v----------------------------------------+
|                               CAMADA DE DADOS & ORM                               |
|                         Prisma Client (Global Singleton)                          |
|                       SQLite Local (`prisma/dev.db`)                              |
|                     (Pronto para Supabase / PostgreSQL)                           |
+-----------------------------------------------------------------------------------+
```

---

## 6. Especificação das Rotas da API e Endpoints

| Método | Endpoint | Descrição | Payload de Entrada | Resposta |
|---|---|---|---|---|
| `POST` | `/api/estoque/import` | Faz upload do arquivo P7 (`.xlsx` ou `.csv`), processa cabeçalhos e persiste produtos | `multipart/form-data` contendo `file` | `{ importados: number, rejeitados: number, erros: Array }` |
| `GET` | `/api/estoque` | Lista produtos em estoque com filtros de busca, categoria e saldo | Query params: `q`, `apenasAtivos`, `page`, `limit` | `{ produtos: Produto[], total: number }` |
| `POST` | `/api/caixa/sugestao` | Executa o algoritmo de sugestão de baixa por valor alvo | `{ valorAlvoCentavos: number, formaPagamento: string }` | `{ tipo: 'EXATO_UNITARIO' \| 'COMBINACAO' \| 'PROXIMIDADE', sugestoes: ItemSugestao[] }` |
| `POST` | `/api/caixa/baixa-atomica` | Executa a transação atômica de débito, lançamento de caixa e auditoria | `{ itens: [{ produtoId, quantidade, valorUnitarioCentavos }], formaPagamento: 'CARTAO' \| 'DINHEIRO', data: string }` | `{ sucesso: true, lancamentoId: string, itensAuditados: number }` |
| `GET` | `/api/financeiro/resumo-diario` | Retorna o fechamento do dia com total Cartão, Dinheiro e Geral | Query param: `data=YYYY-MM-DD` | `{ data, totalCartao, totalDinheiro, totalDia, lancamentos: [] }` |
| `GET` | `/api/financeiro/resumo-mensal` | Retorna o consolidado mensal com entradas vs despesas | Query param: `mes=YYYY-MM` | `{ mes, totalCartao, totalDinheiro, totalEntradas, totalDespesas, saldoLiquido }` |
| `GET` | `/api/auditoria` | Histórico de auditoria com paginação e busca por produto/data | Query params: `dataInicio`, `dataFim`, `produtoId` | `{ registros: HistoricoBaixa[], total: number }` |

---

## 7. Estrutura de Diretórios Recomendada do Projeto

```
Dashboard Mercearia/
├── prisma/
│   ├── schema.prisma              # Definição do banco SQLite / PostgreSQL
│   ├── seed.ts                    # Dados de teste para demonstração e desenvolvimento
│   └── dev.db                     # Arquivo de banco de dados SQLite local
├── public/                        # Ícones, favicon e modelos de exemplo
├── src/
│   ├── app/                       # Rotas e páginas do Next.js App Router
│   │   ├── layout.tsx             # Layout global com barra lateral de navegação
│   │   ├── page.tsx               # Redirecionamento ou visão geral inicial
│   │   ├── caixa/
│   │   │   └── page.tsx           # Frente de Caixa e Baixa Inteligente Operacional
│   │   ├── estoque/
│   │   │   ├── page.tsx           # Tabela e catálogo de estoque
│   │   │   └── importar/
│   │   │       └── page.tsx       # Importador e validador do Livro Modelo P7
│   │   ├── financeiro/
│   │   │   ├── page.tsx           # Fechamento diário e consolidado mensal
│   │   │   └── despesas/
│   │   │       └── page.tsx       # Cadastro de despesas operacionais
│   │   ├── auditoria/
│   │   │   └── page.tsx           # Trilha completa de auditoria de baixas
│   │   └── api/                   # Route Handlers
│   │       ├── estoque/
│   │       │   ├── route.ts
│   │       │   └── import/route.ts
│   │       ├── caixa/
│   │       │   ├── sugestao/route.ts
│   │       │   └── baixa-atomica/route.ts
│   │       ├── financeiro/
│   │       │   ├── resumo-diario/route.ts
│   │       │   ├── resumo-mensal/route.ts
│   │       │   └── despesas/route.ts
│   │       └── auditoria/
│   │           └── route.ts
│   ├── components/                # Componentes React reutilizáveis
│   │   ├── ui/                    # Componentes base (Button, Card, Dialog, Input, Table, etc.)
│   │   ├── layout/                # Sidebar, Header, StatusBadge
│   │   ├── caixa/                 # Modal de sugestão de baixa, teclado numérico, seletor de pagamento
│   │   ├── estoque/               # Dropzone de upload P7, modal de prévia de importação
│   │   └── financeiro/            # Cartões de métricas (Cartão, Dinheiro, Total), gráfico mensal
│   ├── modules/                   # Núcleo de regras de negócio desacopladas
│   │   ├── parser-p7/             # Leitor de Excel/CSV, detector de cabeçalho e validador
│   │   │   ├── parser.ts
│   │   │   ├── validator.ts
│   │   │   └── types.ts
│   │   ├── baixa-inteligente/     # Algoritmo de busca e sugestão de baixa por valor
│   │   │   ├── suggestion-engine.ts
│   │   │   └── types.ts
│   │   ├── transacao-caixa/       # Execução da baixa atômica via Prisma Transaction
│   │   │   ├── checkout-service.ts
│   │   │   └── types.ts
│   │   └── financeiro/            # Cálculos financeiros e fechamento de caixa
│   │       ├── financial-service.ts
│   │       └── types.ts
│   ├── lib/                       # Utilitários compartilhados de infraestrutura
│   │   ├── prisma.ts              # Conexão com banco via Singleton pattern
│   │   ├── currency.ts            # Manipulação monetária exata em centavos
│   │   └── utils.ts               # Auxiliares de estilização (clsx + tailwind-merge)
│   └── test/                      # Testes automatizados
│       ├── fixtures/              # Arquivos sintéticos reais do Modelo P7 (.xlsx e .csv)
│       ├── unit/                  # Testes do parser, algoritmo de sugestão e centavos
│       └── integration/           # Testes da transação atômica no SQLite
├── .env.example
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── vitest.config.ts
```

---

## 8. Matriz de Dependências Recomendada (`package.json`)

```json
{
  "name": "dashboard-mercearia",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "next": "^15.1.7",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@prisma/client": "^6.3.1",
    "xlsx": "^0.18.5",
    "csv-parse": "^5.6.0",
    "lucide-react": "^0.475.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "class-variance-authority": "^0.7.1",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-tabs": "^1.1.3",
    "sonner": "^1.7.4",
    "zod": "^3.24.1",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/node": "^22.13.1",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "prisma": "^6.3.1",
    "tsx": "^4.19.2",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "vitest": "^3.0.5"
  }
}
```

---

## 9. Estratégia de Testes Automatizados e Verificação

Para garantir total conformidade com os Critérios de Aceitação:
1. **Testes Unitários**:
   - `currency.test.ts`: Valida conversões de e para centavos, formatações em BRL e ausência de flutuações decimais.
   - `parser-p7.test.ts`: Valida leitura de arquivos `.xlsx` e `.csv` sintéticos contendo cabeçalhos de preâmbulo descartáveis, separadores de milhar/decimal brasileiros (`1.250,50`) e rejeição de linhas inválidas.
   - `suggestion-engine.test.ts`: Testa sugestão exata unitária (`Qtd * Unitário == Alvo`), combinações de múltiplos itens e fallback por proximidade quando não há combinação exata.
2. **Testes de Integração**:
   - `atomic-checkout.test.ts`: Executa baixa atômica real em banco SQLite de teste, confirmando:
     - Decremento exato de estoque.
     - Bloqueio se quantidade for insuficiente (`quantidade >= quantidadeDebitada`).
     - Lançamento no `lancamentos_diarios` na coluna correta (Cartão ou Dinheiro).
     - Criação do log de auditoria em `historico_baixas`.
     - Rollback completo em caso de falha intencional no meio da transação.
