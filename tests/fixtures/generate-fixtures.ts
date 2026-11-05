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
  const dir = outputDir || path.resolve(__dirname);
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
