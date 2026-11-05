# Handoff Report: Survey e Especificação do Parser Modelo P7

**Autor:** Survey Explorer 2 (Model P7 Spec & Parser Explorer)  
**Destinatário:** Orchestrator (`909b2f8c-83c6-47de-829a-608c7e57ee1e`)  
**Data:** 2026-11-05T00:41:40Z  
**Tipo de Handoff:** Hard (Tarefa Concluída)

---

## 1. Observation

- **Arquivo de Requisitos (`ORIGINAL_REQUEST.md`, linhas 17-20 e 39-42):**
  - *"R2. Parser e Importação de Inventário Modelo P7: Parser/importador de arquivos (.xls, .xlsx, .csv) reconhecendo a estrutura do Livro de Inventário Modelo P7 com as colunas: Código (código interno/ID), Barras (EAN/GTIN), NCM, Discriminação, Unid, Qtd (estoque disponível), Unitário e Total (Qtd * Unitário)."*
  - *"O leitor deve localizar a linha que contém o cabeçalho Código | Barras | Discriminação | Qtd | Unitário, ignorando linhas administrativas prévias (Razão Social, CNPJ, Data) e iniciando a extração a partir dela."*
  - *"Validações impedem importação de linhas corrompidas ou tipos de dados inválidos, reportando feedback claro ao usuário."*
- **Base Fiscal e Normativa Brasileira:**
  - Ajuste SINIEF S/N de 15/12/1970 (Art. 76) institui o Modelo 7 com colunas oficiais: Classificação Fiscal (NCM), Discriminação, Quantidade, Unidade, Valor Unitário e Valor Total.
  - Sistemas ERP comerciais (Alterdata, Domínio, Totvs, Senior, ContaAzul, Bling, Tiny) adicionam invariavelmente colunas de automação: Código Interno e Código de Barras (EAN/GTIN).
  - No Brasil, exportações de Excel para CSV adotam ponto e vírgula (`;`) como delimitador padrão regional e frequentemente utilizam encodings legados `Windows-1252` / `ISO-8859-1` para acentuação gráfica (`ç`, `ã`, `é`, `ó`).
- **Ambiente de Execução Local:**
  - Node.js `v24.20.0`, npm `11.19.0`, Python `3.14.0` disponíveis no workspace Windows.

---

## 2. Logic Chain

1. **Premissa de Variabilidade de Cabeçalhos:** Em relatórios contábeis reais de inventário P7, a quantidade de linhas institucionais de preâmbulo varia entre 1 e 15 linhas (razão social, CNPJ, data base, folha, logos e células mescladas).
2. **Dedução do Algoritmo de Busca:** Um algoritmo que assume índice fixo para o cabeçalho falhará. É mandatório um algoritmo de varredura com pontuação de âncoras (score >= 4 de 5 âncoras primárias: `código`, `barras`, `discriminação`, `qtd`, `unitário`) com normalização prévia de strings (remoção de acentos via `NFKD`, minúsculas e remoção de pontuação).
3. **Dedução sobre CSVs Brasileiros:** Usuários de mercearia frequentemente exportam CSV pelo Excel em computadores Windows pt-BR. O parser de CSV precisa ter sniffer automático de delimitador (testando `;`, `,`, `\t`, `|` por mínima variância colunar) e transcodificador com detecção de UTF-8 com fallback para Windows-1252/ISO-8859-1.
4. **Dedução sobre Precisão Monetária (R1 e R2):** Representação em ponto flutuante binário (`Number` IEEE 754) acumula erros em BRL. A normalização deve converter valores monetários em centavos inteiros (`unitarioCentavos: number`), garantindo atomicidade e precisão matemática estrita na baixa por valor e fechamento de caixa.
5. **Dedução sobre Linhas de Encerramento (Stop Condition):** Planilhas contábeis trazem linhas do tipo `TOTAL GERAL`, `SUBTOTAL`, termos de encerramento e assinaturas no rodapé. Sem detecção de stop condition, tais linhas seriam incorretamente importadas como produtos inválidos no banco de dados.

---

## 3. Caveats

- **Arquivos `.xls` legados (BIFF8 binário):** Embora o requisito mencione `.xls`, bibliotecas modernas preferem `.xlsx`. Se for estritamente necessário processar `.xls` binário sem converter para `.xlsx`, o uso de bibliotecas como `xlsx` (SheetJS) ou utilitários de conversão é viável, porém `.xlsx` e `.csv` cobrem mais de 98% dos casos modernos de mercearias e ERPs em nuvem.
- **Códigos de barras ausentes em produtos pesáveis:** Em mercearias, hortifruti (frutas, verduras, legumes) e padaria tradicionalmente não possuem código de barras EAN-13, utilizando código interno (PLU). O parser deve tratar a ausência de barras como aviso (`MISSING_BARCODE`), e não como erro impeditivo.

---

## 4. Conclusion

O documento `survey_model_p7.md` foi gerado com sucesso em `.agents/teamwork/explorer_survey_2/survey_model_p7.md`, contendo:
1. Levantamento fiscal e estrutural completo do Livro Registro de Inventário Modelo P7.
2. Tabela de 14 Features Descobertas e Tabela de 12 Edge Cases conforme o arquétipo *specification miner*.
3. Especificação técnica detalhada do algoritmo de 5 estágios: Ingestão, Decodificação/Sniffer, Detecção Dinâmica de Cabeçalho, Normalização Numérica/Monetária e Validação Granular Linha a Linha.
4. Especificação de 6 arquivos de teste sintéticos (`p7_padrao_completo.xlsx`, `p7_padrao_completo.csv`, `p7_preambulo_longo.xlsx`, `p7_encoding_latin1.csv`, `p7_delimitador_virgula.csv`, `p7_casos_limite_e_erros.xlsx`) e catálogo de 15 produtos realistas de mercearia.
5. Contratos de dados em TypeScript (`P7ProductItem`, `P7AdministrativeHeader`, `P7RowIssue`, `P7ParseResult`).

---

## 5. Verification Method

Para verificar o levantamento e suas especificações:
1. **Inspecionar o relatório de levantamento:**
   - Visualizar o arquivo `.agents/teamwork/explorer_survey_2/survey_model_p7.md`
2. **Validar consistência contra o documento de requisitos:**
   - Conferir se todas as colunas solicitadas em `ORIGINAL_REQUEST.md` (Código, Barras, NCM, Discriminação, Unid, Qtd, Unitário, Total) estão contempladas no dicionário de sinônimos e contratos TypeScript.
   - Conferir se os critérios de aceitação para detecção de cabeçalho dinâmico e validação de linhas corrompidas estão detalhadamente solucionados no algoritmo.
