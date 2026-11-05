/**
 * Model P7 Inventory Parser - Adversarial Fuzzing & Stress Test Suite
 * Project: Dashboard Mercearia
 * Test Suite: tests/unit/parser-p7.adversarial.test.ts
 *
 * Empirical stress testing covering:
 * 1. Corrupted CSVs (unmatched quotes, trailing lines, random binary fuzzing, null bytes).
 * 2. Wild preambles (50 administrative lines before table header).
 * 3. Extreme numbers, monetary overflows (MAX_SAFE_INTEGER), malformed NCMs, missing barcodes, 0 prices.
 * 4. File extensions (uppercase .XLSX, .CSV, mixed case, unsupported).
 * 5. Crash prevention and graceful quarantine / error reporting.
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseModelP7File, P7ParseResult } from "@/modules/parser-p7";

describe("Model P7 Parser - Adversarial Stress & Fuzzing Suite", () => {
  // Helper to build a valid minimal P7 CSV string
  const validCsvHeader = "Código;Barras;Discriminação;Unidade;Qtd;Unitário;Total\n";
  const validCsvRow = "1001;7891001;Arroz Agulhinha 5kg;UN;10;25,00;250,00\n";

  // Helper to create an in-memory XLSX buffer
  function createXlsxBuffer(rows: unknown[][]): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  // ====================================================================
  // 1. Corrupted CSVs & Binary Fuzzing
  // ====================================================================
  describe("1. Corrupted CSVs and Binary Fuzzing", () => {
    it("1.1 should not crash on unmatched quotes in header line", async () => {
      const csv = 'Código;"Barras;Discriminação;Unidade;Qtd;Unitário;Total\n' + validCsvRow;
      const buffer = Buffer.from(csv, "utf-8");

      // An unmatched quote merges header into subsequent text; parser must throw HEADER_NOT_FOUND or handle gracefully
      await expect(parseModelP7File(buffer, "unmatched_header.csv")).rejects.toThrow(
        /HEADER_NOT_FOUND|cabeçalho/i
      );
    });

    it("1.2 should isolate row with unmatched quote in product description into quarantine without crashing", async () => {
      const csv =
        validCsvHeader +
        '1001;7891001;"Arroz com aspas quebrada;UN;10;25,00;250,00\n' +
        '1002;7891002;Feijão Preto 1kg;UN;20;8,50;170,00\n';
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "unmatched_row.csv");
      expect(result).toBeDefined();
      // The corrupted row should not crash the parser; it should be quarantined or parsed with sanitized cells
      expect(result.quarantine.length + result.items.length).toBeGreaterThan(0);
    });

    it("1.3 should not crash on unmatched quote at exact end of file", async () => {
      const csv = validCsvHeader + validCsvRow + '1002;7891002;"Feijão Sem Fechar';
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "unmatched_eof.csv");
      expect(result).toBeDefined();
      expect(result.items.some((i) => i.codigo === "1001")).toBe(true);
    });

    it("1.4 should gracefully reject 1KB and 10KB of random binary bytes as CSV without crashing", async () => {
      for (const size of [1024, 10240]) {
        const randomBytes = Buffer.alloc(size);
        for (let i = 0; i < size; i++) {
          randomBytes[i] = Math.floor(Math.random() * 256);
        }

        await expect(parseModelP7File(randomBytes, "random_fuzz.csv")).rejects.toThrow(
          /HEADER_NOT_FOUND|cabeçalho/i
        );
      }
    });

    it("1.5 should gracefully reject random binary bytes as .xlsx with descriptive error", async () => {
      const randomBytes = Buffer.from([0x00, 0x11, 0x22, 0xff, 0xaa, 0x55, 0x44, 0x33, 0x22, 0x11]);
      // Either XLSX rejects it (CORRUPTED_FILE) or header detector rejects it (HEADER_NOT_FOUND)
      await expect(parseModelP7File(randomBytes, "random_fuzz.xlsx")).rejects.toThrow(
        /CORRUPTED_FILE|HEADER_NOT_FOUND|cabeçalho/i
      );
    });

    it("1.6 should handle 100 trailing semicolons / empty lines without false positive items", async () => {
      let csv = validCsvHeader + validCsvRow;
      for (let i = 0; i < 50; i++) {
        csv += ";;;;;;;\n";
        csv += "\n";
      }
      const buffer = Buffer.from(csv, "utf-8");
      const result = await parseModelP7File(buffer, "trailing_lines.csv");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].codigo).toBe("1001");
    });

    it("1.7 should handle null bytes (\\0) inside fields without crashing", async () => {
      const csv =
        validCsvHeader +
        "1001;7891001;Arroz\0Especial\0;UN;10;25,00;250,00\n";
      const buffer = Buffer.from(csv, "utf-8");
      const result = await parseModelP7File(buffer, "null_bytes.csv");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].codigo).toBe("1001");
    });

    it("1.8 should handle extremely long line (50,000 characters) without crashing", async () => {
      const hugeDescription = "A".repeat(50000);
      const csv =
        validCsvHeader +
        `1001;7891001;${hugeDescription};UN;10;25,00;250,00\n`;
      const buffer = Buffer.from(csv, "utf-8");
      const result = await parseModelP7File(buffer, "huge_line.csv");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].discriminacao.length).toBe(50000);
    });
  });

  // ====================================================================
  // 2. Wild Preambles (50 administrative lines before table header)
  // ====================================================================
  describe("2. Wild Preambles (50 Administrative Lines)", () => {
    it("2.1 CSV with 50 administrative preamble lines: successfully detects header up to 100 lines", async () => {
      let csv = "";
      csv += "Razão Social: Mercearia Teste Ltda\n";
      csv += "CNPJ: 12.345.678/0001-90\n";
      csv += "Data: 31/12/2025\n";
      csv += "Termo de Abertura do Livro Modelo P7\n";
      for (let i = 5; i <= 50; i++) {
        csv += `Linha administrativa de auditoria interna numero ${i} com dados diversos\n`;
      }
      csv += validCsvHeader;
      csv += validCsvRow;

      const buffer = Buffer.from(csv, "utf-8");
      const result = await parseModelP7File(buffer, "preambulo_50_linhas.csv");

      expect(result.headerRowIndex).toBe(50);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].codigo).toBe("1001");
    });

    it("2.2 XLSX with 50 administrative preamble lines: successfully detects header up to 100 lines", async () => {
      const rows: unknown[][] = [];
      rows.push(["Razão Social: Supermercado Fartura Ltda"]);
      rows.push(["CNPJ: 98.765.432/0001-10"]);
      rows.push(["Data do Inventário: 01/01/2026"]);
      for (let i = 4; i <= 50; i++) {
        rows.push([`Linha administrativa ${i}: Normas da Portaria SEFAZ nº ${i * 12}`]);
      }
      rows.push(["Código", "Barras", "Discriminação", "Unidade", "Qtd", "Unitário", "Total"]);
      rows.push(["5001", "7895001000015", "Azeite de Oliva Extra Virgem 500ml", "UN", 30, "32,90", "987,00"]);

      const buffer = createXlsxBuffer(rows);
      const result = await parseModelP7File(buffer, "preambulo_50_linhas.xlsx");

      expect(result.headerRowIndex).toBe(50);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].codigo).toBe("5001");
    });
  });

  // ====================================================================
  // 3. Extreme Numbers, Malformed NCMs, Missing Barcodes, 0 Prices
  // ====================================================================
  describe("3. Extreme Numbers & Value Edge Cases", () => {
    it("3.1 should gracefully quarantine row on extreme quantity overflow without crashing", async () => {
      // Valid item 1, then overflowing item 2, then valid item 3
      const csv =
        validCsvHeader +
        "1001;7891001;Item Normal 1;UN;10;10,00;100,00\n" +
        "1002;7891002;Item Hiper Galático;UN;100000000000000;100,00;0,00\n" +
        "1003;7891003;Item Normal 3;UN;5;20,00;100,00\n";
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "overflow_qty.csv");
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.codigo)).toEqual(["1001", "1003"]);
      expect(
        result.quarantine.some(
          (q) => q.codigo === "1002" && q.code === "INVALID_QUANTITY" && q.severity === "ERROR"
        )
      ).toBe(true);
    });

    it("3.2 should not crash on astronomical unit price string, isolating row in quarantine", async () => {
      const csv =
        validCsvHeader +
        "1001;7891001;Diamante Raro;UN;1;999999999999999999999999,99;0,00\n";
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "astronomical_price.csv");
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(0);
      expect(result.quarantine.some((q) => q.code === "INVALID_UNIT_PRICE")).toBe(true);
    });

    it("3.3 should accept missing barcodes (produce/bulk items) with WARNING in quarantine", async () => {
      const csv =
        validCsvHeader +
        "2001;;Banana Prata Climatizada;KG;50;5,99;299,50\n" +
        "2002;SEM GTIN;Maçã Gala Nacional;KG;30;8,99;269,70\n" +
        "2003;SEM EAN;Laranja Pêra Rio;KG;40;3,49;139,60\n";
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "missing_barcodes.csv");
      expect(result.items).toHaveLength(3);
      expect(result.items.every((i) => i.barras === null)).toBe(true);
      expect(result.quarantine.filter((q) => q.code === "MISSING_BARCODE")).toHaveLength(3);
    });

    it("3.4 should accept zero unit price with ZERO_PRICE warning in quarantine", async () => {
      const csv =
        validCsvHeader +
        "3001;7893001;Amostra Grátis Sachê Café;UN;100;0,00;0,00\n" +
        "3002;7893002;Brinde Promocional Caneta;UN;50;0;0\n";
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "zero_prices.csv");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].unitarioCentavos).toBe(0);
      expect(result.items[0].totalCentavos).toBe(0);
      expect(result.quarantine.filter((q) => q.code === "ZERO_PRICE")).toHaveLength(2);
    });

    it("3.5 should accept zero stock quantity with ZERO_QUANTITY warning in quarantine", async () => {
      const csv =
        validCsvHeader +
        "4001;7894001;Produto Esgotado;UN;0;15,90;0,00\n";
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "zero_qty.csv");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantidade).toBe(0);
      expect(result.quarantine.some((q) => q.code === "ZERO_QUANTITY")).toBe(true);
    });

    it("3.6 should quarantine negative quantity and negative unit price as ERROR", async () => {
      const csv =
        validCsvHeader +
        "5001;7895001;Item Quantidade Negativa;UN;-5;10,00;0,00\n" +
        "5002;7895002;Item Preco Negativo;UN;5;-10,00;0,00\n";
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "negatives.csv");
      expect(result.items).toHaveLength(0);
      expect(result.quarantine.some((q) => q.code === "NEGATIVE_QUANTITY")).toBe(true);
      expect(result.quarantine.some((q) => q.code === "NEGATIVE_PRICE")).toBe(true);
    });

    it("3.7 should tolerate malformed NCMs without throwing errors or corrupting items", async () => {
      const csvWithNcm =
        "Código;Barras;NCM;Discriminação;Unidade;Qtd;Unitário;Total\n" +
        "6001;7896001;INVALIDO-NCM-!@#;Item NCM Estranho;UN;10;12,00;120,00\n" +
        "6002;7896002;;Item Sem NCM;UN;5;20,00;100,00\n";
      const buffer = Buffer.from(csvWithNcm, "utf-8");

      const result = await parseModelP7File(buffer, "malformed_ncms.csv");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].ncm).toBe("INVALIDO-NCM-!@#");
      expect(result.items[1].ncm).toBeNull();
    });

    it("3.8 should safely guard and cap at MAX_SAFE_INTEGER when Grand Total accumulation overflows", async () => {
      const csv =
        validCsvHeader +
        "7001;7897001;Item Mega 1;UN;50000000;1000000,00;0,00\n" +
        "7002;7897002;Item Mega 2;UN;50000000;1000000,00;0,00\n";
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "grand_total_overflow.csv");
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(2);
      expect(result.valorTotalGeralCentavos).toBe(Number.MAX_SAFE_INTEGER);
      expect(
        result.warnings?.some((w) => w.reason.includes("[TOTAL_OVERFLOW]"))
      ).toBe(true);
    });
  });

  // ====================================================================
  // 4. Boundary Tests: Header Scan Row 25 (Index 24) vs Row 26 (Index 25)
  // ====================================================================
  describe("4. Header Scan Window Boundary", () => {
    it("4.1 should successfully detect header at row 25 (index 24)", async () => {
      let csv = "";
      for (let i = 1; i <= 24; i++) {
        csv += `Preamble row ${i}\n`;
      }
      csv += validCsvHeader; // This is row 25 (index 24)
      csv += validCsvRow;
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "header_row_25.csv");
      expect(result.headerRowIndex).toBe(24);
      expect(result.items).toHaveLength(1);
    });

    it("4.2 should successfully detect header at row 26 (index 25) with expanded window", async () => {
      let csv = "";
      for (let i = 1; i <= 25; i++) {
        csv += `Preamble row ${i}\n`;
      }
      csv += validCsvHeader; // row 26 (index 25)
      csv += validCsvRow;
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "header_row_26.csv");
      expect(result.headerRowIndex).toBe(25);
      expect(result.items).toHaveLength(1);
    });

    it("4.3 fails with HEADER_NOT_FOUND if header is at row 101 (index 100, 1 row beyond 100 maxScan limit)", async () => {
      let csv = "";
      for (let i = 1; i <= 100; i++) {
        csv += `Preamble row ${i}\n`;
      }
      csv += validCsvHeader; // row 101 (index 100)
      csv += validCsvRow;
      const buffer = Buffer.from(csv, "utf-8");

      await expect(parseModelP7File(buffer, "header_row_101.csv")).rejects.toThrow(
        /HEADER_NOT_FOUND|primeiras 100 linhas/i
      );
    });
  });

  // ====================================================================
  // 4. File Extensions (Uppercase .XLSX, .CSV, mixed case, weird names)
  // ====================================================================
  describe("4. File Extension Handling", () => {
    it("4.1 should correctly parse uppercase .CSV extension", async () => {
      const csv = validCsvHeader + validCsvRow;
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseModelP7File(buffer, "INVENTARIO_2025.CSV");
      expect(result.fileType).toBe("csv");
      expect(result.items).toHaveLength(1);
    });

    it("4.2 should correctly parse uppercase .XLSX extension", async () => {
      const rows = [
        ["Código", "Barras", "Discriminação", "Unidade", "Qtd", "Unitário", "Total"],
        ["1001", "7891001", "Arroz 5kg", "UN", 10, "25,00", "250,00"],
      ];
      const buffer = createXlsxBuffer(rows);

      const result = await parseModelP7File(buffer, "PLANILHA_FECHAMENTO.XLSX");
      expect(result.fileType).toBe("xlsx");
      expect(result.items).toHaveLength(1);
    });

    it("4.3 should correctly parse mixed-case extensions (.Xlsx, .Csv, .Xls)", async () => {
      const rows = [
        ["Código", "Barras", "Discriminação", "Unidade", "Qtd", "Unitário", "Total"],
        ["1001", "7891001", "Arroz 5kg", "UN", 10, "25,00", "250,00"],
      ];
      const xlsxBuffer = createXlsxBuffer(rows);
      const csvBuffer = Buffer.from(validCsvHeader + validCsvRow, "utf-8");

      const resXlsx = await parseModelP7File(xlsxBuffer, "MeuArquivo.XlsX");
      expect(resXlsx.fileType).toBe("xlsx");
      expect(resXlsx.items).toHaveLength(1);

      const resCsv = await parseModelP7File(csvBuffer, "MeuArquivo.CsV");
      expect(resCsv.fileType).toBe("csv");
      expect(resCsv.items).toHaveLength(1);
    });
  });
});
