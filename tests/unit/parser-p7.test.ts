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
