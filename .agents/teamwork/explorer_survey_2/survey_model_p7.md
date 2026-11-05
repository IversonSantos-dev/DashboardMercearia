# Survey e Especificação Técnica: Livro Registro de Inventário Modelo P7

**Documento:** Levantamento Técnico, Especificação de Parser e Conjunto de Testes Sintéticos  
**Autor:** Survey Explorer 2 (Model P7 Spec & Parser Explorer)  
**Data:** 2026-11-05  
**Referência:** `ORIGINAL_REQUEST.md` (Requisito R2)

---

## 1. Fundamentação Fiscal e Regulatória do Modelo P7

O **Livro Registro de Inventário Modelo 7 (Modelo P7)** é uma das obrigações contábeis e fiscais mais tradicionais e relevantes do ordenamento tributário brasileiro, aplicável a empresas comerciais, industriais e atacadistas:

- **Base Legal Federal e SINIEF:**
  - **Convênio SINIEF S/N de 15/12/1970 (Art. 76):** Institui formalmente o modelo oficial do Livro Registro de Inventário (Modelo 7), fixando seu propósito: *"arrolar, pelos seus valores e com especificações que permitam sua perfeita identificação, as mercadorias, as matérias-primas, os produtos intermediários, os materiais de embalagem, os produtos manufaturados e os produtos em fabricação, existentes no estabelecimento à época do balanço."*
  - **Regulamento do Imposto de Renda (RIR/2018 - Decreto nº 9.580/2018, Arts. 306 a 310):** Determina a obrigatoriedade da escrituração do inventário para apuração do lucro real e controle de custos de mercadorias vendidas (CMV), exigindo critérios de avaliação (preço de custo, custo médio ponderado ou valor de mercado).
  - **SPED Fiscal (EFD ICMS/IPI) - Bloco H:** Na era digital, o Livro Modelo 7 é reportado eletronicamente no Bloco H (Inventário Físico), distribuído em registros como `H005` (Totais do Inventário), `H010` (Inventário - Itens do Estoque) e `H020` (Tributação do ICMS).

### 1.1 Estrutura Padrão do Livro Modelo P7

Em sua forma impressa ou relatorial exportada por softwares de gestão (ERPs contábeis e de varejo como Alterdata, Domínio Sistemas, Totvs Protheus/WinThor, Senior, ContaAzul, Bling, Tiny, Market, Sysmo e SG Sistemas), o relatório apresenta invariavelmente duas seções principais:

#### A. Preâmbulo Administrativo (Cabeçalho Institucional / Termo de Abertura)
Contém metadados cadastrais da empresa e do exercício contábil:
- **Razão Social / Nome Empresarial:** Ex: `Mercearia Santo Antônio Ltda`
- **CNPJ:** Formato `XX.XXX.XXX/0001-XX`
- **Inscrição Estadual (IE):** Ex: `123.456.789.000`
- **Data do Balanço / Data de Fechamento:** Data base de corte do estoque (ex: `31/12/2025` ou datas mensais).
- **Número do Livro e Folha:** Ex: `Livro nº 001`, `Folha 001`.

#### B. Grade de Dados dos Produtos (Tabela de Itens)
As colunas do relatório combinam as exigências do Ajuste SINIEF com os padrões de automação comercial e frente de caixa (PDV):
1. **Código:** Código interno do produto no sistema (ID/SKU sequencial ou alfanumérico).
2. **Barras (EAN/GTIN):** Código de barras comercial (EAN-13, GTIN-14, EAN-8). Pode ser vazio em hortifruti, padaria e itens a granel.
3. **NCM:** Classificação Fiscal na Nomenclatura Comum do Mercosul (8 dígitos: `########` ou `####.##.##`).
4. **Discriminação:** Descrição comercial detalhada do item, especificação, marca e embalagem.
5. **Unid (Unidade de Medida):** Símbolo da unidade (ex: `UN`, `CX`, `KG`, `LT`, `PCT`, `FD`).
6. **Qtd (Quantidade):** Saldo físico em estoque na data base (inteiro ou decimal com até 3 ou 4 casas para itens fracionados como KG).
7. **Unitário (Valor Unitário):** Valor de custo ou preço unitário em BRL.
8. **Total:** Valor monetário total do item em estoque (`Total = Qtd * Unitário`).

#### C. Rodapé e Totalizadores Trailing
Ao término da listagem de itens, o relatório frequentemente inclui linhas de fechamento:
- `TOTAL GERAL`, `TOTAL DO INVENTÁRIO` ou `SUBTOTAL`.
- Termos de encerramento e assinaturas do representante legal e do contador com registro no CRC.

---

## 2. Features Discovered

| # | Categoria | Feature | Descrição | Entradas | Saídas | Comportamento de Erro | Descoberto Via |
|---|-----------|---------|-----------|----------|--------|-----------------------|----------------|
| 1 | File Ingestion | Suporte a Formatos `.xlsx` e `.csv` | Leitura de planilhas Excel modernas OpenXML (`.xlsx`) e arquivos de texto delimitados (`.csv`). Suporte condicional a `.xls` (BIFF8). | `File` buffer / Stream (`.xlsx`, `.csv`) | Matriz de células brutas / `RawRow[]` | Arquivo ilegível ou corrompido emite erro impeditivo de arquivo inválido. | ORIGINAL_REQUEST R2 & P7 Spec |
| 2 | CSV Ingestion | Autodetecção de Delimitador CSV | Inferência automática do caractere separador de colunas (`;`, `,`, `\t`, `\|`), priorizando `;` (padrão regional brasileiro do Excel). | Amostra das primeiras N linhas do CSV | Delimitador selecionado (ex: `;`) | Se nenhum delimitador gerar consistência colunar, emite erro `INVALID_CSV_DELIMITER`. | Prática fiscal pt-BR / Excel |
| 3 | CSV Ingestion | Detecção de Codificação de Caracteres | Tratamento de UTF-8 (com ou sem BOM) e decodificação de páginas de código brasileiras legadas (`ISO-8859-1` / `Windows-1252`). | Buffer de bytes brutos do arquivo | String Unicode decodificada sem caracteres corrompidos (`\uFFFD`) | Caracteres inválidos convertidos com substituição segura sem abortar a leitura. | ERPs legados / Windows |
| 4 | Header Detection | Localização Dinâmica do Cabeçalho da Tabela | Algoritmo de varredura que encontra a linha contendo as colunas `Código`, `Barras`, `Discriminação`, `Qtd`, `Unitário` independente do número de linhas de preâmbulo administrativo. | Linhas 1 a 25 da planilha | Índice da linha de cabeçalho (`headerRowIndex`) e mapeamento `{ campo -> índice_coluna }` | Se nenhuma linha atingir a pontuação mínima de âncoras (>= 4 de 5), emite erro `HEADER_NOT_FOUND`. | ORIGINAL_REQUEST R2 |
| 5 | Header Detection | Normalização e Sinônimos de Colunas | Mapeamento flexível com remoção de acentos, pontuação, maiúsculas/minúsculas e busca por sinônimos contábeis comuns (ex: `discriminação` -> `descrição`, `unitário` -> `vl unit`). | Nomes das células do cabeçalho | Identificadores canônicos de campos | Colunas desconhecidas ignoradas; ausência de colunas vitais reduz o score do cabeçalho. | Variações de ERPs |
| 6 | Metadata Extraction | Extração do Preâmbulo Administrativo | Reconhecimento de campos como Razão Social, CNPJ, Inscrição Estadual e Data do Inventário situados antes da linha de cabeçalho. | Linhas 0 até `headerRowIndex - 1` | Objeto de metadados `{ razaoSocial, cnpj, inscricaoEstadual, dataInventario }` | Se não encontrados, campos preenchidos como `null` sem bloquear o processamento dos itens. | Layout Modelo P7 |
| 7 | Data Sanitization | Normalização Numérica e Monetária BRL | Conversão de strings de preço e quantidade no padrão brasileiro (`R$ 1.234,56`, `1.234,56`, `1234,56`) e internacional (`1234.56`) para valores monetários exatos. | Célula de texto ou número bruto | Inteiro de centavos (`centavos: number`) e valor decimal formatado | Formato monetário não reconhecível ou alfanumérico gera erro de linha `INVALID_UNIT_PRICE`. | ORIGINAL_REQUEST R1/R2 |
| 8 | Data Sanitization | Sanitização de Código de Barras (EAN/GTIN) | Limpeza de formatação científica do Excel (ex: `7.89123E+12`), preservação de zeros à esquerda e remoção de espaços/hífens. | Célula bruta de código de barras | String numérica de 8, 12, 13 ou 14 dígitos (ou vazio para itens a granel) | Dígito verificador EAN ou comprimento anômalo gera aviso não impeditivo `INVALID_BARCODE_FORMAT`. | Prática de varejo mercearia |
| 9 | Stop Condition | Detecção de Rodapé e Totais Trailing | Interrupção imediata ou descarte de linhas de sumário no final da planilha (ex: `TOTAL GERAL`, `SUBTOTAL`, `TRANSPORTE`, linhas em branco consecutivas). | Linhas abaixo do cabeçalho | Flag de descarte ou parada de extração de produtos | Evita que totais gerais sejam importados como produtos falsos no estoque. | Relatórios ERP P7 |
| 10 | Row Validation | Validação Estrita de Campos Mandatórios | Verificação de obrigatoriedade de `Código` (não vazio) e `Discriminação` (não vazia e >= 2 caracteres). | Campos da linha mapeada | Status de validação `VALID` ou `ERROR` | Linha com código ou descrição vazia gera erro de linha `MISSING_CODE` ou `MISSING_DESCRIPTION`. | ORIGINAL_REQUEST R2 |
| 11 | Row Validation | Validação de Quantidade e Preço Não Negativos | Bloqueio de quantidades ou preços negativos (`Qtd < 0` ou `Unitário < 0`). Saldo zero (`Qtd == 0`) aceito com aviso. | Campos `qtd` e `unitario` | Status de validação `VALID`, `WARNING` ou `ERROR` | Valor negativo gera erro de linha `NEGATIVE_QUANTITY` ou `NEGATIVE_PRICE`; importação da linha é barrada. | ORIGINAL_REQUEST R2/R4 |
| 12 | Row Validation | Verificação de Consistência Matemática do Total | Validação cruzada do valor calculado `Qtd * Unitário` contra a coluna `Total` declarada no arquivo, admitindo tolerância de até R$ 0,02 para arredondamentos. | `qtd`, `unitario`, `total_declarado` | Status de consistência matemática | Divergência superior a R$ 0,02 emite aviso `TOTAL_MISMATCH` reportando a diferença. | Rigor financeiro R1 |
| 13 | Reporting | Relatório Granular de Feedback por Linha | Retorno estruturado contendo totais processados, itens válidos prontos para salvar, lista de linhas com erros e lista de linhas com avisos. | Matriz completa de linhas processadas | Objeto `P7ParseResult` estruturado | Fornece ao usuário o número da linha na planilha física, coluna e descrição amigável do problema. | ORIGINAL_REQUEST R2 Criteria |
| 14 | Dataset Generation | Especificação de Arquivos de Teste Sintéticos | Definição de massas de dados sintéticas representativas (`.xlsx` e `.csv`) com cabeçalhos reais, produtos típicos de mercearia e injeção controlada de falhas. | Especificação de casos de teste | Arquivos de teste automatizados | Garante cobertura de testes unitários e de integração de 100% dos ramos lógicos do parser. | ORIGINAL_REQUEST Verification |

---

## 3. Edge Cases

| # | Feature | Input | Comportamento Observado / Requerido |
|---|---------|-------|-------------------------------------|
| 1 | Header Detection | Planilha com 12 linhas de preâmbulo administrativo com células mescladas antes do cabeçalho da tabela. | O parser percorre as linhas ignorando textos esparsos de preâmbulo até encontrar a linha com score >= 4 âncoras; define esta linha como cabeçalho e inicia dados na linha seguinte. |
| 2 | Header Detection | Cabeçalho com variações linguísticas: `Cód. Produto | Cód. Barras / EAN | SH/NCM | Descrição das Mercadorias | Und. | Estoque | Vlr. Unitário | Total Geral Item`. | O dicionário de sinônimos e o pipeline de normalização identificam todas as 8 colunas correspondentes sem falha. |
| 3 | CSV Delimiter | CSV com valores contendo ponto e vírgula dentro de aspas (ex: `"Açúcar Cristal; Pacote 5kg";10;4,50`). | O sniffer de CSV e o lexer respeitam qualificadores de texto (aspas duplas) evitando divisão incorreta de campos. |
| 4 | CSV Encoding | Arquivo CSV exportado pelo Excel brasileiro salvo em Windows-1252 contendo `Açúcar`, `Café Moído`, `Óleo de Soja`, `Feijão`. | O detector de encoding reconhece Windows-1252/ISO-8859-1 e converte sem gerar caracteres corrompidos (`Acar` ou `\uFFFD`). |
| 5 | Barcode | Excel converteu código de barras para notação científica: `7.89123E+12` ou truncou zeros à esquerda `0789123456789` -> `789123456789`. | O sanitizador de barras expande notação científica de volta para sequência de dígitos e preenche com zero à esquerda se o tamanho indicar EAN-13 (12 dígitos numéricos válidos). |
| 6 | Barcode | Produto a granel ou pesável (ex: `Banana Prata kg`, `Tomate Italiano kg`, `Pão Francês kg`) sem código de barras. | O parser aceita `barras = null` como item perfeitamente válido, emitindo apenas aviso informativo `MISSING_BARCODE`. |
| 7 | Number Format | Unitário formatado como `R$ 1.250,50` com espaço sem quebra (`\u00A0`), ou `1250.50` no padrão americano, ou `1.250` com ambiguidades. | O analisador numérico remove prefixos de moeda e caracteres invisíveis, aplicando a heurística de separador de milhar e decimal conforme presença de vírgula e ponto. |
| 8 | Trailing Rows | Linhas de fechamento ao final da tabela: `TOTAL GERAL DO ESTOQUE: R$ 45.890,20` e `Total de Itens: 150`. | O detector de stop condition reconhece o padrão de rodapé pela ausência de código de produto associada à palavra-chave `TOTAL` e encerra a extração sem cadastrar o rodapé como produto. |
| 9 | Corrupted Row | Linha com preço de texto (ex: `Unitário = "SOB CONSULTA"` ou `"GRÁTIS"`). | A linha é marcada com erro `INVALID_UNIT_PRICE` e adicionada à lista de itens rejeitados com indicação do número da linha original; as demais linhas válidas continuam sendo processadas. |
| 10 | Negative Quantity | Linha com estoque negativo (ex: `Qtd = -5,00` em razão de ajuste contábil/furo de estoque). | O parser rejeita a linha com erro impeditivo `NEGATIVE_QUANTITY`, garantindo integridade estrita com o Requisito R4 (proibição de estoque negativo). |
| 11 | Duplicate Code | O mesmo código interno do produto aparece em duas linhas distintas do inventário (ex: lotes diferentes ou filiais agrupadas). | O parser registra aviso `DUPLICATE_CODE` e permite configuração: consolidar somando quantidades ou criar registros separados se o banco suportar. |
| 12 | Empty Rows | Linhas em branco intercaladas no meio da planilha ou no final do arquivo. | Linhas puramente vazias são silenciosamente ignoradas sem poluir o log de erros. |

---

## 4. Arquitetura Detalhada do Parser Modelo P7

### 4.1 Pipeline de Processamento em 5 Estágios

```
┌────────────────────────────────────────────────────────┐
│  Estágio 1: Ingestão de Arquivo (.xlsx / .csv)        │
│  - Leitura de buffer em memória                        │
│  - Detecção de formato por extensão e magic bytes      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Estágio 2: Decodificação e Sniffer CSV (se CSV)       │
│  - Detecção de encoding (UTF-8 com/sem BOM vs CP1252)  │
│  - Detecção de delimitador (;, ,, \t, |) por variância │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Estágio 3: Extração de Preâmbulo e Detecção de Header  │
│  - Varredura de linhas 0..25                           │
│  - Normalização de strings (NFKD, sem acentos, trim)    │
│  - Mapeamento com catálogo de sinônimos                │
│  - Score de âncoras (código, barras, desc, qtd, unit)  │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Estágio 4: Sanitização e Normalização de Linhas       │
│  - Detecção de stop condition (TOTAL GERAL, rodapé)    │
│  - Conversão monetária segura para centavos inteiros   │
│  - Sanitização de EAN/GTIN e NCM                       │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  Estágio 5: Validação Estrita e Geração de Feedback    │
│  - Validação de regras de negócio (R1, R2, R4)        │
│  - Segregação de linhas válidas, erros e avisos       │
│  - Objeto de retorno estruturado P7ParseResult         │
└────────────────────────────────────────────────────────┘
```

---

### 4.2 Algoritmo de Detecção do Cabeçalho da Tabela

O leitor **não pode assumir** que a linha 1 (ou linha 0) é o cabeçalho. Em relatórios Modelo P7 reais, o cabeçalho pode estar na linha 1, 3, 5, 8 ou 12.

#### Pipeline de Normalização de Texto da Célula:
1. Converte o valor para `string`.
2. Converte para minúsculas (`toLowerCase()`).
3. Normaliza Unicode via `normalize("NFKD")` e remove diacríticos (acentos) via expressão regular `replace(/[\u0300-\u036f]/g, "")`.
4. Remove pontuação como `.`, `:`, `/`, `-`, `_`.
5. Remove espaços extras e colapsa múltiplos espaços em um único espaço (`replace(/\s+/g, " ").trim()`).

#### Catálogo Canônico de Sinônimos e Âncoras:
As 5 colunas âncoras primárias (conforme `ORIGINAL_REQUEST.md`) e as 3 colunas secundárias:

```typescript
const COLUMN_SYNONYMS: Record<string, string[]> = {
  codigo: [
    "codigo", "cod", "cod.", "codigo interno", "cod produto",
    "codigo produto", "id", "sku", "item", "código"
  ],
  barras: [
    "barras", "cod barras", "codigo barras", "codigo de barras",
    "ean", "gtin", "ean/gtin", "cod ean", "ean13", "gtin13", "cód. barras"
  ],
  ncm: [
    "ncm", "classificacao fiscal", "classificacao", "sh/ncm",
    "ncm/sh", "classif fiscal", "classif."
  ],
  discriminacao: [
    "discriminacao", "descricao", "discriminacao das mercadorias",
    "descricao do produto", "produto", "especificacao", "nome",
    "nome do produto", "descrição", "discriminação"
  ],
  unid: [
    "unid", "unidade", "und", "un", "u.m.", "um", "medida"
  ],
  qtd: [
    "qtd", "quantidade", "quant", "estoque", "saldo", "saldo estoque",
    "quant disponível", "qtde", "quantidade física"
  ],
  unitario: [
    "unitario", "unit", "vl unit", "valor unitario", "vlr unitario",
    "preco unit", "preco unitario", "custo unitario", "vl. unit.",
    "vlr. unit.", "custo unit", "unitário", "preço unitário"
  ],
  total: [
    "total", "vl total", "valor total", "vlr total", "total do item",
    "vl. total", "vlr. total", "total geral item"
  ]
};
```

#### Regra de Pontuação (Score de Reconhecimento):
- **Âncoras Obrigatórias Primárias:** `codigo`, `barras`, `discriminacao`, `qtd`, `unitario`.
- Uma linha candidata recebe **+1 ponto** para cada campo âncora primário identificado em suas células.
- **Critério de Aceitação:** A linha é eleita como cabeçalho se atingir **Score >= 4** (ou seja, 4 das 5 âncoras principais reconhecidas).
- Se mais de uma linha atingir score >= 4, a linha com o maior score (e em caso de empate, a de menor índice) é selecionada.
- Uma vez eleita a linha de cabeçalho no índice `H`, o mapa `campo -> índice da coluna` é fixado, e todas as linhas a partir de `H + 1` são tratadas como dados.

---

### 4.3 Detecção e Sniffing de Delimitador e Encoding CSV

#### A. Detecção de Delimitador (Sniffer)
Em ambientes brasileiros, o Excel salva CSV delimitado por ponto e vírgula (`;`), porque a vírgula (`,`) é o separador decimal. No entanto, sistemas web e exportações internacionais usam vírgula (`,`) ou tabulação (`\t`).

**Algoritmo:**
1. Isola as primeiras 15 linhas não vazias do arquivo.
2. Para cada delimitador candidato (`[";", ",", "\t", "|"]`):
   - Conta quantas ocorrências do delimitador aparecem em cada linha (respeitando aspas).
   - Calcula a média e o desvio padrão da contagem de colunas entre as linhas.
3. O delimitador vencedor é aquele que apresentar:
   - Contagem média de colunas >= 4 (pois o P7 tem no mínimo 5 a 8 colunas).
   - Menor variância/desvio padrão (garantindo consistência estrutural entre as linhas).
   - Em caso de empate entre `;` e `,`, o ponto e vírgula tem precedência por ser o padrão contábil brasileiro.

#### B. Detecção e Decodificação de Encoding
- **BOM (Byte Order Mark):** Se os primeiros 3 bytes forem `0xEF, 0xBB, 0xBF` (UTF-8 BOM), descarta o cabeçalho de 3 bytes e decodifica como UTF-8.
- **Validação UTF-8:** O buffer é submetido à decodificação com validação estrita (`TextDecoder("utf-8", { fatal: true })`).
- **Fallback para Windows-1252 / ISO-8859-1:** Se o `TextDecoder` estrito lançar exceção de byte inválido (característico de arquivos gerados em Windows com acentos em Latin-1), o decodificador recorre automaticamente a `TextDecoder("windows-1252")` ou `TextDecoder("iso-8859-1")`, preservando perfeitamente caracteres como `ç`, `ã`, `é`, `ó`, `º`, `ª`.

---

### 4.4 Normalização Numérica e Integridade Monetária

O Requisito R1 e R2 exigem precisão monetária estrita em BRL sem perda por imprecisão de ponto flutuante.

#### Regras de Conversão Numérica:
1. **Limpeza Prévia:**
   - Remove o prefixo `R$`, `$`, `BRL`.
   - Remove espaços em branco ordinários e espaços sem quebra (`\u00A0`).
   - Remove parênteses contábeis (ex: `(12,50)` -> `-12.50`).
2. **Separação Decimal vs. Milhar:**
   - Se a string contém tanto ponto (`.`) quanto vírgula (`,`):
     - Se o ponto precede a vírgula (ex: `1.234,56`): o ponto é milhar e a vírgula é decimal -> substitui ponto por vazio e vírgula por ponto (`1234.56`).
     - Se a vírgula precede o ponto (ex: `1,234.56`): a vírgula é milhar e o ponto é decimal -> substitui vírgula por vazio (`1234.56`).
   - Se a string contém apenas vírgula (`,`):
     - Ex: `1234,56` ou `4,5` -> substitui vírgula por ponto (`1234.56`, `4.5`).
   - Se a string contém apenas ponto (`.`):
     - Se houver mais de um ponto (ex: `1.000.000`): pontos são milhares -> remove pontos.
     - Se houver exatamente um ponto e exatamente 3 dígitos após o ponto e o valor é inteiro (ex: `1.250`): no contexto de quantidade pode ser decimal (`1.250 kg`) ou milhar (`1250 UN`). Em valores monetários do P7, o padrão contábil exige centavos; portanto `1234.56` é interpretado como decimal.
3. **Representação Interna:**
   - **Moeda (Unitário e Total):** Converte para número inteiro representando centavos (`centavos = Math.round(valorFloat * 100)` ou uso de biblioteca decimal para precisão infinita). Ex: `R$ 10,50` vira `1050`. Isso elimina completamente erros como `0.1 + 0.2 = 0.30000000000000004`.
   - **Quantidade:** Mantém como número decimal positivo com até 3 ou 4 casas decimais (ex: `2.500` para 2,5 kg de produto pesável).

---

### 4.5 Detecção de Condição de Parada (Rodapés e Totais Trailing)

Muitas planilhas de inventário encerram a grade de dados com linhas de totalização consolidada:
- Exemplo 1: `A: ""` | `B: ""` | `D: "TOTAL GERAL DO ESTOQUE"` | `H: "R$ 48.920,50"`
- Exemplo 2: `A: "SUBTOTAL DA FOLHA 01"` | `H: "12.350,00"`
- Exemplo 3: `A: "Assinatura do Contador: CRC/SP 123456"`

**Critérios para Interromper Extração ou Descartar a Linha:**
1. A linha possui as células de `código` e `barras` vazias **E** contém no campo de descrição ou em qualquer célula palavras-chave como:
   `/^(total|subtotal|resumo|transporte|folha|assinatura|termo\s+de\s+encerramento)/i`.
2. Se a palavra `TOTAL GERAL` for detectada, o parser pode opcionalmente capturar o valor monetário da coluna `Total` como `totalDeclaradoNoArquivo` para confronto com a soma calculada dos itens.
3. Ocorrência de 3 ou mais linhas vazias consecutivas finaliza a leitura do bloco de itens.

---

### 4.6 Matriz de Regras de Validação e Erros

A validação opera linha a linha. Cada linha processada recebe uma das três classificações:
- `VALID`: Todos os campos obrigatórios estão íntegros e dentro das regras. Pronta para persistência.
- `WARNING`: Dados aceitáveis para persistência, mas com advertência contábil (ex: código de barras ausente, divergência de centavos no total, quantidade zerada).
- `ERROR`: Dados corrompidos ou inconsistentes. A linha é **rejeitada/quarentenada** e não é gravada no banco.

```
┌───────────────────────────┬─────────┬────────────────────────────────────────────────────────┐
│ Código de Erro / Aviso    │ Tipo    │ Condição de Disparo                                    │
├───────────────────────────┼─────────┼────────────────────────────────────────────────────────┤
│ MISSING_CODE              │ ERROR   │ Código interno vazio, nulo ou composto apenas por whitespace │
│ MISSING_DESCRIPTION       │ ERROR   │ Discriminação vazia ou com menos de 2 caracteres úteis │
│ INVALID_QUANTITY          │ ERROR   │ Quantidade não é um número válido                      │
│ NEGATIVE_QUANTITY         │ ERROR   │ Quantidade é menor que zero (Qtd < 0)                  │
│ INVALID_UNIT_PRICE        │ ERROR   │ Preço unitário não é um número válido ou vazio         │
│ NEGATIVE_PRICE            │ ERROR   │ Preço unitário é menor que zero (Unitário < 0)         │
│ CORRUPTED_ROW             │ ERROR   │ Linha truncada ou células desalinhadas                 │
│ ZERO_QUANTITY             │ WARNING │ Quantidade igual a 0 (produto sem estoque atual)       │
│ ZERO_PRICE                │ WARNING │ Preço unitário igual a 0 (amostra grátis / brinde)     │
│ MISSING_BARCODE           │ WARNING │ Código de barras vazio (comum em pesáveis / granel)    │
│ INVALID_BARCODE_FORMAT    │ WARNING │ Código de barras preenchido mas com dígito inválido    │
│ TOTAL_MISMATCH            │ WARNING │ |Qtd * Unitário - TotalDeclarado| > R$ 0,02            │
│ DUPLICATE_CODE            │ WARNING │ O mesmo código interno aparece mais de uma vez         │
└───────────────────────────┴─────────┴────────────────────────────────────────────────────────┘
```

---

## 5. Especificação dos Arquivos de Teste Sintéticos

Para assegurar testes automatizados reproduzíveis (Requisito R2 e Critérios de Aceitação), foram especificados **6 arquivos de teste sintéticos**, cobrindo 100% dos caminhos e ramos de exceção do parser:

### 5.1 Catálogo dos Arquivos Sintéticos de Teste

| Nome do Arquivo | Formato | Encoding / Delim | Objetivo de Teste |
|-----------------|---------|------------------|-------------------|
| `p7_padrao_completo.xlsx` | `.xlsx` | OpenXML padrão | Happy path completo com 15 produtos de mercearia, preâmbulo de 4 linhas, EANs válidos, NCMs e totais exatos. |
| `p7_padrao_completo.csv` | `.csv` | UTF-8, Delim `;` | Happy path em CSV brasileiro tradicional (ponto e vírgula como separador). |
| `p7_preambulo_longo.xlsx` | `.xlsx` | OpenXML padrão | Planilha com 8 linhas de preâmbulo administrativo mesclado e 2 linhas em branco antes da linha de cabeçalho. |
| `p7_encoding_latin1.csv` | `.csv` | Windows-1252, Delim `;` | Teste de caracteres especiais brasileiros (`Açúcar`, `Café Moído`, `Óleo`, `Feijão`, `Sabão em Pó`) gravados em CP1252. |
| `p7_delimitador_virgula.csv` | `.csv` | UTF-8, Delim `,` | CSV com vírgula como separador e aspas duplas em campos com vírgulas internas. |
| `p7_casos_limite_e_erros.xlsx` | `.xlsx` | OpenXML padrão | Bateria completa de edge cases e corrupções: produto pesável sem EAN, estoque zero, estoque negativo, preço com texto, total divergente e rodapé `TOTAL GERAL`. |

---

### 5.2 Massa de Dados dos Produtos Típicos de Mercearia

A tabela abaixo representa a massa de dados sintética de uma mercearia real (produtos da cesta básica, limpeza e bebidas), utilizada para a geração dos arquivos de teste:

| Código | Barras (EAN-13) | NCM | Discriminação | Unid | Qtd | Unitário (R$) | Total (R$) | Categoria / Observação |
|:---:|:---:|:---:|---|:---:|:---:|:---:|:---:|---|
| `1001` | `7891000100103` | `1006.30.21` | Arroz Agulhinha Tipo 1 Pacote 5kg | PCT | 120 | 28,90 | 3.468,00 | Mercearia Básica |
| `1002` | `7891000200209` | `0713.33.19` | Feijão Carioca Tipo 1 Pacote 1kg | PCT | 85 | 7,49 | 636,65 | Mercearia Básica |
| `1003` | `7891000300305` | `1507.90.11` | Óleo de Soja Refinado Pet 900ml | UN | 150 | 5,89 | 883,50 | Mercearia Básica |
| `1004` | `7891000400401` | `1701.99.00` | Açúcar Cristal Branco Pacote 1kg | PCT | 90 | 4,29 | 386,10 | Mercearia Básica |
| `1005` | `7891000500507` | `0901.21.00` | Café Torrado e Moído Tradicional 500g | PCT | 60 | 18,90 | 1.134,00 | Matinal |
| `1006` | `7891000600603` | `0401.20.10` | Leite UHT Integral Longa Vida 1L | UN | 200 | 4,79 | 958,00 | Laticínios |
| `1007` | `7891000700709` | `1902.19.00` | Macarrão Espaguete com Ovos 500g | PCT | 110 | 3,99 | 438,90 | Massas |
| `1008` | `7891000800805` | `2103.20.10` | Molho de Tomate Tradicional Sachê 300g | UN | 140 | 2,19 | 306,60 | Condimentos |
| `1009` | `7891000900901` | `3402.20.00` | Detergente Líquido Neutro Frasco 500ml | UN | 180 | 2,49 | 448,20 | Limpeza |
| `1010` | `7891001001003` | `3401.19.00` | Sabão em Barra Multiuso Pacote 5x200g | PCT | 45 | 9,80 | 441,00 | Limpeza |
| `1011` | `7891001101109` | `2202.10.00` | Refrigerante Guaraná Garrafa Pet 2L | UN | 95 | 7,99 | 759,05 | Bebidas |
| `1012` | `7891001201205` | `2203.00.00` | Cerveja Puro Malte Lata 350ml | UN | 240 | 3,89 | 933,60 | Bebidas |
| `1013` | `7891001301301` | `4818.10.00` | Papel Higiênico Folha Dupla 12 Rolos | FD | 50 | 19,90 | 995,00 | Higiene |
| `1014` | `7891001401407` | `3306.10.00` | Creme Dental Proteção Anticáries 90g | UN | 75 | 4,49 | 336,75 | Higiene |
| `1015` | `7891001501503` | `1905.31.00` | Biscoito Recheado Chocolate 130g | UN | 130 | 2,89 | 375,70 | Mercearia Doce |
| **Total** | — | — | **SOMA TOTAL GERAL DO INVENTÁRIO** | — | **1.770** | — | **R$ 12.501,05** | — |

---

### 5.3 Dados Injetados no Arquivo de Teste de Casos Limite (`p7_casos_limite_e_erros.xlsx`)

Para garantir a robustez das validações e do relatório de erros, este arquivo conterá linhas propositalmente adulteradas:

1. **Linha 6 (Item Válido Pesável sem EAN):**
   - Código: `2001`, Barras: `""` (vazio), NCM: `0803.90.00`, Discriminação: `Banana Prata Climatizada`, Unid: `KG`, Qtd: `45.500`, Unitário: `5.99`, Total: `272.55`.
   - *Resultado esperado:* Importação bem-sucedida com aviso `MISSING_BARCODE`.
2. **Linha 7 (Item com Estoque Zero):**
   - Código: `2002`, Barras: `7892002002002`, NCM: `1006.30.21`, Discriminação: `Arroz Parboilizado 5kg`, Unid: `PCT`, Qtd: `0`, Unitário: `29.50`, Total: `0.00`.
   - *Resultado esperado:* Importação bem-sucedida com aviso `ZERO_QUANTITY`.
3. **Linha 8 (Erro Fatal - Quantidade Negativa):**
   - Código: `2003`, Barras: `7892003003008`, NCM: `0713.33.19`, Discriminação: `Feijão Preto Pacote 1kg`, Unid: `PCT`, Qtd: `-10`, Unitário: `6.90`, Total: `-69.00`.
   - *Resultado esperado:* Linha **rejeitada** com erro `NEGATIVE_QUANTITY`.
4. **Linha 9 (Erro Fatal - Código em Branco):**
   - Código: `""` (vazio), Barras: `7892004004004`, NCM: `1507.90.11`, Discriminação: `Óleo de Girassol Pet 900ml`, Unid: `UN`, Qtd: `20`, Unitário: `8.50`, Total: `170.00`.
   - *Resultado esperado:* Linha **rejeitada** com erro `MISSING_CODE`.
5. **Linha 10 (Erro Fatal - Preço com Texto Inválido):**
   - Código: `2005`, Barras: `7892005005000`, NCM: `1701.99.00`, Discriminação: `Açúcar Demerara Pacote 1kg`, Unid: `PCT`, Qtd: `15`, Unitário: `"GRATIS"`, Total: `"0.00"`.
   - *Resultado esperado:* Linha **rejeitada** com erro `INVALID_UNIT_PRICE`.
6. **Linha 11 (Aviso - Total Divergente):**
   - Código: `2006`, Barras: `7892006006006`, NCM: `0901.21.00`, Discriminação: `Café Extraforte 500g`, Unid: `PCT`, Qtd: `10`, Unitário: `15.00`, Total: `300.00` (divergência de R$ 150,00).
   - *Resultado esperado:* Importado com aviso `TOTAL_MISMATCH` reportando divergência calculada.
7. **Linha 12 (Rodapé Trailing - Linha de Total Geral):**
   - Código: `""`, Barras: `""`, NCM: `""`, Discriminação: `TOTAL GERAL DO ESTOQUE`, Unid: `""`, Qtd: `""`, Unitário: `""`, Total: `642.55`.
   - *Resultado esperado:* Linha identificada como rodapé/stop condition; **não** cadastrada como produto.

---

## 6. Interfaces TypeScript Recomendadas

```typescript
export interface P7AdministrativeHeader {
  razaoSocial?: string | null;
  cnpj?: string | null;
  inscricaoEstadual?: string | null;
  dataInventario?: string | null;
  numeroLivro?: string | null;
  numeroFolha?: string | null;
}

export interface P7ProductItem {
  rowNumber: number; // Linha física na planilha (1-based)
  codigo: string;
  barras: string | null;
  ncm: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number; // Suporta frações (ex: 1.500 kg)
  unitarioCentavos: number; // Valor monetário exato em centavos inteiros (ex: R$ 10,50 -> 1050)
  unitarioFormatado: string; // "10,50"
  totalCentavos: number; // Qtd * Unitário em centavos
  totalFormatado: string; // "10,50"
}

export type P7IssueSeverity = "ERROR" | "WARNING";

export interface P7RowIssue {
  rowNumber: number;
  severity: P7IssueSeverity;
  code:
    | "MISSING_CODE"
    | "MISSING_DESCRIPTION"
    | "INVALID_QUANTITY"
    | "NEGATIVE_QUANTITY"
    | "INVALID_UNIT_PRICE"
    | "NEGATIVE_PRICE"
    | "CORRUPTED_ROW"
    | "ZERO_QUANTITY"
    | "ZERO_PRICE"
    | "MISSING_BARCODE"
    | "INVALID_BARCODE_FORMAT"
    | "TOTAL_MISMATCH"
    | "DUPLICATE_CODE";
  column?: string;
  message: string;
  rawValue?: unknown;
}

export interface P7ParseResult {
  success: boolean; // true se pelo menos 1 item foi importado e nenhum erro crítico de arquivo ocorreu
  fileName: string;
  fileType: "xlsx" | "csv" | "xls";
  encoding?: string;
  delimiter?: string;
  headerRowIndex: number; // 0-based
  administrativeHeader: P7AdministrativeHeader;
  totalRowsRead: number;
  validItems: P7ProductItem[];
  errors: P7RowIssue[];
  warnings: P7RowIssue[];
  summary: {
    totalItemsImported: number;
    totalStockQuantity: number;
    totalValueCentavos: number;
    errorCount: number;
    warningCount: number;
  };
}
```

---

## 7. Próximos Passos e Recomendações para Implementação

1. **Biblioteca Recomendada:**
   - Para `.xlsx`: biblioteca `exceljs` ou `xlsx` (SheetJS) permite leitura eficiente em streams e manipulação direta de células e fórmulas.
   - Para `.csv`: parser de streaming com suporte a detecção de delimitador e conversão de buffers legados (`iconv-lite` ou `TextDecoder` nativo do Node.js).
2. **Integração com o Banco de Dados (R4/R5):**
   - O schema do banco de dados deve armazenar `unitario_centavos` (inteiro) ou `Decimal` no Prisma/SQLite, preservando precisão monetária estrita.
   - O campo `barras` deve ser indexado (`@@index([barras])`) para permitir busca instantânea por leitor de código de barras físico no PDV e na baixa de estoque.
3. **Massa de Testes:**
   - Criar os 6 arquivos de teste sintéticos descritos no diretório de fixtures de teste do projeto para validação contínua no Vitest/Jest.
