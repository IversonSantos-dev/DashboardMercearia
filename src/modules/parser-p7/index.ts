/**
 * Model P7 Inventory Parser Engine
 * Project: Dashboard Mercearia
 * Module: src/modules/parser-p7/index.ts
 *
 * Implements strict ingestion, dynamic header scoring, CSV delimiter sniffing,
 * encoding transcoding, stop condition detection, currency normalization (integer cents),
 * and row validation/quarantine for Brazilian Fiscal Inventory Book Model P7.
 */

import * as XLSX from "xlsx";
import { brlToCentavos, multiplyMoney, addMoney, centavosToBRL } from "@/modules/currency";

// ====================================================================
// Type Definitions (PROJECT.md & Interface Contracts)
// ====================================================================

export interface P7ProductItem {
  codigo: string;
  barras: string | null;
  ncm: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitarioCentavos: number;
  totalCentavos: number;
  rowNumber?: number;
}

export type P7IssueSeverity = "WARNING" | "ERROR";

export type P7IssueCode =
  | "MISSING_CODE"
  | "MISSING_DESCRIPTION"
  | "INVALID_QUANTITY"
  | "NEGATIVE_QUANTITY"
  | "INVALID_UNIT_PRICE"
  | "NEGATIVE_PRICE"
  | "ZERO_QUANTITY"
  | "ZERO_PRICE"
  | "MISSING_BARCODE"
  | "TOTAL_MISMATCH"
  | "DUPLICATE_CODE"
  | "HEADER_NOT_FOUND"
  | "CORRUPTED_ROW";

export interface P7RowIssue {
  rowNumber: number;
  codigo?: string;
  discriminacao?: string;
  reason: string;
  severity: P7IssueSeverity;
  code?: P7IssueCode;
  rawContent?: string;
}

export interface P7AdministrativeHeader {
  razaoSocial?: string;
  cnpj?: string;
  dataInventario?: string;
}

export interface P7ParseResult {
  administrativeHeader: P7AdministrativeHeader;
  headerRowIndex: number;
  items: P7ProductItem[];
  quarantine: P7RowIssue[];
  warnings?: P7RowIssue[];
  totalItensValidos: number;
  valorTotalGeralCentavos: number;
  fileName?: string;
  fileType?: "xlsx" | "csv" | "xls";
  delimiter?: string;
  encoding?: string;
}

// ====================================================================
// 1. Character Transcoding & CSV Sniffing
// ====================================================================

/**
 * Transcodes a raw buffer into a Unicode string.
 * Automatically handles UTF-8 with BOM, standard UTF-8, and falls back to
 * Windows-1252 / ISO-8859-1 on invalid byte sequences.
 */
export function transcodeBufferToString(buffer: Buffer | Uint8Array): {
  text: string;
  encoding: "utf-8" | "windows-1252";
} {
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    return {
      text: utf8Decoder.decode(buffer),
      encoding: "utf-8",
    };
  } catch {
    const winDecoder = new TextDecoder("windows-1252");
    return {
      text: winDecoder.decode(buffer),
      encoding: "windows-1252",
    };
  }
}

/**
 * Counts unquoted occurrences of a delimiter in a single CSV line.
 */
function countDelimitersInLine(line: string, delim: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        i++; // Escaped quote ("")
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === delim) {
      count++;
    }
  }
  return count;
}

/**
 * Automatically detects the CSV delimiter (;, ,, \t, |).
 * Prioritizes semicolon (;) as the regional Brazilian standard.
 */
export function sniffCsvDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 20);

  if (lines.length === 0) return ";";

  const candidateDelimiters = [";", ",", "\t", "|"];
  let bestDelim = ";";
  let bestScore = -1;

  for (const delim of candidateDelimiters) {
    const counts = lines.map((line) => countDelimitersInLine(line, delim));
    const validRows = counts.filter((c) => c >= 3);
    if (validRows.length === 0) continue;

    const freq: Record<number, number> = {};
    for (const c of validRows) {
      freq[c] = (freq[c] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(freq));
    // Brazilian precedence bonus for semicolon
    const tieBonus = delim === ";" ? 3 : delim === "," ? 1 : 0;
    const score = maxFreq * 10 + tieBonus;

    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  return bestDelim;
}

/**
 * Parses a CSV string into a 2D matrix of raw string cells,
 * strictly adhering to RFC-4180 quotation and newline rules.
 */
export function parseCsvToRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

// ====================================================================
// 2. Dynamic Header Anchor Scoring & Normalization
// ====================================================================

/**
 * Normalizes cell text for matching:
 * Lowercases, strips diacritics (NFKD), removes punctuation, collapses whitespace.
 */
export function normalizeCellText(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim().toLowerCase();
  return str
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Disambiguates and classifies a header cell into a canonical field name.
 * Priority-ordered to prevent false positives (e.g. 'cod barras' matching 'codigo',
 * or 'cod produto' matching 'discriminacao').
 */
export function matchColumnField(normText: string): string | null {
  if (!normText) return null;

  // 1. Barras / EAN / GTIN (must precede codigo because of 'cod barras' / 'codigo de barras')
  if (/\b(barras|ean|gtin)\b/.test(normText)) {
    return "barras";
  }

  // 2. Código Interno (must precede discriminacao so 'cod produto' is recognized as codigo)
  if (/\b(codigo|cod|sku)\b/.test(normText) || normText === "id") {
    return "codigo";
  }

  // 3. NCM / Classificação Fiscal
  if (/\b(ncm|classificacao|classif)\b/.test(normText)) {
    return "ncm";
  }

  // 4. Total vs Unitário (Total must precede Unitário so 'total geral item' is total)
  if (/\b(total|tot)\b/.test(normText)) {
    return "total";
  }
  if (
    /\b(unitario|unit|unitar|preco|custo)\b/.test(normText) ||
    /\bvl\s+unit\b/.test(normText) ||
    /\bvlr\s+unit\b/.test(normText)
  ) {
    return "unitario";
  }

  // 5. Quantidade / Estoque / Saldo
  if (/\b(qtd|qtde|quantidade|quant|estoque|saldo)\b/.test(normText)) {
    return "qtd";
  }

  // 6. Unidade de Medida
  if (
    /\b(unid|unidade|und|medida)\b/.test(normText) ||
    normText === "un" ||
    normText === "u m" ||
    normText === "um"
  ) {
    return "unidade";
  }

  // 7. Discriminação / Descrição / Especificação / Produto
  if (
    /\b(discriminacao|descricao|especificacao|produto|mercadoria|item|nome)\b/.test(
      normText
    )
  ) {
    return "discriminacao";
  }

  return null;
}

export interface HeaderDetectionResult {
  headerRowIndex: number;
  colMap: Record<string, number>;
  score: number;
}

/**
 * Scans rows 0..maxScan (default 100), scores primary anchors against candidate cells,
 * and elects the row with score >= 4 as the table header.
 * Early-breaks immediately if maximum score (5/5) is achieved.
 */
export function detectP7Header(
  rows: unknown[][],
  maxScan: number = 100
): HeaderDetectionResult {
  const scanLimit = Math.min(maxScan, rows.length);
  let bestRowIndex = -1;
  let bestScore = -1;
  let bestColMap: Record<string, number> = {};

  const PRIMARY_ANCHORS = ["codigo", "barras", "discriminacao", "qtd", "unitario"];

  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const colMap: Record<string, number> = {};
    const matchedAnchors = new Set<string>();

    for (let c = 0; c < row.length; c++) {
      const norm = normalizeCellText(row[c]);
      const matchedField = matchColumnField(norm);
      if (matchedField && colMap[matchedField] === undefined) {
        colMap[matchedField] = c;
        if (PRIMARY_ANCHORS.includes(matchedField)) {
          matchedAnchors.add(matchedField);
        }
      }
    }

    const score = matchedAnchors.size;
    if (score >= 4 && score > bestScore) {
      bestScore = score;
      bestRowIndex = r;
      bestColMap = colMap;
      if (score === PRIMARY_ANCHORS.length) {
        break;
      }
    }
  }

  return {
    headerRowIndex: bestRowIndex,
    colMap: bestColMap,
    score: bestScore,
  };
}

// ====================================================================
// 3. Administrative Preamble & Stop Condition Handling
// ====================================================================

/**
 * Extracts Razão Social, CNPJ, and Data do Inventário from preamble rows (0..headerRowIndex - 1).
 */
export function extractAdministrativeHeader(
  rows: unknown[][],
  headerRowIndex: number
): P7AdministrativeHeader {
  const result: P7AdministrativeHeader = {};
  if (headerRowIndex <= 0) return result;

  const preambleRows = rows.slice(0, headerRowIndex);

  for (const row of preambleRows) {
    if (!row) continue;
    for (const cell of row) {
      if (cell === null || cell === undefined) continue;
      const text = String(cell).trim();
      if (!text) continue;

      // 1. CNPJ pattern (XX.XXX.XXX/XXXX-XX or 14 digits)
      if (!result.cnpj) {
        const cnpjMatch = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
        if (cnpjMatch) {
          result.cnpj = cnpjMatch[0];
        } else {
          const raw14 = text.match(/\b\d{14}\b/);
          if (raw14) {
            result.cnpj = raw14[0];
          }
        }
      }

      // 2. Data do Inventário
      if (!result.dataInventario) {
        const dateMatch = text.match(
          /(?:data(?:[^\d:]*)?[:\-\s]+)?(\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b)/i
        );
        if (dateMatch && dateMatch[1]) {
          // Verify it is not a CNPJ fragment
          if (!text.includes("/0001") && !text.includes("/0002")) {
            result.dataInventario = dateMatch[1];
          }
        }
      }

      // 3. Razão Social
      if (!result.razaoSocial) {
        const normForHeader = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        const razaoMatch = normForHeader.match(
          /(?:razao\s+social|empresa|nome\s+empresarial)\s*[:\-]\s*([^\n\r;,\t|]+)/i
        );
        if (razaoMatch && razaoMatch[1]?.trim()) {
          const colonIdx = text.search(/[:\-]/);
          const rawName = colonIdx !== -1 ? text.slice(colonIdx + 1).split(/[;\t|]/)[0].trim() : razaoMatch[1].trim();
          result.razaoSocial = rawName;
        } else if (
          !text.includes(":") &&
          !text.match(/\d{2}\.\d{3}/) &&
          !text.match(/\d{2}\/\d{2}\/\d{4}/) &&
          /^[A-Za-zÀ-ÿ0-9\s.&'-]{5,}$/.test(text) &&
          !/inventario|modelo\s+p?7|livro|termo\s+de\s+abertura/i.test(text)
        ) {
          result.razaoSocial = text;
        }
      }
    }
  }

  return result;
}

/**
 * Evaluates whether a row marks the end of the item data (stop condition).
 * Triggers on totals, subtotals, closures, or signatures.
 */
export function isStopCondition(
  row: unknown[],
  colMap: Record<string, number>
): boolean {
  const codigoRaw =
    colMap.codigo !== undefined ? String(row[colMap.codigo] ?? "").trim() : "";
  const descRaw =
    colMap.discriminacao !== undefined
      ? String(row[colMap.discriminacao] ?? "").trim()
      : "";
  const firstColRaw = String(row[0] ?? "").trim();

  const stopPattern =
    /^(total\s+geral|total\s+do\s+estoque|total\s+do\s+inventario|total\s+geral\s+item|subtotal|resumo|transporte|folha|assinatura|termo\s+de\s+encerramento)/i;

  // 1. If code itself indicates a total / subtotal row
  if (stopPattern.test(codigoRaw)) {
    return true;
  }

  // 2. If code is empty and description or first cell matches stop keywords
  if (!codigoRaw && (stopPattern.test(descRaw) || stopPattern.test(firstColRaw))) {
    return true;
  }

  // 3. If any cell in the row starts with "TOTAL GERAL" or "TERMO DE ENCERRAMENTO"
  for (const cell of row) {
    if (cell === null || cell === undefined) continue;
    const str = String(cell).trim();
    if (/^(total\s+geral|termo\s+de\s+encerramento)/i.test(str)) {
      return true;
    }
  }

  return false;
}

// ====================================================================
// 4. Data Sanitization & Normalization Helpers
// ====================================================================

/**
 * Sanitizes barcode / EAN values. Handles Excel scientific notation,
 * non-digit removal, and 12-to-13 digit padding for leading zeroes.
 */
export function sanitizeBarcode(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  let str = String(val).trim();
  if (!str || /^(sem\s+gtin|sem\s+ean|null|undefined)$/i.test(str)) {
    return null;
  }

  // Handle scientific notation from Excel (e.g. 7.89123E+12)
  if (/[eE]\+?/.test(str)) {
    const num = Number(str);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      str = BigInt(Math.round(num)).toString();
    }
  }

  // Strip non-digits
  str = str.replace(/\D/g, "");
  if (!str) return null;

  // Pad to 13 digits if it lost a single leading zero
  if (str.length === 12) {
    str = "0" + str;
  }

  return str;
}

export function sanitizeNcm(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str || null;
}

export function sanitizeUnidade(val: unknown): string {
  if (val === null || val === undefined) return "UN";
  const str = String(val).trim().toUpperCase();
  return str || "UN";
}

/**
 * Parses quantity strings or numbers, supporting Brazilian decimal commas.
 */
export function parseQuantity(val: unknown): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : NaN;
  }
  let str = String(val).trim();
  if (!str) return NaN;

  if (str.includes(",") && str.includes(".")) {
    const commaPos = str.lastIndexOf(",");
    const dotPos = str.lastIndexOf(".");
    if (commaPos > dotPos) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  } else if (str.includes(".")) {
    const parts = str.split(".");
    if (parts.length > 2) {
      str = str.replace(/\./g, "");
    }
  }

  const num = parseFloat(str);
  return Number.isFinite(num) ? num : NaN;
}

// ====================================================================
// 5. Main Model P7 File Parser Entry Point
// ====================================================================

/**
 * Parses a Model P7 inventory file (.xlsx, .xls, .csv).
 * Executes dynamic header scoring, delimiter sniffing, stop condition handling,
 * currency normalization, and row quarantine.
 */
export async function parseModelP7File(
  buffer: Buffer | Uint8Array,
  fileName: string
): Promise<P7ParseResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error("EMPTY_BUFFER: O buffer fornecido está vazio.");
  }

  const lowerName = fileName.toLowerCase();
  const isExcel =
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".ods");

  let rawRows: unknown[][] = [];
  const fileType: "xlsx" | "csv" | "xls" = lowerName.endsWith(".xls")
    ? "xls"
    : isExcel
    ? "xlsx"
    : "csv";
  let detectedDelimiter: string | undefined = undefined;
  let detectedEncoding: string | undefined = undefined;

  if (isExcel) {
    try {
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("EMPTY_WORKBOOK: A planilha fornecida não contém nenhuma aba.");
      }
      const sheet = wb.Sheets[firstSheetName];
      rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    } catch (err: any) {
      throw new Error(`CORRUPTED_FILE: Falha ao decodificar arquivo Excel: ${err?.message}`);
    }
  } else {
    // Delimited text (CSV)
    const { text, encoding } = transcodeBufferToString(buffer);
    detectedEncoding = encoding;
    detectedDelimiter = sniffCsvDelimiter(text);
    rawRows = parseCsvToRows(text, detectedDelimiter);
  }

  // Detect header row and establish column index map
  const { headerRowIndex, colMap, score } = detectP7Header(rawRows);

  if (score < 4 || headerRowIndex === -1) {
    throw new Error(
      "HEADER_NOT_FOUND: Cabeçalho do Modelo P7 não encontrado nas primeiras 100 linhas. O arquivo deve conter colunas para Código, Barras, Discriminação, Quantidade e Valor Unitário."
    );
  }

  const administrativeHeader = extractAdministrativeHeader(rawRows, headerRowIndex);

  const items: P7ProductItem[] = [];
  const quarantine: P7RowIssue[] = [];
  const seenCodes = new Set<string>();

  let consecutiveEmptyRows = 0;

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const rowNumber = r + 1; // 1-based physical row number

    // Check for empty row
    const isBlank =
      !row ||
      row.length === 0 ||
      row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");

    if (isBlank) {
      consecutiveEmptyRows++;
      if (consecutiveEmptyRows >= 3) {
        // 3 consecutive empty rows signals end of inventory table
        break;
      }
      continue;
    }
    consecutiveEmptyRows = 0;

    // Check stop condition (totals, closures, summary)
    if (isStopCondition(row, colMap)) {
      break;
    }

    // 1. Mandatory Field: Código
    const codigoRaw =
      colMap.codigo !== undefined ? String(row[colMap.codigo] ?? "").trim() : "";
    if (!codigoRaw) {
      quarantine.push({
        rowNumber,
        severity: "ERROR",
        code: "MISSING_CODE",
        reason: "[MISSING_CODE] Código do produto é obrigatório e não pode ser vazio.",
        rawContent: row.join("; "),
      });
      continue;
    }

    // 2. Mandatory Field: Discriminação
    const descRaw =
      colMap.discriminacao !== undefined
        ? String(row[colMap.discriminacao] ?? "").trim()
        : "";
    if (!descRaw || descRaw.length < 2) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        severity: "ERROR",
        code: "MISSING_DESCRIPTION",
        reason:
          "[MISSING_DESCRIPTION] Discriminação do produto é obrigatória e deve ter pelo menos 2 caracteres.",
        rawContent: row.join("; "),
      });
      continue;
    }

    // 3. Numerical Validation: Quantidade
    const qtdRaw = colMap.qtd !== undefined ? row[colMap.qtd] : null;
    const quantidade = parseQuantity(qtdRaw);
    if (Number.isNaN(quantidade)) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "ERROR",
        code: "INVALID_QUANTITY",
        reason: `[INVALID_QUANTITY] Quantidade inválida ou não numérica: '${qtdRaw}'`,
        rawContent: row.join("; "),
      });
      continue;
    }

    if (quantidade < 0) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "ERROR",
        code: "NEGATIVE_QUANTITY",
        reason: `[NEGATIVE_QUANTITY] Quantidade não pode ser negativa: ${quantidade}`,
        rawContent: row.join("; "),
      });
      continue;
    }

    if (quantidade === 0) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "WARNING",
        code: "ZERO_QUANTITY",
        reason: "[ZERO_QUANTITY] Produto com estoque zerado.",
      });
    }

    // 4. Numerical Validation: Preço Unitário (Centavos)
    const unitRaw = colMap.unitario !== undefined ? row[colMap.unitario] : null;
    let unitarioCentavos: number;
    try {
      unitarioCentavos = brlToCentavos(unitRaw as string | number);
    } catch {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "ERROR",
        code: "INVALID_UNIT_PRICE",
        reason: `[INVALID_UNIT_PRICE] Preço unitário inválido ou não numérico: '${unitRaw}'`,
        rawContent: row.join("; "),
      });
      continue;
    }

    if (unitarioCentavos < 0) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "ERROR",
        code: "NEGATIVE_PRICE",
        reason: `[NEGATIVE_PRICE] Preço unitário não pode ser negativo: ${unitarioCentavos}`,
        rawContent: row.join("; "),
      });
      continue;
    }

    if (unitarioCentavos === 0) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "WARNING",
        code: "ZERO_PRICE",
        reason: "[ZERO_PRICE] Preço unitário zerado (amostra grátis ou brinde).",
      });
    }

    // Calculate item total in integer cents with overflow guard
    let totalCentavos: number;
    try {
      totalCentavos = multiplyMoney(unitarioCentavos, quantidade);
    } catch {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "ERROR",
        code: "INVALID_QUANTITY",
        reason: `[INVALID_QUANTITY] Quantidade ou valor unitário excede o limite numérico seguro de cálculo: qtd='${qtdRaw}', unit='${unitRaw}'`,
        rawContent: row.join("; "),
      });
      continue;
    }

    // Cross-check against declared total column if present
    if (colMap.total !== undefined) {
      const declaredRaw = row[colMap.total];
      if (
        declaredRaw !== null &&
        declaredRaw !== undefined &&
        String(declaredRaw).trim() !== ""
      ) {
        try {
          const declaredCentavos = brlToCentavos(declaredRaw as string | number);
          if (Math.abs(totalCentavos - declaredCentavos) > 2) {
            quarantine.push({
              rowNumber,
              codigo: codigoRaw,
              discriminacao: descRaw,
              severity: "WARNING",
              code: "TOTAL_MISMATCH",
              reason: `[TOTAL_MISMATCH] Total declarado (${centavosToBRL(declaredCentavos)}) diverge do calculado Qtd * Unitário (${centavosToBRL(totalCentavos)}).`,
            });
          }
        } catch {
          // Non-blocking if declared total format cannot be parsed
        }
      }
    }

    // Sanitize Barcode
    const barrasRaw = colMap.barras !== undefined ? row[colMap.barras] : null;
    const barras = sanitizeBarcode(barrasRaw);
    if (!barras) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "WARNING",
        code: "MISSING_BARCODE",
        reason:
          "[MISSING_BARCODE] Código de barras ausente (comum para hortifruti, padaria e produtos a granel).",
      });
    }

    // Duplicate code detection
    if (seenCodes.has(codigoRaw)) {
      quarantine.push({
        rowNumber,
        codigo: codigoRaw,
        discriminacao: descRaw,
        severity: "WARNING",
        code: "DUPLICATE_CODE",
        reason: `[DUPLICATE_CODE] Código de produto duplicado no arquivo: '${codigoRaw}'`,
      });
    } else {
      seenCodes.add(codigoRaw);
    }

    const ncm = colMap.ncm !== undefined ? sanitizeNcm(row[colMap.ncm]) : null;
    const unidade =
      colMap.unidade !== undefined ? sanitizeUnidade(row[colMap.unidade]) : "UN";

    items.push({
      codigo: codigoRaw,
      barras,
      ncm,
      discriminacao: descRaw,
      unidade,
      quantidade,
      unitarioCentavos,
      totalCentavos,
      rowNumber,
    });
  }

  // Grand total calculation in integer cents with overflow guard
  let valorTotalGeralCentavos = 0;
  try {
    valorTotalGeralCentavos = items.reduce(
      (acc, item) => addMoney(acc, item.totalCentavos),
      0
    );
  } catch {
    valorTotalGeralCentavos = Number.MAX_SAFE_INTEGER;
    quarantine.push({
      rowNumber: 0,
      severity: "WARNING",
      code: "TOTAL_MISMATCH",
      reason:
        "[TOTAL_OVERFLOW] O valor total geral acumulado de itens válidos excede o limite numérico seguro (MAX_SAFE_INTEGER). Valor consolidado limitado ao teto seguro.",
    });
  }

  const warnings = quarantine.filter((q) => q.severity === "WARNING");

  return {
    administrativeHeader,
    headerRowIndex,
    items,
    quarantine,
    warnings,
    totalItensValidos: items.length,
    valorTotalGeralCentavos,
    fileName,
    fileType,
    delimiter: detectedDelimiter,
    encoding: detectedEncoding,
  };
}
