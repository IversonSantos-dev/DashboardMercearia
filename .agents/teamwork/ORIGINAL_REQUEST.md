# Original User Request

## Initial Request — 2026-11-05T00:34:54Z

Desenvolver uma aplicação web de produção (Dashboard Administrativo e Frente de Caixa) com controle diário de vendas (Cartão vs. Dinheiro) e módulo de baixa inteligente de estoque integrado ao formato de inventário Modelo P7.

Working directory: c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia
Integrity mode: development

## Requirements

### R1. Vendas Diárias e Fechamento de Caixa
- Registro e controle de vendas diárias por data com colunas discriminadas para Cartão, Dinheiro e Total Diário (`Total = Cartão + Dinheiro`).
- Consolidação mensal com soma acumulada de Cartão, Dinheiro, Total Geral de Entradas e confronto com Saídas/Despesas do mês.
- Fidelidade numérica estrita sem truncamento ou imprecisão de arredondamento de ponto flutuante, operando com 2 casas decimais no padrão BRL (`R$ 0,00`).

### R2. Parser e Importação de Inventário Modelo P7
- Parser/importador de arquivos (`.xls`, `.xlsx`, `.csv`) reconhecendo a estrutura do Livro de Inventário Modelo P7 com as colunas: Código (código interno/ID), Barras (EAN/GTIN), NCM, Discriminação, Unid, Qtd (estoque disponível), Unitário e Total (`Qtd * Unitário`).
- O leitor deve localizar a linha que contém o cabeçalho `Código | Barras | Discriminação | Qtd | Unitário`, ignorando linhas administrativas prévias (Razão Social, CNPJ, Data) e iniciando a extração a partir dela.

### R3. Módulo de Baixa Inteligente por Valor
- Interface operacional onde o operador informa o Valor Alvo (R$), a Forma de Pagamento (Cartão ou Dinheiro) e a Data do lançamento (padrão data atual, permitindo seleção retroativa).
- Algoritmo de sugestão de produtos com estoque disponível (`Qtd > 0`) que busca combinações exatas ou unitárias onde `(Qtd_sugerida * Unitário) == Valor Alvo`. Se não houver múltiplo unitário exato, sugere a combinação exata mais próxima dentro do estoque ou apresenta a lista filtrada por proximidade de valor para seleção assistida.
- Exibição em tela dos dados da sugestão antes da confirmação: Código, Barras, Discriminação, Qtd a Debitar, Unitário e Valor Total.

### R4. Atomicidade, Débito e Histórico de Auditoria
- Confirmação de baixa executada em transação atômica no banco de dados: decrementa a `Qtd` do produto no estoque (`Qtd = Qtd - Qtd_debitada`). Se a quantidade resultante for 0, marca o produto como sem estoque para impedir novas baixas.
- Lançamento imediato do valor no Livro Diário de Vendas na coluna correspondente (`Cartão` ou `Dinheiro`).
- Armazenamento de log de auditoria com data/hora, código/produto, quantidade baixada, valor unitário, valor total e forma de pagamento vinculada ao lançamento de caixa.

### R5. Arquitetura e Persistência de Dados
- Banco de dados relacional local (SQLite via Prisma ou PostgreSQL local) com esquema estruturado (`produtos_estoque`, `lancamentos_diarios`, `historico_baixas`) e modelagem/abstração preparada para facilitar migração futura para Supabase / PostgreSQL em nuvem.

## Verification Resources
- A equipe deve criar arquivos de teste sintéticos representativos nos formatos suportados (`.xlsx`, `.csv`) contendo a estrutura real do inventário Modelo P7 (incluindo cabeçalhos administrativos descartáveis) para validação do parser e dos fluxos de baixa.

## Acceptance Criteria

### Importador de Inventário Modelo P7
- [ ] Parser importa com sucesso arquivos `.xlsx` e `.csv` contendo cabeçalhos administrativos e extrai fielmente itens com código, barras, NCM, discriminação, unidade, quantidade e valor unitário.
- [ ] Validações impedem importação de linhas corrompidas ou tipos de dados inválidos, reportando feedback claro ao usuário.

### Algoritmo de Baixa Inteligente
- [ ] Para um valor alvo com múltiplo exato no estoque, o algoritmo sugere o item e a quantidade exata (`Qtd * Unitário == Valor Alvo`).
- [ ] Para um valor alvo sem correspondência unitária exata, o algoritmo apresenta combinações ou lista ordenada por proximidade de valor para escolha do operador.
- [ ] Operação de baixa é atômica: decrementa o estoque, bloqueia novas baixas caso o saldo zere e impede quantidade negativa.
- [ ] Baixa reflete instantaneamente nos lançamentos diários na coluna selecionada (Cartão ou Dinheiro).
- [ ] Registro completo é gravado na tabela de histórico de auditoria com vínculo ao lançamento diário.

### Dashboard Financeiro e Fechamento de Caixa
- [ ] Cálculos diários e mensais mantêm precisão monetária estrita em BRL sem discrepâncias de ponto flutuante.
- [ ] Visualização diária apresenta totais separados de Cartão e Dinheiro, e total consolidado do dia.
- [ ] Visualização mensal consolida o total acumulado e exibe confronto com saídas/despesas.

### Testes Automatizados e Execução
- [ ] Suíte de testes automatizados valida o parser de inventário, o algoritmo de sugestão de baixa e a atomicidade das transações.
- [ ] Aplicação inicia e funciona localmente de forma reproduzível a partir do diretório de trabalho.

## Follow-up — 2026-11-05T00:54:42Z

Continue and resume execution. The server was restarted; please check current progress in PROJECT.md and continue orchestrating the team to completion.

## Follow-up — 2026-11-05T11:26:14Z

Continue and resume execution. The server was restarted; please check current progress in PROJECT.md and continue orchestrating the team to completion. Milestone 3 fix/recheck was completing, proceed to Milestone 4.


