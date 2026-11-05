import * as XLSX from "xlsx";

export interface P7FixtureRow {
  codigo: string;
  barras?: string | null;
  ncm?: string | null;
  discriminacao: string;
  unidade?: string;
  quantidade: number;
  unitario: number | string; // e.g. 5.50 or "5,50" or "R$ 5,50"
  total?: number | string;
}

export interface P7FixtureOptions {
  administrativePreamble?: string[];
  includeSummaryRow?: boolean;
  totalGeralValue?: number | string;
  delimiter?: ";" | "," | "\t";
  encoding?: "utf-8" | "latin1";
}

/**
 * Generates a realistic Brazilian Model P7 spreadsheet in .xlsx format as a Buffer.
 */
export function generateModelP7Xlsx(
  items: P7FixtureRow[],
  options: P7FixtureOptions = {}
): Buffer {
  const preamble = options.administrativePreamble ?? [
    "LIVRO REGISTRO DE INVENTÁRIO - MODELO P7",
    "RAZÃO SOCIAL: MERCEARIA BOM PREÇO LTDA",
    "CNPJ: 12.345.678/0001-90",
    "DATA DO INVENTÁRIO: 31/12/2025",
    "",
  ];

  const headerRow = [
    "Código",
    "Barras",
    "NCM",
    "Discriminação",
    "Unid",
    "Qtd",
    "Unitário",
    "Total",
  ];

  const dataRows = items.map((it) => {
    const qtd = it.quantidade;
    const unitarioNum =
      typeof it.unitario === "number"
        ? it.unitario
        : parseFloat(
            it.unitario.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()
          );
    const totalNum =
      it.total !== undefined
        ? typeof it.total === "number"
          ? it.total
          : parseFloat(
              it.total.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()
            )
        : qtd * unitarioNum;

    return [
      it.codigo,
      it.barras ?? "",
      it.ncm ?? "",
      it.discriminacao,
      it.unidade ?? "UN",
      it.quantidade,
      typeof it.unitario === "string" ? it.unitario : unitarioNum.toFixed(2).replace(".", ","),
      typeof it.total === "string" ? it.total : totalNum.toFixed(2).replace(".", ","),
    ];
  });

  const allRows: (string | number)[][] = [];

  // Preamble lines (first column)
  for (const line of preamble) {
    allRows.push([line]);
  }

  // Header row
  allRows.push(headerRow);

  // Data rows
  for (const r of dataRows) {
    allRows.push(r);
  }

  // Optional summary row
  if (options.includeSummaryRow !== false) {
    allRows.push([
      "TOTAL GERAL",
      "",
      "",
      "",
      "",
      "",
      "",
      options.totalGeralValue !== undefined
        ? String(options.totalGeralValue)
        : "R$ 99.999,99",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventário P7");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Generates a realistic Model P7 CSV file buffer with specified delimiter and encoding.
 */
export function generateModelP7Csv(
  items: P7FixtureRow[],
  options: P7FixtureOptions = {}
): Buffer {
  const delim = options.delimiter ?? ";";
  const encoding = options.encoding ?? "utf-8";

  const preamble = options.administrativePreamble ?? [
    "LIVRO REGISTRO DE INVENTÁRIO - MODELO P7",
    "RAZÃO SOCIAL: MERCEARIA BOM PREÇO LTDA",
    "CNPJ: 12.345.678/0001-90",
    "DATA DO INVENTÁRIO: 31/12/2025",
    "",
  ];

  const headerRow = [
    "Código",
    "Barras",
    "NCM",
    "Discriminação",
    "Unid",
    "Qtd",
    "Unitário",
    "Total",
  ];

  const lines: string[] = [];

  for (const p of preamble) {
    lines.push(p);
  }

  lines.push(headerRow.join(delim));

  for (const it of items) {
    const qtd = it.quantidade;
    const unitarioStr =
      typeof it.unitario === "string"
        ? it.unitario
        : it.unitario.toFixed(2).replace(".", ",");
    const totalStr =
      it.total !== undefined
        ? typeof it.total === "string"
          ? it.total
          : it.total.toFixed(2).replace(".", ",")
        : (qtd * (typeof it.unitario === "number" ? it.unitario : 0))
            .toFixed(2)
            .replace(".", ",");

    lines.push(
      [
        it.codigo,
        it.barras ?? "",
        it.ncm ?? "",
        `"${it.discriminacao.replace(/"/g, '""')}"`,
        it.unidade ?? "UN",
        it.quantidade,
        unitarioStr,
        totalStr,
      ].join(delim)
    );
  }

  if (options.includeSummaryRow !== false) {
    lines.push(
      [
        "TOTAL GERAL",
        "",
        "",
        "",
        "",
        "",
        "",
        options.totalGeralValue ? String(options.totalGeralValue) : "R$ 99.999,99",
      ].join(delim)
    );
  }

  const content = lines.join("\r\n");

  if (encoding === "latin1") {
    return Buffer.from(content, "latin1");
  }
  return Buffer.from(content, "utf-8");
}
