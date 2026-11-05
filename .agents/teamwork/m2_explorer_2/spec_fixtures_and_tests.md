# Especificação Técnica dos Arquivos Sintéticos de Teste e Suíte Vitest (Modelo P7)

**Módulo:** `tests/fixtures/` e `tests/unit/parser-p7.test.ts`  
**Autor:** M2 Synthetic Fixtures & Tests Explorer  
**Data:** 2026-11-05  
**Milestone:** M2 (Model P7 Inventory Parser, Importer & Synthetic Fixtures)  
**Referência:** `ORIGINAL_REQUEST.md` (R1, R2, R4), `PROJECT.md` (F6-F11), `survey_model_p7.md` (Seção 5)

---

## 1. Visão Geral e Arquitetura de Testes

Para garantir conformidade estrita com o Requisito R2 do `ORIGINAL_REQUEST.md` e os critérios de aceitação do projeto, a suíte de testes do importador Modelo P7 deve ser 100% determinística, automatizada e baseada em dados fiscais e contábeis reais de mercearias brasileiras.

A estratégia compõe-se de 3 pilares:
1. **Especificação Normativa de 6 Fixtures Sintéticas**: Cobrindo o *happy path* padrão em Excel e CSV, preâmbulos administrativos longos, variações regionais de codificação (`Windows-1252`), delimitadores alternativos (`,`) e uma bateria exaustiva de casos limite e falhas controladas.
2. **Script de Geração Automatizada (`generate-fixtures.ts`)**: Gerador programático idempotente construído em TypeScript com `xlsx` (SheetJS) e `Buffer` nativo do Node.js, gerando todos os 6 arquivos com integridade binária.
3. **Suíte de Testes Unitários Vitest (`parser-p7.test.ts`)**: Bateria abrangente de testes validando todas as asserções de cabeçalho, sinônimos, conversão monetária em centavos inteiros, segregação de erros/quarentena e descarte de rodapés.

---

## 2. Features Discovered

| # | Categoria | Feature | Descrição | Entradas | Saídas | Comportamento de Erro | Descoberto Via |
|---|-----------|---------|-----------|----------|--------|-----------------------|----------------|
| 1 | Spreadsheet Ingestion | Ingestão Padrão Excel OpenXML (`.xlsx`) | Leitura de planilha Excel no formato Modelo P7 contendo preâmbulo de 4 linhas, cabeçalho de 8 colunas e 15 itens de mercearia. | Buffer `.xlsx` binário | `P7ParseResult` com 15 itens válidos, 0 quarentena | Buffer corrompido emite rejeição clara | `survey_model_p7.md` §5.1 / `ORIGINAL_REQUEST` R2 |
| 2 | CSV Ingestion | Ingestão CSV Regional Brasileiro | Leitura de arquivo texto delimitado por ponto e vírgula (`;`), codificado em UTF-8, com decimais brasileiros (`28,90`). | Buffer `.csv` UTF-8 | `P7ParseResult` com delim=`;`, 15 itens | Linhas inconsistentes reportadas com linha original | `survey_model_p7.md` §5.1 |
| 3 | Header Anchor Scoring | Resiliência a Preâmbulo Administrativo Longo | Algoritmo de varredura que ignora 12 linhas administrativas (dados fiscais, estaduais, termos) e localiza o cabeçalho na linha 13 por pontuação de âncoras. | Buffer `.xlsx` com 12 linhas de preâmbulo | Header detectado na linha 13 (`headerRowIndex: 12`) | Linhas de preâmbulo pontuando < 4 são descartadas sem falso-positivo | `ORIGINAL_REQUEST` R2 / `survey_model_p7.md` §4.2 |
| 4 | Encoding Transcoding | Transcodificação de Encoding Windows-1252 / ISO-8859-1 | Detecção e conversão de páginas de código brasileiras legadas preservando acentos (`ç`, `ã`, `é`, `ó`, `ú`). | Buffer `.csv` Latin1/CP1252 com `Açúcar`, `Café`, etc. | Strings decodificadas sem caracteres corrompidos (`\uFFFD`) | Se falhar UTF-8 estrito, recorre a Windows-1252 automaticamente | `survey_model_p7.md` §4.3 |
| 5 | CSV Ingestion | Ingestão de CSV com Delimitador Vírgula e Aspas | Autodetecção do delimitador vírgula (`,`) com suporte a campos entre aspas contendo vírgulas de texto ou decimais. | Buffer `.csv` com vírgula e strings citadas (`"28,90"`) | `P7ParseResult` com delim=`,` e campos preservados | Aspas não balanceadas geram erro estrutural | `PROJECT.md` F7 / `survey_model_p7.md` §5.1 |
| 6 | Row Quarantine | Isolamento e Quarentena de Linhas Corrompidas | Capacidade de aceitar linhas válidas e isolar linhas inválidas em lista de quarentena com `rowNumber`, código e motivo. | Planilha mista com itens válidos e adulterados | `items` válidos + `quarantine` com `P7RowIssue[]` | Erro em uma linha não aborta as demais | `PROJECT.md` F10 / `survey_model_p7.md` §4.6 |
| 7 | Barcode Tolerance | Suporte a Itens Hortifruti / Granel sem Barras | Aceitação de itens pesáveis/hortifruti com código de barras nulo ou vazio (`barras: null`), emitindo aviso não impeditivo `MISSING_BARCODE`. | Linha com `barras: ""` ou `null` | Item importado com `barras: null` e aviso de auditoria | Não rejeita o item do estoque | `survey_model_p7.md` §3 Edge 6 |
| 8 | Stock Management | Suporte a Saldo de Estoque Zerado | Aceitação de itens com `quantidade: 0` (produto esgotado no balanço), gerando aviso `ZERO_QUANTITY`. | Linha com `qtd: 0` | Item importado com saldo 0 para futuras entradas | Quantidade zero não é tratada como erro fatal | `survey_model_p7.md` §3 Edge 7 |
| 9 | Business Invariant | Bloqueio Estrito de Estoque Negativo | Rejeição imediata de linhas com `quantidade < 0` (ex: `Qtd: -10`), impedindo violação da restrição de não-negatividade. | Linha com `qtd: -10` | Linha quarentenada com erro `NEGATIVE_QUANTITY` | Item não é gravado no catálogo de estoque | `ORIGINAL_REQUEST` R4 / `PROJECT.md` F17 |
| 10 | Primary Key Invariant | Bloqueio de Linhas sem Código Interno | Rejeição imediata de linhas com código vazio ou whitespace, impedindo registros órfãos no banco de dados. | Linha com `codigo: ""` | Linha quarentenada com erro `MISSING_CODE` | Item rejeitado | `survey_model_p7.md` §4.6 |
| 11 | Numeric Invariant | Bloqueio de Linhas com Preço Alfanumérico | Rejeição imediata de linhas com texto no preço unitário (ex: `"GRATIS"` ou `"SOB CONSULTA"`). | Linha com `unitario: "GRATIS"` | Linha quarentenada com erro `INVALID_UNIT_PRICE` | Item rejeitado | `survey_model_p7.md` §3 Edge 9 |
| 12 | Stop Condition | Supressão de Rodapés e Linhas de Total Geral | Identificação automática de linhas de fechamento contábil (`TOTAL GERAL DO ESTOQUE`) e interrupção/descarte sem criar produto falso. | Linha sem código com descrição contendo `TOTAL GERAL` | Linha ignorada na lista de itens | Total geral não é persistido como mercadoria | `ORIGINAL_REQUEST` R2 / `PROJECT.md` F9 |
| 13 | Accounting Audit | Auditoria de Divergência no Total Declarado | Comparação entre o total calculado (`Qtd * Unitário`) e a coluna `Total` declarada no arquivo, emitindo aviso `TOTAL_MISMATCH` se diferença > R$ 0,02. | Linha com Total divergente do produto da multiplicação | Item importado com aviso contábil `TOTAL_MISMATCH` | Não impede a importação, sinaliza para auditoria | `survey_model_p7.md` §4.6 |
| 14 | Automated Fixture Tooling | Gerador Programático de Fixtures | Script executável TypeScript que gera de forma reproduzível as 6 fixtures de teste em disco com integridade de bytes. | Execução via `tsx` | 6 arquivos físicos em `tests/fixtures/` | Falha se permissão de escrita inexistente | `ORIGINAL_REQUEST` Verification |
| 15 | Regression Suite | Suíte de Testes Unitários de Parser | Testes Vitest exercitando todos os métodos de decodificação, varredura de cabeçalho, parsing e validação nas 6 fixtures. | Fixtures sintéticas em disco | Relatório de aprovação 100% no Vitest | Falha caso ocorra divergência de centavos ou tipagem | `PROJECT.md` F5/F11 |

---

## 3. Edge Cases Catalog

| # | Feature | Input | Comportamento Observado / Requerido |
|---|---------|-------|-------------------------------------|
| 1 | Dynamic Header | 12 linhas de dados contábeis/fiscais antes da tabela | O parser avalia as linhas 0 a 11, nenhuma pontua >= 4, linha 12 pontua 5/5 e torna-se `headerRowIndex: 12`. |
| 2 | Synonym Mapping | Cabeçalho com sinônimos contábeis (`Cód. Interno`, `Código EAN`, `NCM/SH`, `Descrição do Produto`, `Estoque Atual`, `Preço Unitário`) | O catálogo de sinônimos mapeia com sucesso para os 5 campos âncoras canônicos. |
| 3 | Windows-1252 CSV | Arquivo gravado com bytes simples `0xE7` (ç), `0xFA` (ú), `0xE9` (é) | Parser detecta falha UTF-8 fatal e converte com Windows-1252 sem substituir por `\uFFFD`. |
| 4 | CSV Delimiter | CSV com vírgula como delimitador contendo preços entre aspas com vírgula decimal (`"28,90"`) | O sniffer detecta delimitador vírgula e o lexer de CSV respeita aspas sem partir o valor monetário. |
| 5 | Barcode Null | Produto hortifruti pesável (Banana Prata) com código de barras vazio | O campo `barras` é retornado como `null` e um aviso `MISSING_BARCODE` é registrado sem quarentenar o item. |
| 6 | Zero Stock | Produto com saldo zero no inventário (`quantidade: 0`) | O item é aceito com `quantidade: 0`, `totalCentavos: 0` e aviso `ZERO_QUANTITY`. |
| 7 | Negative Quantity | Linha com estoque negativo (`quantidade: -10`) | A linha é quarentenada com severidade `ERROR` e código `NEGATIVE_QUANTITY`. |
| 8 | Missing Code | Linha sem código de identificação do item | A linha é quarentenada com severidade `ERROR` e código `MISSING_CODE`. |
| 9 | Corrupted Price | Linha com preço unitário preenchido com string alfabética (`"GRATIS"`) | A linha é quarentenada com severidade `ERROR` e código `INVALID_UNIT_PRICE`. |
| 10 | Total Mismatch | Linha com valor total declarado de R$ 300,00 quando Qtd=10 e Unitário=R$ 15,00 (esperado: R$ 150,00) | O item é aceito, mas gera um aviso `TOTAL_MISMATCH` indicando discrepância de R$ 150,00. |
| 11 | Stop Condition | Linha de rodapé `TOTAL GERAL DO ESTOQUE` com valor total na última coluna | O parser reconhece como stop condition e encerra a leitura ou descarta a linha sem incluí-la como produto. |
| 12 | Empty Rows | Linhas em branco entre blocos administrativos ou antes do rodapé | Linhas totalmente vazias são descartadas silenciosamente sem gerar falsos erros na quarentena. |

---

## 4. Especificação Detalhada das 6 Fixtures de Teste

### 4.1 Tabela Mestre dos 15 Produtos de Mercearia (Dados de Referência)
Utilizada como base para as fixtures 1, 2, 3, 4 e 5:

| Código | Barras (EAN-13) | NCM | Discriminação | Unid | Qtd | Unitário (R$) | Unitário Centavos | Total Centavos | Total (R$) |
|:---:|:---:|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `1001` | `7891000100103` | `1006.30.21` | Arroz Agulhinha Tipo 1 Pacote 5kg | PCT | 120 | 28,90 | 2890 | 346800 | 3.468,00 |
| `1002` | `7891000200209` | `0713.33.19` | Feijão Carioca Tipo 1 Pacote 1kg | PCT | 85 | 7,49 | 749 | 63665 | 636,65 |
| `1003` | `7891000300305` | `1507.90.11` | Óleo de Soja Refinado Pet 900ml | UN | 150 | 5,89 | 589 | 88350 | 883,50 |
| `1004` | `7891000400401` | `1701.99.00` | Açúcar Cristal Branco Pacote 1kg | PCT | 90 | 4,29 | 429 | 38610 | 386,10 |
| `1005` | `7891000500507` | `0901.21.00` | Café Torrado e Moído Tradicional 500g | PCT | 60 | 18,90 | 1890 | 113400 | 1.134,00 |
| `1006` | `7891000600603` | `0401.20.10` | Leite UHT Integral Longa Vida 1L | UN | 200 | 4,79 | 479 | 95800 | 958,00 |
| `1007` | `7891000700709` | `1902.19.00` | Macarrão Espaguete com Ovos 500g | PCT | 110 | 3,99 | 399 | 43890 | 438,90 |
| `1008` | `7891000800805` | `2103.20.10` | Molho de Tomate Tradicional Sachê 300g | UN | 140 | 2,19 | 219 | 30660 | 306,60 |
| `1009` | `7891000900901` | `3402.20.00` | Detergente Líquido Neutro Frasco 500ml | UN | 180 | 2,49 | 249 | 44820 | 448,20 |
| `1010` | `7891001001003` | `3401.19.00` | Sabão em Barra Multiuso Pacote 5x200g | PCT | 45 | 9,80 | 980 | 44100 | 441,00 |
| `1011` | `7891001101109` | `2202.10.00` | Refrigerante Guaraná Garrafa Pet 2L | UN | 95 | 7,99 | 799 | 75905 | 759,05 |
| `1012` | `7891001201205` | `2203.00.00` | Cerveja Puro Malte Lata 350ml | UN | 240 | 3,89 | 389 | 93360 | 933,60 |
| `1013` | `7891001301301` | `4818.10.00` | Papel Higiênico Folha Dupla 12 Rolos | FD | 50 | 19,90 | 1990 | 99500 | 995,00 |
| `1014` | `7891001401407` | `3306.10.00` | Creme Dental Proteção Anticáries 90g | UN | 75 | 4,49 | 449 | 33675 | 336,75 |
| `1015` | `7891001501503` | `1905.31.00` | Biscoito Recheado Chocolate 130g | UN | 130 | 2,89 | 289 | 37570 | 375,70 |
| **TOTAL** | — | — | **SOMA TOTAL GERAL DO INVENTÁRIO** | — | **1.770** | — | — | **1.250.105** | **R$ 12.501,05** |

---

### 4.2 Fixture 1: `p7_padrao_completo.xlsx`
- **Arquivo**: `tests/fixtures/p7_padrao_completo.xlsx`
- **Estrutura**:
  - Linha 1: `LIVRO REGISTRO DE INVENTÁRIO - MODELO P7` | `EMPRESA: MERCEARIA SANTO ANTÔNIO LTDA` | `CNPJ: 12.345.678/0001-90`
  - Linha 2: `INSCRIÇÃO ESTADUAL: 123.456.789.110` | `DATA DO INVENTÁRIO: 31/12/2025` | `FOLHA: 001`
  - Linha 3: `TERMO DE ABERTURA REGISTRADO SOB Nº 45892` | |
  - Linha 4: *(Linha em branco)*
  - Linha 5 (Índice 4): Cabeçalho oficial: `Código | Barras | NCM | Discriminação | Unid | Qtd | Unitário | Total`
  - Linhas 6 a 20: 15 produtos da Tabela Mestre com valores numéricos nativos do Excel.
  - Linha 21: *(Linha em branco)*
  - Linha 22: Rodapé: `"" | "" | "" | TOTAL GERAL DO ESTOQUE | "" | 1770 | "" | 12501.05`
- **Asserções Esperadas no Teste**:
  - `headerRowIndex`: 4
  - `administrativeHeader.razaoSocial`: contém "MERCEARIA SANTO ANTÔNIO LTDA"
  - `administrativeHeader.cnpj`: "12.345.678/0001-90"
  - `administrativeHeader.dataInventario`: "31/12/2025"
  - `items.length`: 15
  - `quarantine.length`: 0
  - Soma das quantidades: `1770`
  - `valorTotalGeralCentavos`: `1250105` (R$ 12.501,05)

---

### 4.3 Fixture 2: `p7_padrao_completo.csv`
- **Arquivo**: `tests/fixtures/p7_padrao_completo.csv`
- **Encoding**: UTF-8
- **Delimitador**: Ponto e vírgula (`;`)
- **Estrutura de Linhas**:
  - Linha 1: `LIVRO REGISTRO DE INVENTÁRIO - MODELO P7;MERCEARIA SANTO ANTÔNIO LTDA;CNPJ: 12.345.678/0001-90;;;;;`
  - Linha 2: `INSCRIÇÃO ESTADUAL: 123.456.789.110;DATA BASE: 31/12/2025;;;;;;`
  - Linha 3: `;;;;;;;`
  - Linha 4 (Índice 3): `Código;Barras;NCM;Discriminação;Unid;Qtd;Unitário;Total`
  - Linhas 5 a 19: 15 produtos com formato decimal brasileiro (`28,90` e `3468,00`).
  - Linha 20: `;;;TOTAL GERAL DO ESTOQUE;;1770;;12501,05`
- **Asserções Esperadas no Teste**:
  - Delimitador autodetectado: `;`
  - Encoding: `utf-8`
  - `headerRowIndex`: 3
  - `items.length`: 15
  - Caracteres especiais preservados (`Açúcar`, `Café Torrado e Moído`, `Óleo de Soja`, `Feijão Carioca`, `Sabão em Barra Multiuso`)
  - `valorTotalGeralCentavos`: `1250105`

---

### 4.4 Fixture 3: `p7_preambulo_longo.xlsx`
- **Arquivo**: `tests/fixtures/p7_preambulo_longo.xlsx`
- **Finalidade**: Testar algoritmo de pontuação com preâmbulo de 12 linhas administrativas complexas e uso de sinônimos de colunas.
- **Estrutura de Linhas**:
  - Linha 1: `GOVERNO DO ESTADO DE SÃO PAULO`
  - Linha 2: `SECRETARIA DA FAZENDA E PLANEJAMENTO - DELEGAÇÃO REGIONAL TRIBUTÁRIA`
  - Linha 3: `SISTEMA PÚBLICO DE ESCRITURAÇÃO DIGITAL - SPED FISCAL`
  - Linha 4: `LIVRO REGISTRO DE INVENTÁRIO MODELO 7 - CONVÊNIO SINIEF S/N 1970`
  - Linha 5: `RAZÃO SOCIAL: MERCEARIA SANTO ANTÔNIO LTDA - EPP`
  - Linha 6: `CNPJ: 12.345.678/0001-90 | INSCRIÇÃO ESTADUAL: 123.456.789.110`
  - Linha 7: `ENDEREÇO: RUA DO COMÉRCIO, 100 - BAIRRO CENTRAL - CEP: 01000-000`
  - Linha 8: `REGIME TRIBUTÁRIO: SIMPLES NACIONAL - ME / EPP`
  - Linha 9: `EXERCÍCIO FISCAL: 2025 | PERÍODO DE APURAÇÃO: 01/01/2025 A 31/12/2025`
  - Linha 10: `DATA BASE DO BALANÇO PATRIMONIAL: 31/12/2025`
  - Linha 11: `TERMO DE ABERTURA LIVRO ELETRÔNICO Nº 005 - PROTOCOLO JUCESP Nº 99887766`
  - Linha 12: *(Linha em branco)*
  - Linha 13 (Índice 12): Cabeçalho com Sinônimos Contábeis Reais:
    `Cód. Interno | Código EAN | NCM/SH | Descrição do Produto | Unidade | Estoque Atual | Preço Unitário | Valor Total`
  - Linhas 14 a 28: 15 produtos da Tabela Mestre.
  - Linha 29: `"" | "" | "" | TOTAL GERAL DO INVENTÁRIO | "" | 1770 | "" | 12501.05`
- **Asserções Esperadas no Teste**:
  - `headerRowIndex`: 12 (13ª linha física)
  - Pontuação de âncoras na linha 13: 5/5 reconhecidas via sinônimos
  - Nenhuma das 12 primeiras linhas disparou falso positivo (scores < 4)
  - `items.length`: 15
  - `valorTotalGeralCentavos`: `1250105`

---

### 4.5 Fixture 4: `p7_encoding_latin1.csv`
- **Arquivo**: `tests/fixtures/p7_encoding_latin1.csv`
- **Encoding**: Windows-1252 / ISO-8859-1 (Latin1) gravado em bytes puros
- **Delimitador**: Ponto e vírgula (`;`)
- **Palavras de Teste de Acentuação**:
  - `Açúcar Cristal Branco Pacote 1kg` (contém `ç` [0xE7], `ú` [0xFA])
  - `Café Torrado e Moído Tradicional 500g` (contém `é` [0xE9], `í` [0xED])
  - `Óleo de Soja Refinado Pet 900ml` (contém `Ó` [0xD3])
  - `Feijão Carioca Tipo 1 Pacote 1kg` (contém `ã` [0xE3])
  - `Sabão em Barra Multiuso Pacote 5x200g` (contém `ã` [0xE3])
  - `Refrigerante Guaraná Garrafa Pet 2L` (contém `á` [0xE1])
- **Asserções Esperadas no Teste**:
  - Parser detecta que não é UTF-8 válido e recorre a `windows-1252` / `iso-8859-1`.
  - Asserções estritas de texto:
    - `expect(itemAçucar.discriminacao).toBe("Açúcar Cristal Branco Pacote 1kg")`
    - `expect(itemCafe.discriminacao).toBe("Café Torrado e Moído Tradicional 500g")`
    - `expect(itemOleo.discriminacao).toBe("Óleo de Soja Refinado Pet 900ml")`
    - `expect(itemFeijao.discriminacao).toBe("Feijão Carioca Tipo 1 Pacote 1kg")`
    - `expect(itemSabao.discriminacao).toBe("Sabão em Barra Multiuso Pacote 5x200g")`
    - `expect(itemGuarana.discriminacao).toBe("Refrigerante Guaraná Garrafa Pet 2L")`
  - Nenhuma ocorrência de `\uFFFD` (caractere de substituição) em todo o array de itens.

---

### 4.6 Fixture 5: `p7_delimitador_virgula.csv`
- **Arquivo**: `tests/fixtures/p7_delimitador_virgula.csv`
- **Encoding**: UTF-8
- **Delimitador**: Vírgula (`,`)
- **Estrutura de Linhas**:
  - Cabeçalho: `Código,Barras,NCM,Discriminação,Unid,Qtd,Unitário,Total`
  - Campos numéricos decimais ou descrições com vírgula protegidos por aspas duplas:
    `1001,7891000100103,1006.30.21,"Arroz Agulhinha Tipo 1, Pacote 5kg",PCT,120,"28,90","3468,00"`
    `1002,7891000200209,0713.33.19,"Feijão Carioca Tipo 1, Pacote 1kg",PCT,85,"7,49","636,65"`
    `1003,7891000300305,1507.90.11,"Óleo de Soja Refinado, Pet 900ml",UN,150,"5,89","883,50"`
    `...`
- **Asserções Esperadas no Teste**:
  - Sniffer identifica delimitador `,` mesmo com vírgulas internas nos números e descrições.
  - Não ocorre cisão indevida de colunas.
  - `items.length`: 15
  - Preços decimais `28,90` convertidos corretamente para `2890` centavos.

---

### 4.7 Fixture 6: `p7_casos_limite_e_erros.xlsx`
- **Arquivo**: `tests/fixtures/p7_casos_limite_e_erros.xlsx`
- **Finalidade**: Testar isolamento granular de erros de linha, validações de integridade contábil e descarte de rodapés.
- **Estrutura Detalhada Linha por Linha**:

| Linha Física | Código | Barras | NCM | Discriminação | Unid | Qtd | Unitário | Total | Classificação Esperada | Detalhe do Erro / Aviso |
|:---:|:---:|:---:|:---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `LIVRO REGISTRO DE INVENTÁRIO - MODELO P7` | | | `EMPRESA: MERCEARIA SANTO ANTÔNIO LTDA` | | | | | Preâmbulo | Ignorado |
| 2 | `CNPJ: 12.345.678/0001-90` | | | `DATA DO INVENTÁRIO: 31/12/2025` | | | | | Preâmbulo | Ignorado |
| 3 | *(em branco)* | | | | | | | | Preâmbulo | Ignorado |
| 4 | `Código` | `Barras` | `NCM` | `Discriminação` | `Unid` | `Qtd` | `Unitário` | `Total` | **Cabeçalho** | `headerRowIndex: 3` |
| 5 | `1001` | `7891000100103` | `1006.30.21` | Arroz Agulhinha 5kg | PCT | 100 | 28.90 | 2890.00 | **Válido (Happy Path)** | Qtd: 100, Unit: 2890, Total: 289000 |
| 6 | `2001` | `""` *(vazio)* | `0803.90.00` | Banana Prata Climatizada | KG | 45 | 5.99 | 269.55 | **Válido + Aviso** | Aviso `MISSING_BARCODE` (pesável/hortifruti) |
| 7 | `2002` | `7892002002002` | `1006.30.21` | Arroz Parboilizado 5kg | PCT | 0 | 29.50 | 0.00 | **Válido + Aviso** | Aviso `ZERO_QUANTITY` (estoque zerado) |
| 8 | `2003` | `7892003003008` | `0713.33.19` | Feijão Preto Pacote 1kg | PCT | -10 | 6.90 | -69.00 | **Quarentena (Erro)** | Erro `NEGATIVE_QUANTITY` (R4 violado) |
| 9 | `""` *(vazio)* | `7892004004004` | `1507.90.11` | Óleo de Girassol Pet 900ml | UN | 20 | 8.50 | 170.00 | **Quarentena (Erro)** | Erro `MISSING_CODE` (chave primária vazia) |
| 10 | `2005` | `7892005005000` | `1701.99.00` | Açúcar Demerara Pacote 1kg | PCT | 15 | `"GRATIS"` | `"0.00"` | **Quarentena (Erro)** | Erro `INVALID_UNIT_PRICE` (preço alfanumérico) |
| 11 | `2006` | `7892006006006` | `0901.21.00` | Café Extraforte 500g | PCT | 10 | 15.00 | 300.00 | **Válido + Aviso** | Aviso `TOTAL_MISMATCH` (declarado 300 vs calculado 150) |
| 12 | *(em branco)* | | | | | | | | Vazio | Descartado silenciosamente |
| 13 | `""` | `""` | `""` | `TOTAL GERAL DO ESTOQUE` | `""` | `""` | `""` | 3639.55 | **Stop Condition** | Rodapé suprimido (não importado) |

- **Asserções Esperadas no Teste**:
  - Total de linhas avaliadas: 8
  - `validItems.length`: 4 (`1001`, `2001`, `2002`, `2006`)
  - `quarantine.length`: 3
    - Linha física 8 (ou erro equivalente): `code: "NEGATIVE_QUANTITY"`
    - Linha física 9: `code: "MISSING_CODE"`
    - Linha física 10: `code: "INVALID_UNIT_PRICE"`
  - Avisos capturados:
    - `MISSING_BARCODE` na linha de Banana Prata
    - `ZERO_QUANTITY` na linha de Arroz Parboilizado
    - `TOTAL_MISMATCH` na linha de Café Extraforte
  - `TOTAL GERAL DO ESTOQUE` não aparece nem em `validItems` nem em `quarantine`.
  - Soma de quantidades dos itens válidos: `100 + 45 + 0 + 10 = 155`.
  - Soma dos totais dos itens válidos: `289000 + 26955 + 0 + 15000 = 330955` centavos (R$ 3.309,55).

---

## 5. Implementação Completa do Gerador de Fixtures (`generate-fixtures.ts`)

Abaixo está o código-fonte completo, modular e autônomo a ser criado em `tests/fixtures/generate-fixtures.ts`:

```typescript
/**
 * Automated Generator for Model P7 Synthetic Test Fixtures
 * Project: Dashboard Mercearia
 * Script: tests/fixtures/generate-fixtures.ts
 *
 * Produces 6 deterministic test files under tests/fixtures/:
 * 1. p7_padrao_completo.xlsx
 * 2. p7_padrao_completo.csv
 * 3. p7_preambulo_longo.xlsx
 * 4. p7_encoding_latin1.csv
 * 5. p7_delimitador_virgula.csv
 * 6. p7_casos_limite_e_erros.xlsx
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

// ----------------------------------------------------------------------
// Master Data: 15 Realistic Grocery Products (Mercearia)
// ----------------------------------------------------------------------
export interface GroceryItemMaster {
  codigo: string;
  barras: string;
  ncm: string;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitario: number;
  total: number;
}

export const MASTER_GROCERY_ITEMS: GroceryItemMaster[] = [
  { codigo: "1001", barras: "7891000100103", ncm: "1006.30.21", discriminacao: "Arroz Agulhinha Tipo 1 Pacote 5kg", unidade: "PCT", quantidade: 120, unitario: 28.90, total: 3468.00 },
  { codigo: "1002", barras: "7891000200209", ncm: "0713.33.19", discriminacao: "Feijão Carioca Tipo 1 Pacote 1kg", unidade: "PCT", quantidade: 85, unitario: 7.49, total: 636.65 },
  { codigo: "1003", barras: "7891000300305", ncm: "1507.90.11", discriminacao: "Óleo de Soja Refinado Pet 900ml", unidade: "UN", quantidade: 150, unitario: 5.89, total: 883.50 },
  { codigo: "1004", barras: "7891000400401", ncm: "1701.99.00", discriminacao: "Açúcar Cristal Branco Pacote 1kg", unidade: "PCT", quantidade: 90, unitario: 4.29, total: 386.10 },
  { codigo: "1005", barras: "7891000500507", ncm: "0901.21.00", discriminacao: "Café Torrado e Moído Tradicional 500g", unidade: "PCT", quantidade: 60, unitario: 18.90, total: 1134.00 },
  { codigo: "1006", barras: "7891000600603", ncm: "0401.20.10", discriminacao: "Leite UHT Integral Longa Vida 1L", unidade: "UN", quantidade: 200, unitario: 4.79, total: 958.00 },
  { codigo: "1007", barras: "7891000700709", ncm: "1902.19.00", discriminacao: "Macarrão Espaguete com Ovos 500g", unidade: "PCT", quantidade: 110, unitario: 3.99, total: 438.90 },
  { codigo: "1008", barras: "7891000800805", ncm: "2103.20.10", discriminacao: "Molho de Tomate Tradicional Sachê 300g", unidade: "UN", quantidade: 140, unitario: 2.19, total: 306.60 },
  { codigo: "1009", barras: "7891000900901", ncm: "3402.20.00", discriminacao: "Detergente Líquido Neutro Frasco 500ml", unidade: "UN", quantidade: 180, unitario: 2.49, total: 448.20 },
  { codigo: "1010", barras: "7891001001003", ncm: "3401.19.00", discriminacao: "Sabão em Barra Multiuso Pacote 5x200g", unidade: "PCT", quantidade: 45, unitario: 9.80, total: 441.00 },
  { codigo: "1011", barras: "7891001101109", ncm: "2202.10.00", discriminacao: "Refrigerante Guaraná Garrafa Pet 2L", unidade: "UN", quantidade: 95, unitario: 7.99, total: 759.05 },
  { codigo: "1012", barras: "7891001201205", ncm: "2203.00.00", discriminacao: "Cerveja Puro Malte Lata 350ml", unidade: "UN", quantidade: 240, unitario: 3.89, total: 933.60 },
  { codigo: "1013", barras: "7891001301301", ncm: "4818.10.00", discriminacao: "Papel Higiênico Folha Dupla 12 Rolos", unidade: "FD", quantidade: 50, unitario: 19.90, total: 995.00 },
  { codigo: "1014", barras: "7891001401407", ncm: "3306.10.00", discriminacao: "Creme Dental Proteção Anticáries 90g", unidade: "UN", quantidade: 75, unitario: 4.49, total: 336.75 },
  { codigo: "1015", barras: "7891001501503", ncm: "1905.31.00", discriminacao: "Biscoito Recheado Chocolate 130g", unidade: "UN", quantidade: 130, unitario: 2.89, total: 375.70 },
];

export const TOTAL_QUANTIDADE_ESPERADA = 1770;
export const TOTAL_CENTAVOS_ESPERADO = 1250105; // R$ 12.501,05

/**
 * Utilitário para formatar número no padrão decimal BRL: 28,90
 */
function formatBRLDecimal(val: number): string {
  return val.toFixed(2).replace(".", ",");
}

/**
 * 1. Gera p7_padrao_completo.xlsx
 */
export function generatePadraoCompletoXlsx(targetPath: string): void {
  const aoa: any[][] = [
    ["LIVRO REGISTRO DE INVENTÁRIO - MODELO P7", "", "", "EMPRESA: MERCEARIA SANTO ANTÔNIO LTDA", "", "", "CNPJ: 12.345.678/0001-90", ""],
    ["INSCRIÇÃO ESTADUAL: 123.456.789.110", "", "", "DATA DO INVENTÁRIO: 31/12/2025", "", "", "FOLHA: 001", ""],
    ["TERMO DE ABERTURA REGISTRADO SOB Nº 45892", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["Código", "Barras", "NCM", "Discriminação", "Unid", "Qtd", "Unitário", "Total"],
  ];

  for (const item of MASTER_GROCERY_ITEMS) {
    aoa.push([
      item.codigo,
      item.barras,
      item.ncm,
      item.discriminacao,
      item.unidade,
      item.quantidade,
      item.unitario,
      item.total,
    ]);
  }

  aoa.push(["", "", "", "", "", "", "", ""]);
  aoa.push(["", "", "", "TOTAL GERAL DO ESTOQUE", "", TOTAL_QUANTIDADE_ESPERADA, "", 12501.05]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventario_P7");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(targetPath, buffer);
}

/**
 * 2. Gera p7_padrao_completo.csv (UTF-8, delimitador ;)
 */
export function generatePadraoCompletoCsv(targetPath: string): void {
  const lines: string[] = [
    "LIVRO REGISTRO DE INVENTÁRIO - MODELO P7;MERCEARIA SANTO ANTÔNIO LTDA;CNPJ: 12.345.678/0001-90;;;;;",
    "INSCRIÇÃO ESTADUAL: 123.456.789.110;DATA BASE: 31/12/2025;;;;;;",
    ";;;;;;;",
    "Código;Barras;NCM;Discriminação;Unid;Qtd;Unitário;Total",
  ];

  for (const item of MASTER_GROCERY_ITEMS) {
    lines.push(
      `${item.codigo};${item.barras};${item.ncm};${item.discriminacao};${item.unidade};${item.quantidade};${formatBRLDecimal(item.unitario)};${formatBRLDecimal(item.total)}`
    );
  }

  lines.push(";;;;;;;");
  lines.push(`;;;TOTAL GERAL DO ESTOQUE;;${TOTAL_QUANTIDADE_ESPERADA};;${formatBRLDecimal(12501.05)}`);

  fs.writeFileSync(targetPath, lines.join("\r\n"), "utf8");
}

/**
 * 3. Gera p7_preambulo_longo.xlsx (12 linhas de preâmbulo e cabeçalho na linha 13 com sinônimos)
 */
export function generatePreambuloLongoXlsx(targetPath: string): void {
  const aoa: any[][] = [
    ["GOVERNO DO ESTADO DE SÃO PAULO", "", "", "", "", "", "", ""],
    ["SECRETARIA DA FAZENDA E PLANEJAMENTO - DELEGAÇÃO REGIONAL TRIBUTÁRIA", "", "", "", "", "", "", ""],
    ["SISTEMA PÚBLICO DE ESCRITURAÇÃO DIGITAL - SPED FISCAL", "", "", "", "", "", "", ""],
    ["LIVRO REGISTRO DE INVENTÁRIO MODELO 7 - CONVÊNIO SINIEF S/N 1970", "", "", "", "", "", "", ""],
    ["RAZÃO SOCIAL: MERCEARIA SANTO ANTÔNIO LTDA - EPP", "", "", "", "", "", "", ""],
    ["CNPJ: 12.345.678/0001-90 | INSCRIÇÃO ESTADUAL: 123.456.789.110", "", "", "", "", "", "", ""],
    ["ENDEREÇO: RUA DO COMÉRCIO, 100 - BAIRRO CENTRAL - CEP: 01000-000", "", "", "", "", "", "", ""],
    ["REGIME TRIBUTÁRIO: SIMPLES NACIONAL - ME / EPP", "", "", "", "", "", "", ""],
    ["EXERCÍCIO FISCAL: 2025 | PERÍODO DE APURAÇÃO: 01/01/2025 A 31/12/2025", "", "", "", "", "", "", ""],
    ["DATA BASE DO BALANÇO PATRIMONIAL: 31/12/2025", "", "", "", "", "", "", ""],
    ["TERMO DE ABERTURA LIVRO ELETRÔNICO Nº 005 - PROTOCOLO JUCESP Nº 99887766", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    // Linha 13 (Índice 12): Cabeçalho com Sinônimos
    ["Cód. Interno", "Código EAN", "NCM/SH", "Descrição do Produto", "Unidade", "Estoque Atual", "Preço Unitário", "Valor Total"],
  ];

  for (const item of MASTER_GROCERY_ITEMS) {
    aoa.push([
      item.codigo,
      item.barras,
      item.ncm,
      item.discriminacao,
      item.unidade,
      item.quantidade,
      item.unitario,
      item.total,
    ]);
  }

  aoa.push(["", "", "", "", "", "", "", ""]);
  aoa.push(["", "", "", "TOTAL GERAL DO INVENTÁRIO", "", TOTAL_QUANTIDADE_ESPERADA, "", 12501.05]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "P7_Longo");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(targetPath, buffer);
}

/**
 * 4. Gera p7_encoding_latin1.csv (Windows-1252 / ISO-8859-1 com acentuação brasileira)
 */
export function generateEncodingLatin1Csv(targetPath: string): void {
  const lines: string[] = [
    "LIVRO REGISTRO DE INVENTÁRIO - MODELO P7;MERCEARIA SANTO ANTÔNIO LTDA;CNPJ: 12.345.678/0001-90;;;;;",
    "INSCRIÇÃO ESTADUAL: 123.456.789.110;DATA BASE: 31/12/2025;;;;;;",
    ";;;;;;;",
    "Código;Barras;NCM;Discriminação;Unid;Qtd;Unitário;Total",
  ];

  for (const item of MASTER_GROCERY_ITEMS) {
    lines.push(
      `${item.codigo};${item.barras};${item.ncm};${item.discriminacao};${item.unidade};${item.quantidade};${formatBRLDecimal(item.unitario)};${formatBRLDecimal(item.total)}`
    );
  }

  lines.push(";;;;;;;");
  lines.push(`;;;TOTAL GERAL DO ESTOQUE;;${TOTAL_QUANTIDADE_ESPERADA};;${formatBRLDecimal(12501.05)}`);

  const fullContent = lines.join("\r\n");
  // Converte a string usando codificação Latin-1 (ISO-8859-1) em Buffer binário nativo
  const buffer = Buffer.from(fullContent, "latin1");
  fs.writeFileSync(targetPath, buffer);
}

/**
 * 5. Gera p7_delimitador_virgula.csv (UTF-8, delimitador vírgula com decimais entre aspas)
 */
export function generateDelimitadorVirgulaCsv(targetPath: string): void {
  const lines: string[] = [
    "LIVRO REGISTRO DE INVENTÁRIO - MODELO P7,MERCEARIA SANTO ANTÔNIO LTDA,CNPJ: 12.345.678/0001-90,,,,",
    "INSCRIÇÃO ESTADUAL: 123.456.789.110,DATA BASE: 31/12/2025,,,,,,",
    ",,,,,,,",
    "Código,Barras,NCM,Discriminação,Unid,Qtd,Unitário,Total",
  ];

  for (const item of MASTER_GROCERY_ITEMS) {
    // Strings contendo vírgula ou decimais brasileiros com vírgula DEVEM estar entre aspas
    const descQuoted = `"${item.discriminacao}"`;
    const unitQuoted = `"${formatBRLDecimal(item.unitario)}"`;
    const totQuoted = `"${formatBRLDecimal(item.total)}"`;
    lines.push(
      `${item.codigo},${item.barras},${item.ncm},${descQuoted},${item.unidade},${item.quantidade},${unitQuoted},${totQuoted}`
    );
  }

  lines.push(",,,,,,,");
  lines.push(`,,,TOTAL GERAL DO ESTOQUE,,${TOTAL_QUANTIDADE_ESPERADA},,"${formatBRLDecimal(12501.05)}"`);

  fs.writeFileSync(targetPath, lines.join("\r\n"), "utf8");
}

/**
 * 6. Gera p7_casos_limite_e_erros.xlsx
 */
export function generateCasosLimiteEErrosXlsx(targetPath: string): void {
  const aoa: any[][] = [
    ["LIVRO REGISTRO DE INVENTÁRIO - MODELO P7", "", "", "EMPRESA: MERCEARIA SANTO ANTÔNIO LTDA", "", "", "CNPJ: 12.345.678/0001-90", ""],
    ["DATA DO INVENTÁRIO: 31/12/2025", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    // Linha 4 (Índice 3): Cabeçalho
    ["Código", "Barras", "NCM", "Discriminação", "Unid", "Qtd", "Unitário", "Total"],
    // Linha 5: Happy path
    ["1001", "7891000100103", "1006.30.21", "Arroz Agulhinha 5kg", "PCT", 100, 28.90, 2890.00],
    // Linha 6: Hortifruti sem EAN (aviso MISSING_BARCODE)
    ["2001", "", "0803.90.00", "Banana Prata Climatizada", "KG", 45, 5.99, 269.55],
    // Linha 7: Estoque zerado (aviso ZERO_QUANTITY)
    ["2002", "7892002002002", "1006.30.21", "Arroz Parboilizado 5kg", "PCT", 0, 29.50, 0.00],
    // Linha 8: Quantidade negativa (erro NEGATIVE_QUANTITY -> Quarentena)
    ["2003", "7892003003008", "0713.33.19", "Feijão Preto Pacote 1kg", "PCT", -10, 6.90, -69.00],
    // Linha 9: Código em branco (erro MISSING_CODE -> Quarentena)
    ["", "7892004004004", "1507.90.11", "Óleo de Girassol Pet 900ml", "UN", 20, 8.50, 170.00],
    // Linha 10: Preço com texto (erro INVALID_UNIT_PRICE -> Quarentena)
    ["2005", "7892005005000", "1701.99.00", "Açúcar Demerara Pacote 1kg", "PCT", 15, "GRATIS", "0.00"],
    // Linha 11: Total declarado divergente do calculado (aviso TOTAL_MISMATCH)
    ["2006", "7892006006006", "0901.21.00", "Café Extraforte 500g", "PCT", 10, 15.00, 300.00],
    // Linha 12: Vazio
    ["", "", "", "", "", "", "", ""],
    // Linha 13: Rodapé Total Geral (Stop Condition -> Descarte)
    ["", "", "", "TOTAL GERAL DO ESTOQUE", "", "", "", 3639.55],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Casos_Limite");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(targetPath, buffer);
}

/**
 * Função orquestradora principal
 */
export function generateAllFixtures(outputDir?: string): void {
  const dir = outputDir || path.resolve(__dirname, "../../tests/fixtures");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[Fixtures Generator] Gravando fixtures em: ${dir}`);

  generatePadraoCompletoXlsx(path.join(dir, "p7_padrao_completo.xlsx"));
  console.log("  ✓ Gerado: p7_padrao_completo.xlsx");

  generatePadraoCompletoCsv(path.join(dir, "p7_padrao_completo.csv"));
  console.log("  ✓ Gerado: p7_padrao_completo.csv");

  generatePreambuloLongoXlsx(path.join(dir, "p7_preambulo_longo.xlsx"));
  console.log("  ✓ Gerado: p7_preambulo_longo.xlsx");

  generateEncodingLatin1Csv(path.join(dir, "p7_encoding_latin1.csv"));
  console.log("  ✓ Gerado: p7_encoding_latin1.csv");

  generateDelimitadorVirgulaCsv(path.join(dir, "p7_delimitador_virgula.csv"));
  console.log("  ✓ Gerado: p7_delimitador_virgula.csv");

  generateCasosLimiteEErrosXlsx(path.join(dir, "p7_casos_limite_e_erros.xlsx"));
  console.log("  ✓ Gerado: p7_casos_limite_e_erros.xlsx");

  console.log("[Fixtures Generator] Todas as 6 fixtures foram geradas com sucesso.");
}

// Execução direta via CLI se chamado diretamente via `tsx tests/fixtures/generate-fixtures.ts`
if (require.main === module) {
  generateAllFixtures();
}
```

---

## 6. Design Completo da Suíte de Testes Vitest (`tests/unit/parser-p7.test.ts`)

Abaixo está o design completo da suíte de testes Vitest a ser implementada, que valida de ponta a ponta as 6 fixtures contra a interface canônica `parseModelP7File(buffer, fileName)`:

```typescript
/**
 * Model P7 Inventory Parser - Comprehensive Unit Test Suite
 * Project: Dashboard Mercearia
 * Test Suite: tests/unit/parser-p7.test.ts
 *
 * Validates parsing, dynamic header scoring, delimiter sniffing,
 * Latin1 transcoding, quarantine isolation, and monetary precision across all 6 fixtures.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { parseModelP7File, P7ParseResult } from "@/modules/parser-p7";
import {
  generateAllFixtures,
  TOTAL_QUANTIDADE_ESPERADA,
  TOTAL_CENTAVOS_ESPERADO,
} from "../fixtures/generate-fixtures";

describe("Model P7 Inventory Parser - Synthetic Fixtures Suite", () => {
  const fixturesDir = path.resolve(__dirname, "../fixtures");

  beforeAll(() => {
    // Garante que todas as fixtures existam antes dos testes
    generateAllFixtures(fixturesDir);
  });

  // --------------------------------------------------------------------
  // Fixture 1: Standard Excel (.xlsx)
  // --------------------------------------------------------------------
  describe("Fixture 1: p7_padrao_completo.xlsx (Standard Excel)", () => {
    let result: P7ParseResult;

    beforeAll(async () => {
      const filePath = path.join(fixturesDir, "p7_padrao_completo.xlsx");
      const buffer = fs.readFileSync(filePath);
      result = await parseModelP7File(buffer, "p7_padrao_completo.xlsx");
    });

    it("should successfully identify the header at row index 4 (5th row)", () => {
      expect(result.headerRowIndex).toBe(4);
    });

    it("should extract administrative metadata from the preamble", () => {
      expect(result.administrativeHeader.razaoSocial).toContain("MERCEARIA SANTO ANTÔNIO");
      expect(result.administrativeHeader.cnpj).toContain("12.345.678/0001-90");
      expect(result.administrativeHeader.dataInventario).toBe("31/12/2025");
    });

    it("should parse exactly 15 valid grocery items without quarantine", () => {
      expect(result.items).toHaveLength(15);
      expect(result.quarantine).toHaveLength(0);
      expect(result.totalItensValidos).toBe(15);
    });

    it("should extract monetary values into exact integer centavos without float drift", () => {
      const arroz = result.items.find((i) => i.codigo === "1001");
      expect(arroz).toBeDefined();
      expect(arroz?.discriminacao).toBe("Arroz Agulhinha Tipo 1 Pacote 5kg");
      expect(arroz?.quantidade).toBe(120);
      expect(arroz?.unitarioCentavos).toBe(2890); // R$ 28,90
      expect(arroz?.totalCentavos).toBe(346800); // R$ 3.468,00
    });

    it("should correctly compute total stock quantity and total inventory centavos", () => {
      const totalQty = result.items.reduce((acc, item) => acc + item.quantidade, 0);
      expect(totalQty).toBe(TOTAL_QUANTIDADE_ESPERADA); // 1770
      expect(result.valorTotalGeralCentavos).toBe(TOTAL_CENTAVOS_ESPERADO); // 1250105
    });

    it("should ignore trailing summary total general row", () => {
      const summaryItem = result.items.find((i) =>
        i.discriminacao.toUpperCase().includes("TOTAL GERAL")
      );
      expect(summaryItem).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------
  // Fixture 2: Standard Semicolon CSV (.csv)
  // --------------------------------------------------------------------
  describe("Fixture 2: p7_padrao_completo.csv (Brazilian Semicolon CSV)", () => {
    let result: P7ParseResult;

    beforeAll(async () => {
      const filePath = path.join(fixturesDir, "p7_padrao_completo.csv");
      const buffer = fs.readFileSync(filePath);
      result = await parseModelP7File(buffer, "p7_padrao_completo.csv");
    });

    it("should locate the header row skipping the administrative preamble", () => {
      expect(result.headerRowIndex).toBe(3);
    });

    it("should parse all 15 grocery products with Brazilian decimal numbers", () => {
      expect(result.items).toHaveLength(15);
      expect(result.quarantine).toHaveLength(0);

      const feijao = result.items.find((i) => i.codigo === "1002");
      expect(feijao?.unitarioCentavos).toBe(749); // R$ 7,49
      expect(feijao?.totalCentavos).toBe(63665); // R$ 636,65
    });

    it("should preserve special Portuguese characters in descriptions", () => {
      const cafe = result.items.find((i) => i.codigo === "1005");
      expect(cafe?.discriminacao).toBe("Café Torrado e Moído Tradicional 500g");

      const oleo = result.items.find((i) => i.codigo === "1003");
      expect(oleo?.discriminacao).toBe("Óleo de Soja Refinado Pet 900ml");
    });

    it("should aggregate correct inventory totals", () => {
      expect(result.valorTotalGeralCentavos).toBe(TOTAL_CENTAVOS_ESPERADO);
    });
  });

  // --------------------------------------------------------------------
  // Fixture 3: Long Preamble Excel (.xlsx)
  // --------------------------------------------------------------------
  describe("Fixture 3: p7_preambulo_longo.xlsx (12 Administrative Rows & Synonyms)", () => {
    let result: P7ParseResult;

    beforeAll(async () => {
      const filePath = path.join(fixturesDir, "p7_preambulo_longo.xlsx");
      const buffer = fs.readFileSync(filePath);
      result = await parseModelP7File(buffer, "p7_preambulo_longo.xlsx");
    });

    it("should skip all 12 administrative lines and detect header at index 12", () => {
      expect(result.headerRowIndex).toBe(12);
    });

    it("should match column synonyms (Cód. Interno, Código EAN, Descrição do Produto, Estoque Atual, Preço Unitário)", () => {
      expect(result.items).toHaveLength(15);
      const guarana = result.items.find((i) => i.codigo === "1011");
      expect(guarana).toBeDefined();
      expect(guarana?.barras).toBe("7891001101109");
      expect(guarana?.quantidade).toBe(95);
      expect(guarana?.unitarioCentavos).toBe(799);
      expect(guarana?.totalCentavos).toBe(75905);
    });

    it("should achieve identical inventory total as the standard fixture", () => {
      expect(result.valorTotalGeralCentavos).toBe(TOTAL_CENTAVOS_ESPERADO);
      expect(result.quarantine).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------
  // Fixture 4: Windows-1252 / ISO-8859-1 CSV
  // --------------------------------------------------------------------
  describe("Fixture 4: p7_encoding_latin1.csv (Legacy CP1252 / ISO-8859-1 Transcoding)", () => {
    let result: P7ParseResult;

    beforeAll(async () => {
      const filePath = path.join(fixturesDir, "p7_encoding_latin1.csv");
      const buffer = fs.readFileSync(filePath);
      result = await parseModelP7File(buffer, "p7_encoding_latin1.csv");
    });

    it("should gracefully transcode Windows-1252 to clean UTF-8 strings without corrupted symbols", () => {
      expect(result.items).toHaveLength(15);

      const acucar = result.items.find((i) => i.codigo === "1004");
      expect(acucar?.discriminacao).toBe("Açúcar Cristal Branco Pacote 1kg");

      const cafe = result.items.find((i) => i.codigo === "1005");
      expect(cafe?.discriminacao).toBe("Café Torrado e Moído Tradicional 500g");

      const oleo = result.items.find((i) => i.codigo === "1003");
      expect(oleo?.discriminacao).toBe("Óleo de Soja Refinado Pet 900ml");

      const sabao = result.items.find((i) => i.codigo === "1010");
      expect(sabao?.discriminacao).toBe("Sabão em Barra Multiuso Pacote 5x200g");

      const guarana = result.items.find((i) => i.codigo === "1011");
      expect(guarana?.discriminacao).toBe("Refrigerante Guaraná Garrafa Pet 2L");

      // Nenhuma string deve conter o caractere de substituição Unicode
      for (const item of result.items) {
        expect(item.discriminacao).not.toContain("\uFFFD");
      }
    });

    it("should maintain numeric precision identical to UTF-8", () => {
      expect(result.valorTotalGeralCentavos).toBe(TOTAL_CENTAVOS_ESPERADO);
    });
  });

  // --------------------------------------------------------------------
  // Fixture 5: Comma Delimited CSV (.csv)
  // --------------------------------------------------------------------
  describe("Fixture 5: p7_delimitador_virgula.csv (Comma Delimiter & Quoted Decimals)", () => {
    let result: P7ParseResult;

    beforeAll(async () => {
      const filePath = path.join(fixturesDir, "p7_delimitador_virgula.csv");
      const buffer = fs.readFileSync(filePath);
      result = await parseModelP7File(buffer, "p7_delimitador_virgula.csv");
    });

    it("should parse 15 items without column misalignment caused by comma decimals", () => {
      expect(result.items).toHaveLength(15);
      expect(result.quarantine).toHaveLength(0);

      const macarrao = result.items.find((i) => i.codigo === "1007");
      expect(macarrao?.quantidade).toBe(110);
      expect(macarrao?.unitarioCentavos).toBe(399); // R$ 3,99
      expect(macarrao?.totalCentavos).toBe(43890); // R$ 438,90
    });

    it("should aggregate total centavos accurately", () => {
      expect(result.valorTotalGeralCentavos).toBe(TOTAL_CENTAVOS_ESPERADO);
    });
  });

  // --------------------------------------------------------------------
  // Fixture 6: Edge Cases, Corruptions & Quarantine (.xlsx)
  // --------------------------------------------------------------------
  describe("Fixture 6: p7_casos_limite_e_erros.xlsx (Corruptions, Quarantine & Totals)", () => {
    let result: P7ParseResult;

    beforeAll(async () => {
      const filePath = path.join(fixturesDir, "p7_casos_limite_e_erros.xlsx");
      const buffer = fs.readFileSync(filePath);
      result = await parseModelP7File(buffer, "p7_casos_limite_e_erros.xlsx");
    });

    it("should accept valid items and isolate corrupt items into quarantine", () => {
      // 4 valid items: 1001, 2001 (Banana), 2002 (Arroz 0), 2006 (Café)
      expect(result.items).toHaveLength(4);
      // 3 quarantined errors: 2003 (Negative Qtd), missing code, 2005 (GRATIS price)
      const errors = result.quarantine.filter((q) => q.severity === "ERROR");
      expect(errors).toHaveLength(3);
    });

    it("should tolerate produce item without barcode as valid with warning", () => {
      const banana = result.items.find((i) => i.codigo === "2001");
      expect(banana).toBeDefined();
      expect(banana?.barras).toBeNull();
      expect(banana?.discriminacao).toBe("Banana Prata Climatizada");
      expect(banana?.quantidade).toBe(45);
      expect(banana?.unitarioCentavos).toBe(599);

      const warning = result.quarantine.find(
        (q) => q.codigo === "2001" && q.reason.includes("MISSING_BARCODE")
      );
      expect(warning).toBeDefined();
    });

    it("should accept item with zero stock balance (qtd: 0)", () => {
      const zeroItem = result.items.find((i) => i.codigo === "2002");
      expect(zeroItem).toBeDefined();
      expect(zeroItem?.quantidade).toBe(0);
      expect(zeroItem?.totalCentavos).toBe(0);
    });

    it("should quarantine negative quantity row (Feijão Preto Qtd: -10)", () => {
      const negativeIssue = result.quarantine.find(
        (q) => q.codigo === "2003" && q.reason.includes("NEGATIVE_QUANTITY")
      );
      expect(negativeIssue).toBeDefined();
      expect(negativeIssue?.severity).toBe("ERROR");
    });

    it("should quarantine row with missing internal code", () => {
      const missingCodeIssue = result.quarantine.find(
        (q) => q.reason.includes("MISSING_CODE")
      );
      expect(missingCodeIssue).toBeDefined();
      expect(missingCodeIssue?.severity).toBe("ERROR");
    });

    it("should quarantine row with text in unit price (preço GRATIS)", () => {
      const invalidPriceIssue = result.quarantine.find(
        (q) => q.codigo === "2005" && q.reason.includes("INVALID_UNIT_PRICE")
      );
      expect(invalidPriceIssue).toBeDefined();
      expect(invalidPriceIssue?.severity).toBe("ERROR");
    });

    it("should report warning for divergent declared total (Café Extraforte)", () => {
      const cafe = result.items.find((i) => i.codigo === "2006");
      expect(cafe).toBeDefined();
      // Total calculado deve prevalecer no objeto: 10 * 15.00 = 15000 centavos
      expect(cafe?.totalCentavos).toBe(15000);

      const mismatchWarning = result.quarantine.find(
        (q) => q.codigo === "2006" && q.reason.includes("TOTAL_MISMATCH")
      );
      expect(mismatchWarning).toBeDefined();
    });

    it("should suppress trailing TOTAL GERAL row from products and quarantine", () => {
      const totalRow = result.items.find((i) =>
        i.discriminacao.includes("TOTAL GERAL")
      );
      expect(totalRow).toBeUndefined();

      const totalInQuarantine = result.quarantine.find((q) =>
        q.discriminacao?.includes("TOTAL GERAL")
      );
      expect(totalInQuarantine).toBeUndefined();
    });

    it("should calculate correct aggregate totals for valid items", () => {
      // 1001 (2890.00) + 2001 (269.55) + 2002 (0.00) + 2006 (150.00) = 3309.55 = 330955 centavos
      expect(result.valorTotalGeralCentavos).toBe(330955);
    });
  });

  // --------------------------------------------------------------------
  // Edge Cases: Buffer & File Integrity
  // --------------------------------------------------------------------
  describe("Buffer & File Edge Invariants", () => {
    it("should reject an empty buffer with an informative error", async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(parseModelP7File(emptyBuffer, "empty.xlsx")).rejects.toThrow();
    });

    it("should reject a file with no recognizable header anchors", async () => {
      const invalidCsv = Buffer.from("ColunaA;ColunaB;ColunaC\n1;2;3\n4;5;6", "utf8");
      await expect(parseModelP7File(invalidCsv, "invalido.csv")).rejects.toThrow(
        /HEADER_NOT_FOUND|cabeçalho/i
      );
    });
  });
});
```

---

## 7. Instruções de Verificação e Execução

Para verificar e executar de ponta a ponta:

1. **Geração das Fixtures**:
   ```bash
   npx tsx tests/fixtures/generate-fixtures.ts
   ```
   *Resultado esperado:* Todos os 6 arquivos são criados em `tests/fixtures/` com log de confirmação.

2. **Execução dos Testes Unitários no Vitest**:
   ```bash
   pnpm test tests/unit/parser-p7.test.ts
   ```
   *Resultado esperado:* Todos os testes passam com 0 falhas assim que o módulo `src/modules/parser-p7/index.ts` for implementado de acordo com o contrato.
