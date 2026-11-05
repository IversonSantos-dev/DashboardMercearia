# Handoff Report: Especificação dos Arquivos Sintéticos de Teste e Suíte Vitest (Modelo P7)

**Agente:** M2 Synthetic Fixtures & Tests Explorer (`m2_explorer_2`)  
**Destinatário:** Orchestrator (`909b2f8c-83c6-47de-829a-608c7e57ee1e`)  
**Data:** 2026-11-05  
**Milestone:** M2 (Model P7 Inventory Parser, Importer & Synthetic Fixtures)  
**Artefato Principal:** `.agents/teamwork/m2_explorer_2/spec_fixtures_and_tests.md`

---

## 1. Observation

1. **Requisitos de Negócio e Fiscal (`ORIGINAL_REQUEST.md`, linhas 17-20 e 34-36)**:
   > "Parser/importador de arquivos (.xls, .xlsx, .csv) reconhecendo a estrutura do Livro de Inventário Modelo P7 com as colunas: Código (código interno/ID), Barras (EAN/GTIN), NCM, Discriminação, Unid, Qtd (estoque disponível), Unitário e Total (Qtd * Unitário)."  
   > "O leitor deve localizar a linha que contém o cabeçalho Código | Barras | Discriminação | Qtd | Unitário, ignorando linhas administrativas prévias (Razão Social, CNPJ, Data) e iniciando a extração a partir dela."  
   > "A equipe deve criar arquivos de teste sintéticos representativos nos formatos suportados (.xlsx, .csv) contendo a estrutura real do inventário Modelo P7..."

2. **Contratos de Interface (`PROJECT.md`, linhas 75-111)**:
   O parser exporta a função canônica:
   ```typescript
   export function parseModelP7File(buffer: Buffer, fileName: string): Promise<P7ParseResult>;
   ```
   Com tipos canônicos `P7ProductItem`, `P7RowIssue` (severidades `'WARNING' | 'ERROR'`), e `P7ParseResult` (contendo `items`, `quarantine`, `headerRowIndex`, `administrativeHeader`, `totalItensValidos`, `valorTotalGeralCentavos`).

3. **Massa de Dados e Especificação Fiscal (`survey_model_p7.md`, Seção 5)**:
   - A Seção 5.1 catalogou os 6 arquivos de teste sintéticos.
   - A Seção 5.2 tabulou os 15 produtos padrão da mercearia brasileira (Arroz, Feijão, Óleo, Açúcar, Café, Leite, Macarrão, Molho de Tomate, Detergente, Sabão em Barra, Refrigerante Guaraná, Cerveja, Papel Higiênico, Creme Dental, Biscoito).
   - A Seção 5.3 detalhou os casos limite e corrupções intencionais da Fixture 6.

4. **Ambiente Técnico e Dependências (`package.json`)**:
   - `xlsx`: `^0.18.5` (SheetJS instalado e funcional).
   - `tsx`: `^4.19.2` (Executor TypeScript via Node.js).
   - `vitest`: `^3.0.5` (Runner de testes configurado com `@vitejs/plugin-react` e `vite-tsconfig-paths`).

5. **Verificação Experimental via Comandos de Terminal**:
   - `Buffer.from('Açúcar, Café & Feijão', 'latin1')`: comprovou que o Node.js suporta nativamente codificação e decodificação Latin-1/Windows-1252 em memória sem dependências externas.
   - `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })`: gerou buffer binário OpenXML válido com tamanho de ~15.9 KB.
   - Cálculo aritmético exato dos 15 itens da mercearia: Total de Unidades = `1.770`, Total em Centavos = `1.250.105` (R$ 12.501,05).
   - Cálculo dos 4 itens válidos da Fixture 6: Total de Unidades = `155`, Total em Centavos = `330.955` (R$ 3.309,55).

---

## 2. Logic Chain

1. **Aderência aos Requisitos Fiscais e de Automação Comercial**:
   Com base na Observação 1 e 3, sistemas contábeis reais (SPED Bloco H, SINIEF S/N 1970) geram inventários com preâmbulos administrativos heterogêneos e variações de acentuação (CP1252). Portanto, especificar testes que cubram apenas planilhas ideais sem preâmbulo resultaria em quebra imediata em ambiente de produção.

2. **Composição das 6 Fixtures de Teste Sintéticas**:
   - `p7_padrao_completo.xlsx`: Valida o formato primário OpenXML com preâmbulo de 4 linhas, 15 produtos e rodapé `TOTAL GERAL`.
   - `p7_padrao_completo.csv`: Valida o padrão contábil brasileiro (delimitador `;`, UTF-8, decimais com vírgula).
   - `p7_preambulo_longo.xlsx`: Estressa o algoritmo de pontuação de âncoras com 12 linhas administrativas prévias e cabeçalho contendo sinônimos contábeis (`Cód. Interno`, `Código EAN`, `NCM/SH`, `Descrição do Produto`, `Estoque Atual`, `Preço Unitário`).
   - `p7_encoding_latin1.csv`: Valida a robustez do decodificador contra arquivos gerados em Windows-1252/ISO-8859-1 sem corrupção de acentos (`Açúcar`, `Café`, `Óleo`, `Feijão`, `Sabão`, `Guaraná`).
   - `p7_delimitador_virgula.csv`: Valida o sniffer de CSV em formato internacional (vírgula como separador e valores decimais com vírgula protegidos por aspas duplas `"28,90"`).
   - `p7_casos_limite_e_erros.xlsx`: Valida a segregação de erros linha a linha: isola linhas inválidas em quarentena (`NEGATIVE_QUANTITY`, `MISSING_CODE`, `INVALID_UNIT_PRICE`), tolera hortifruti sem código de barras (`MISSING_BARCODE`), estoque zerado (`ZERO_QUANTITY`), alerta para divergência de soma (`TOTAL_MISMATCH`) e descarta a linha de sumário trailing `TOTAL GERAL DO ESTOQUE`.

3. **Arquitetura do Gerador Programático (`generate-fixtures.ts`)**:
   Para evitar a necessidade de commitar binários opacos e garantir reprodutibilidade, um script autônomo em TypeScript produzirá os 6 arquivos sob demanda usando as APIs nativas do Node.js e do SheetJS (`XLSX.utils.aoa_to_sheet`, `XLSX.write`, `Buffer.from(..., 'latin1')`).

4. **Design da Suíte Vitest (`parser-p7.test.ts`)**:
   A suíte de testes unitários foi desenhada com 7 blocos `describe`, um para cada fixture e um bloco de invariantes de buffer/arquivo. As asserções testam estritamente o contrato canônico `parseModelP7File`:
   - `headerRowIndex` exato em cada caso.
   - Metadados do preâmbulo (`razaoSocial`, `cnpj`, `dataInventario`).
   - Contagem exata de itens válidos (`items.length`).
   - Integridade em centavos inteiros (`unitarioCentavos` e `totalCentavos`).
   - Quarentena seletiva (`quarantine` contendo apenas erros e/ou avisos com números de linha originais).
   - Descarte do rodapé trailing `TOTAL GERAL`.

---

## 3. Caveats

1. **Formato `.xls` (BIFF8)**: Embora o SheetJS (`xlsx`) suporte a leitura de arquivos legados `.xls` (Excel 97-2003), as fixtures especificadas foram padronizadas em `.xlsx` (OpenXML) e `.csv` por serem os formatos dominantes no mercado atual e exigidos no escopo do M2. A biblioteca `xlsx` utiliza a mesma API de leitura para `.xls` e `.xlsx`.
2. **Campos Opcionais em `P7ParseResult`**: O contrato de `PROJECT.md` define `quarantine: P7RowIssue[]`. No design dos testes, consideramos que `quarantine` armazena itens rejeitados (severidade `ERROR`) ou advertências de auditoria (`WARNING`), com acesso a `reason` e `severity`.
3. **Dependência de Execução**: Os testes unitários projetados em `parser-p7.test.ts` dependem da implementação do módulo `src/modules/parser-p7/index.ts` (atribuída ao agente construtor do M2).

---

## 4. Conclusion

1. **Especificação Completa Entregue**: O documento `.agents/teamwork/m2_explorer_2/spec_fixtures_and_tests.md` detalha exaustivamente:
   - A especificação das 6 fixtures sintéticas com estrutura linha a linha.
   - O código-fonte integral e executável de `tests/fixtures/generate-fixtures.ts`.
   - O código-fonte integral da suíte de testes `tests/unit/parser-p7.test.ts`.
2. **Cobertura de 100% dos Casos Fiscais e Operacionais**: Todas as nuances apontadas em `survey_model_p7.md` (preâmbulos longos, Latin-1, decimais com vírgula, quarentena, hortifruti sem EAN, estoque negativo e totais trailing) estão mapeadas em casos de teste reproduzíveis.
3. **Prontidão para Implementação**: Os arquivos estão prontos para serem gravados pelo agente construtor do M2, servindo de especificação executável (TDD) para a construção do `src/modules/parser-p7/index.ts`.

---

## 5. Verification Method

Para verificar de forma independente e reproduzível:

1. **Inspecionar a Especificação Técnica Completa**:
   - Arquivo: `.agents/teamwork/m2_explorer_2/spec_fixtures_and_tests.md`
   - Verificar as tabelas de Features Discovered, Edge Cases e o código gerador e de teste.

2. **Geração das Fixtures no Workspace (quando aplicadas)**:
   ```bash
   npx tsx tests/fixtures/generate-fixtures.ts
   ```
   *Condição de validação:* Deve gerar os 6 arquivos em `tests/fixtures/` com saída:
   - `p7_padrao_completo.xlsx`
   - `p7_padrao_completo.csv`
   - `p7_preambulo_longo.xlsx`
   - `p7_encoding_latin1.csv`
   - `p7_delimitador_virgula.csv`
   - `p7_casos_limite_e_erros.xlsx`

3. **Execução da Suíte Vitest (após implementação do parser)**:
   ```bash
   pnpm test tests/unit/parser-p7.test.ts
   ```
   *Condição de validação:* Todos os 7 blocos de teste passam com 100% de sucesso sem timeouts ou falhas de asserção.

4. **Condições de Invalidação**:
   - Se qualquer descrição acentuada em Latin-1 (`Açúcar`, `Café`) apresentar `\uFFFD` na decodificação.
   - Se a linha `TOTAL GERAL DO ESTOQUE` for inserida como produto válido no array `items`.
   - Se o valor monetário total diferir de `1250105` centavos nas fixtures padrão.
