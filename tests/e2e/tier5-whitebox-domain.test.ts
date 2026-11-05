/**
 * E2E Tier 5: White-Box Adversarial Domain Hardening
 * Project: Dashboard Mercearia
 * Test Suite: tests/e2e/tier5-whitebox-domain.test.ts
 *
 * Exhaustive white-box branch coverage, boundary stress testing, and concurrency
 * resilience for core domain modules:
 * 1. Currency & Precision Monetary Engine (`src/modules/currency`)
 * 2. Model P7 Parser & Delimiter Sniffer (`src/modules/parser-p7`)
 * 3. Intelligent Deduction Engine & SLA Fallbacks (`src/modules/baixa-inteligente`)
 * 4. Atomic Transactions, Concurrency & Audit Immutability (`src/modules/transacoes`)
 * 5. Financial Consolidation, DRE & SQL Injection Immunity (`src/modules/financeiro`)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "@/lib/prisma";
import {
  brlToCentavos,
  centavosToBRL,
  formatDecimalBRL,
  addMoney,
  subtractMoney,
  multiplyMoney,
} from "@/modules/currency";
import {
  parseModelP7File,
  detectP7Header,
  sniffCsvDelimiter,
  parseCsvToRows,
  extractAdministrativeHeader,
  isStopCondition,
  sanitizeBarcode,
  parseQuantity,
  transcodeBufferToString,
} from "@/modules/parser-p7";
import {
  findDeductionSuggestion,
  filterActiveStock,
  buildAssistedCatalog,
} from "@/modules/baixa-inteligente/engine";
import {
  executeDeductionTransaction,
  getTransactionAuditTrail,
  getProductAuditHistory,
  DeductionValidationError,
  ProductNotFoundError,
  ProductInactiveError,
  InsufficientStockError,
  ConcurrencyConflictError,
} from "@/modules/transacoes";
import {
  getDailySales,
  getDailySalesRange,
  getMonthlyConsolidation,
  getDetailedMonthlyConsolidation,
} from "@/modules/financeiro";
import { cleanTestData } from "./helpers/test-database";

describe("E2E Tier 5: White-Box Adversarial Domain Hardening", () => {
  const TEST_PREFIX = "E2E-T5-";
  const trackedProductIds: string[] = [];
  const trackedLancamentoIds: string[] = [];
  const trackedHistoricoIds: string[] = [];
  const trackedDespesaIds: string[] = [];

  const cleanupAll = async () => {
    try {
      if (trackedHistoricoIds.length > 0) {
        await prisma.historicoBaixa.deleteMany({
          where: { id: { in: trackedHistoricoIds } },
        });
      }
      await prisma.historicoBaixa.deleteMany({
        where: {
          OR: [
            { codigoProduto: { startsWith: TEST_PREFIX } },
            { discriminacaoProduto: { contains: "[TEST-T5]" } },
          ],
        },
      });

      if (trackedLancamentoIds.length > 0) {
        await prisma.lancamentoDiario.deleteMany({
          where: { id: { in: trackedLancamentoIds } },
        });
      }
      await prisma.lancamentoDiario.deleteMany({
        where: {
          OR: [
            { data: { startsWith: "2099-05-" } },
            { observacoes: { contains: "[TEST-T5]" } },
          ],
        },
      });

      if (trackedDespesaIds.length > 0) {
        await prisma.despesaMensal.deleteMany({
          where: { id: { in: trackedDespesaIds } },
        });
      }
      await prisma.despesaMensal.deleteMany({
        where: {
          OR: [
            { mesAno: { startsWith: "2099-" } },
            { descricao: { contains: "[TEST-T5]" } },
          ],
        },
      });

      if (trackedProductIds.length > 0) {
        await prisma.produtoEstoque.deleteMany({
          where: { id: { in: trackedProductIds } },
        });
      }
      await prisma.produtoEstoque.deleteMany({
        where: {
          OR: [
            { codigo: { startsWith: TEST_PREFIX } },
            { discriminacao: { contains: "[TEST-T5]" } },
          ],
        },
      });

      await cleanTestData(TEST_PREFIX);
    } catch (e) {
      console.warn("Tier 5 cleanup notice:", e);
    }
  };

  beforeAll(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  // =========================================================================
  // DOMAIN 1: Currency & Precision Monetary Engine
  // =========================================================================
  describe("Domain 1: Currency & Precision Monetary Engine White-Box Hardening", () => {
    it("W1-CURR-01: handles MAX_SAFE_INTEGER boundary arithmetic and detects overflow", () => {
      const maxSafe = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991

      // Exact safe addition
      expect(addMoney(maxSafe - 100, 100)).toBe(maxSafe);
      expect(addMoney(maxSafe - 500, 250)).toBe(maxSafe - 250);

      // Overflow detection beyond MAX_SAFE_INTEGER
      expect(() => addMoney(maxSafe, 1)).toThrow(RangeError);
      expect(() => addMoney(maxSafe - 10, 11)).toThrow(RangeError);

      // Subtraction underflow beyond -MAX_SAFE_INTEGER
      expect(subtractMoney(-maxSafe + 100, 100)).toBe(-maxSafe);
      expect(() => subtractMoney(-maxSafe, 1)).toThrow(RangeError);

      // Multiplication overflow
      expect(() => multiplyMoney(maxSafe, 2)).toThrow(RangeError);
      expect(() => multiplyMoney(Math.floor(maxSafe / 2) + 1, 2)).toThrow(RangeError);
    });

    it("W1-CURR-02: strictly rejects non-safe integers, NaN, Infinity, and non-numeric types", () => {
      // brlToCentavos
      expect(() => brlToCentavos(NaN)).toThrow(RangeError);
      expect(() => brlToCentavos(Infinity)).toThrow(RangeError);
      expect(() => brlToCentavos(-Infinity)).toThrow(RangeError);
      expect(() => brlToCentavos(true as any)).toThrow(TypeError);
      expect(() => brlToCentavos({} as any)).toThrow(TypeError);
      expect(() => brlToCentavos([123] as any)).toThrow(TypeError);

      // centavosToBRL
      expect(() => centavosToBRL(12.34)).toThrow(TypeError);
      expect(() => centavosToBRL(NaN)).toThrow(TypeError);
      expect(() => centavosToBRL(Infinity)).toThrow(TypeError);
      expect(() => centavosToBRL(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);

      // formatDecimalBRL
      expect(() => formatDecimalBRL(12.34)).toThrow(TypeError);
      expect(() => formatDecimalBRL(NaN)).toThrow(TypeError);

      // addMoney & subtractMoney
      expect(() => addMoney(10.5, 20)).toThrow(TypeError);
      expect(() => addMoney(10, 20.5)).toThrow(TypeError);
      expect(() => subtractMoney(10.5, 20)).toThrow(TypeError);
      expect(() => subtractMoney(10, 20.5)).toThrow(TypeError);

      // multiplyMoney
      expect(() => multiplyMoney(10.5, 2)).toThrow(TypeError);
      expect(() => multiplyMoney(100, NaN)).toThrow(TypeError);
      expect(() => multiplyMoney(100, Infinity)).toThrow(TypeError);
    });

    it("W1-CURR-03: handles complex adversarial formatting, non-breaking spaces, and invalid signs", () => {
      // Non-breaking space \u00A0
      expect(brlToCentavos("R$\u00A01.234,56")).toBe(123456);
      expect(brlToCentavos("1.234,56\u00A0BRL")).toBe(123456);

      // Accounting parentheses format
      expect(brlToCentavos("(R$ 1.234,56)")).toBe(-123456);
      expect(brlToCentavos("(1234,56)")).toBe(-123456);
      expect(brlToCentavos("(0,50)")).toBe(-50);

      // Parentheses with invalid inner signs
      expect(() => brlToCentavos("(R$ +1.234,56)")).toThrow(TypeError);
      expect(() => brlToCentavos("(R$ -1.234,56)")).toThrow(TypeError);

      // Multiple signs
      expect(() => brlToCentavos("++1234,56")).toThrow(TypeError);
      expect(() => brlToCentavos("--1234,56")).toThrow(TypeError);
      expect(() => brlToCentavos("+-1234,56")).toThrow(TypeError);

      // Misplaced signs
      expect(() => brlToCentavos("1234,56-")).toThrow(TypeError);
      expect(() => brlToCentavos("1234,56+")).toThrow(TypeError);
      expect(() => brlToCentavos("12-34,56")).toThrow(TypeError);

      // Valid leading signs with currency symbols
      expect(brlToCentavos("R$ -1.234,56")).toBe(-123456);
      expect(brlToCentavos("BRL +50,00")).toBe(5000);
      expect(brlToCentavos("$ -0,05")).toBe(-5);

      // Bare currency symbol or non-numeric tokens
      expect(() => brlToCentavos("R$")).toThrow(TypeError);
      expect(() => brlToCentavos("BRL")).toThrow(TypeError);
      expect(() => brlToCentavos("R$ 1234,56 ABC")).toThrow(TypeError);
      expect(() => brlToCentavos("12.34.56,78 #")).toThrow(TypeError);
    });

    it("W1-CURR-04: validates thousand separators against malformed chunk lengths", () => {
      // Valid Brazilian (periods for thousands, single comma for decimal)
      expect(brlToCentavos("1.234.567,89")).toBe(123456789);

      // Malformed Brazilian thousand chunks (must have exactly 3 digits between dots)
      expect(() => brlToCentavos("1.23.456,78")).toThrow(TypeError);
      expect(() => brlToCentavos("1.2345.678,90")).toThrow(TypeError);

      // Valid International (commas for thousands, single dot for decimal)
      expect(brlToCentavos("1,234,567.89")).toBe(123456789);

      // Malformed International thousand chunks
      expect(() => brlToCentavos("1,23,456.78")).toThrow(TypeError);
      expect(() => brlToCentavos("1,2345,678.90")).toThrow(TypeError);

      // Comma-only with valid vs invalid thousand chunks
      expect(brlToCentavos("1,234,567")).toBe(123456700);
      expect(() => brlToCentavos("1,23,456")).toThrow(TypeError);

      // Dot-only with valid vs invalid thousand chunks
      expect(brlToCentavos("1.234.567")).toBe(123456700);
      expect(() => brlToCentavos("1.23.456")).toThrow(TypeError);

      // Fractions without leading integer digit
      expect(brlToCentavos(",50")).toBe(50);
      expect(brlToCentavos(".75")).toBe(75);
    });

    it("W1-CURR-05: verifies precision formatting, negative currency representation, and half-up rounding", () => {
      // Negative numbers in formatters
      expect(centavosToBRL(-123456)).toBe("-R$ 1.234,56");
      expect(centavosToBRL(-5)).toBe("-R$ 0,05");
      expect(centavosToBRL(0)).toBe("R$ 0,00");
      expect(formatDecimalBRL(-123456)).toBe("-1234,56");
      expect(formatDecimalBRL(-5)).toBe("-0,05");
      expect(formatDecimalBRL(0)).toBe("0,00");

      // 3+ decimal digits half-up rounding in brlToCentavos
      expect(brlToCentavos("10,124")).toBe(1012); // 4 rounds down
      expect(brlToCentavos("10,125")).toBe(1013); // 5 rounds up
      expect(brlToCentavos("10,126")).toBe(1013); // 6 rounds up

      // Fractional quantity multiplication and zero sign normalization
      expect(multiplyMoney(101, 0.5)).toBe(51); // 50.5 rounds up to 51
      expect(multiplyMoney(103, 0.5)).toBe(52); // 51.5 rounds up to 52
      const zeroResult = multiplyMoney(-100, 0);
      expect(zeroResult).toBe(0);
      expect(Object.is(zeroResult, -0)).toBe(false); // Eliminates JavaScript -0
    });
  });

  // =========================================================================
  // DOMAIN 2: Model P7 Parser & Delimiter Sniffer
  // =========================================================================
  describe("Domain 2: Model P7 Parser White-Box Hardening", () => {
    it("W2-P7-01: sniffs and parses CSV with pipes (|), tabs (\t), semicolons (;), and commas (,)", () => {
      // Pipe delimiter sniffing and parsing
      const pipeCsv = [
        "Razao Social: Teste Mercearia Ltda",
        "CNPJ: 12.345.678/0001-90",
        "Codigo|Barras|Discriminacao|Qtd|Unitario",
        "P1|7891234567890|Arroz 5kg|10|25,50",
        "P2|7891234567891|Feijao 1kg|20|8,90",
      ].join("\n");

      expect(sniffCsvDelimiter(pipeCsv)).toBe("|");
      const pipeRows = parseCsvToRows(pipeCsv, "|");
      expect(pipeRows.length).toBe(5);
      expect(pipeRows[2]).toEqual(["Codigo", "Barras", "Discriminacao", "Qtd", "Unitario"]);

      // Tab delimiter sniffing and parsing
      const tabCsv = [
        "Razao Social: Mercearia Teste Tab",
        "Codigo\tBarras\tDiscriminacao\tQtd\tUnitario",
        "T1\t789000000001\tAcucar 1kg\t15\t4,50",
      ].join("\n");

      expect(sniffCsvDelimiter(tabCsv)).toBe("\t");
      const tabRows = parseCsvToRows(tabCsv, "\t");
      expect(tabRows[1]).toEqual(["Codigo", "Barras", "Discriminacao", "Qtd", "Unitario"]);

      // Semicolon with quoted delimiter and escaped quotes RFC-4180
      const complexCsv = [
        'Codigo;Discriminacao;Qtd;Unitario;Barras',
        'C1;"Biscoito; Sabor ""Chocolate"" Premium";5;7,80;7891112223334',
      ].join("\n");

      const parsedComplex = parseCsvToRows(complexCsv, ";");
      expect(parsedComplex[1][1]).toBe('Biscoito; Sabor "Chocolate" Premium');
    });

    it("W2-P7-02: dynamic header scoring, tie-breaking, and threshold enforcement", async () => {
      // Candidate row with only 3 anchors (insufficient) followed by row with 5 anchors
      const rawRows = [
        ["Livro Registro de Inventário Modelo P7"],
        ["Razão Social: Empório Alfa", "CNPJ: 98.765.432/0001-10", "Data: 31/12/2025"],
        ["Codigo", "Qtd", "Unitario"], // Score = 3 (needs >= 4)
        ["Codigo", "Barras", "Discriminacao", "Qtd", "Unitario", "Total"], // Score = 5
        ["ITEM-1", "789111", "Produto Alfa", "10", "5,00", "50,00"],
      ];

      const detection = detectP7Header(rawRows);
      expect(detection.score).toBe(5);
      expect(detection.headerRowIndex).toBe(3);
      expect(detection.colMap.codigo).toBe(0);
      expect(detection.colMap.barras).toBe(1);
      expect(detection.colMap.discriminacao).toBe(2);
      expect(detection.colMap.qtd).toBe(3);
      expect(detection.colMap.unitario).toBe(4);

      // File where no row satisfies score >= 4 -> throws HEADER_NOT_FOUND
      const invalidHeaderCsv = Buffer.from("Nome;Telefone;Endereco\nFulano;123;Rua A\n", "utf-8");
      await expect(parseModelP7File(invalidHeaderCsv, "sem_cabecalho.csv")).rejects.toThrow(
        /HEADER_NOT_FOUND/
      );

      // Empty buffer -> throws EMPTY_BUFFER
      await expect(parseModelP7File(Buffer.alloc(0), "vazio.csv")).rejects.toThrow(
        /EMPTY_BUFFER/
      );
    });

    it("W2-P7-03: extracts administrative preamble: CNPJ 14 digits unformatted, Data, and Razao Social", () => {
      const rows = [
        ["TERMO DE ABERTURA - LIVRO INVENTARIO"],
        ["EMPRESA: DISTRIBUIDORA DE ALIMENTOS PAULISTA"],
        ["CNPJ: 11222333000199"], // Unformatted 14 digits
        ["DATA DO INVENTARIO: 2026-12-31"],
        ["Codigo", "Barras", "Discriminacao", "Qtd", "Unitario"],
      ];

      const admin = extractAdministrativeHeader(rows, 4);
      expect(admin.cnpj).toBe("11222333000199");
      expect(admin.razaoSocial).toContain("DISTRIBUIDORA DE ALIMENTOS PAULISTA");
      expect(admin.dataInventario).toBe("2026-12-31");
    });

    it("W2-P7-04: extreme row quarantine coverage across all validation branches", async () => {
      const csvContent = [
        "Razao Social: Padaria Teste",
        "Codigo;Barras;Discriminacao;Qtd;Unitario;Total",
        ";789001;Item Sem Codigo;10;5,00;50,00", // MISSING_CODE
        "Q2;789002;X;10;5,00;50,00", // MISSING_DESCRIPTION (< 2 chars)
        "Q3;789003;Qtd Invalida;dez;5,00;50,00", // INVALID_QUANTITY
        "Q4;789004;Qtd Negativa;-3;5,00;-15,00", // NEGATIVE_QUANTITY
        "Q5;789005;Qtd Zero;0;5,00;0,00", // ZERO_QUANTITY (warning)
        "Q6;789006;Preco Invalido;10;caro;50,00", // INVALID_UNIT_PRICE
        "Q7;789007;Preco Negativo;10;-5,00;-50,00", // NEGATIVE_PRICE
        "Q8;789008;Preco Zero;10;0,00;0,00", // ZERO_PRICE (warning)
        "Q9;789009;Divergencia Total;10;5,00;999,00", // TOTAL_MISMATCH (warning)
        "Q10;;Sem Codigo de Barras;10;5,00;50,00", // MISSING_BARCODE (warning)
        "Q11;789011;Item Valido Original;10;5,00;50,00",
        "Q11;789011;Item Codigo Duplicado;5;5,00;25,00", // DUPLICATE_CODE (warning)
      ].join("\n");

      const result = await parseModelP7File(Buffer.from(csvContent, "utf-8"), "quarentena.csv");

      // Verify quarantine issues
      const issueCodes = result.quarantine.map((q) => q.code);
      expect(issueCodes).toContain("MISSING_CODE");
      expect(issueCodes).toContain("MISSING_DESCRIPTION");
      expect(issueCodes).toContain("INVALID_QUANTITY");
      expect(issueCodes).toContain("NEGATIVE_QUANTITY");
      expect(issueCodes).toContain("ZERO_QUANTITY");
      expect(issueCodes).toContain("INVALID_UNIT_PRICE");
      expect(issueCodes).toContain("NEGATIVE_PRICE");
      expect(issueCodes).toContain("ZERO_PRICE");
      expect(issueCodes).toContain("TOTAL_MISMATCH");
      expect(issueCodes).toContain("MISSING_BARCODE");
      expect(issueCodes).toContain("DUPLICATE_CODE");

      // Valid items that passed through (including warning items)
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.some((i) => i.codigo === "Q11")).toBe(true);
    });

    it("W2-P7-05: terminates parsing on table stop conditions and 3 consecutive blank rows", async () => {
      const csvWithStop = [
        "Codigo;Barras;Discriminacao;Qtd;Unitario",
        "P1;7891;Item Antes Stop 1;10;5,00",
        "P2;7892;Item Antes Stop 2;5;10,00",
        "TOTAL GERAL;;;15;100,00", // Stop condition
        "P3;7893;Item Depois Stop (deve ignorar);20;15,00",
      ].join("\n");

      const resultStop = await parseModelP7File(Buffer.from(csvWithStop, "utf-8"), "stop_condition.csv");
      expect(resultStop.items.length).toBe(2);
      expect(resultStop.items.map((i) => i.codigo)).toEqual(["P1", "P2"]);

      // 3 consecutive empty rows stop condition
      const csvWithEmptyRows = [
        "Codigo;Barras;Discriminacao;Qtd;Unitario",
        "E1;7891;Item Normal 1;10;5,00",
        "",
        "",
        "", // 3 blank rows
        "E2;7892;Item Apos Blank (ignorado);5;10,00",
      ].join("\n");

      const resultEmpty = await parseModelP7File(Buffer.from(csvWithEmptyRows, "utf-8"), "empty_rows.csv");
      expect(resultEmpty.items.length).toBe(1);
      expect(resultEmpty.items[0].codigo).toBe("E1");
    });

    it("W2-P7-06: numerical boundary protection against calculation overflow in single row and grand total", async () => {
      // Calculation overflow in single row (e.g. qty * unit exceeds MAX_SAFE_INTEGER)
      const bigQtyCsv = [
        "Codigo;Barras;Discriminacao;Qtd;Unitario",
        "BIG;789999;Item Gigante;999999999999;999999999999,00",
      ].join("\n");

      const resultBig = await parseModelP7File(Buffer.from(bigQtyCsv, "utf-8"), "overflow_row.csv");
      // Row must be quarantined as INVALID_QUANTITY without crashing the parser
      expect(resultBig.quarantine.some((q) => q.code === "INVALID_QUANTITY")).toBe(true);
      expect(resultBig.items.length).toBe(0);
    });
  });

  // =========================================================================
  // DOMAIN 3: Intelligent Deduction Engine & SLA Fallbacks
  // =========================================================================
  describe("Domain 3: Intelligent Deduction Engine White-Box Hardening", () => {
    it("W3-BAIXA-01: SLA budget deadline stops Tier 2 Three-Sum and falls back gracefully to Tier 3 proximity", () => {
      // Stock candidates with non-matching values for 3-sum
      const candidates = [
        { id: "1", codigo: "C1", barras: null, discriminacao: "Item 1", unidade: "UN", quantidade: 1, unitarioCentavos: 100 },
        { id: "2", codigo: "C2", barras: null, discriminacao: "Item 2", unidade: "UN", quantidade: 1, unitarioCentavos: 200 },
        { id: "3", codigo: "C3", barras: null, discriminacao: "Item 3", unidade: "UN", quantidade: 1, unitarioCentavos: 400 },
      ];

      // Request a target that cannot be matched exactly
      const target = 350;

      // With very tight timeoutMs (0.01ms), the algorithm must cleanly fallback to PROXIMITY_COMBINATION
      const result = findDeductionSuggestion(candidates, target, { timeoutMs: 0.01 });
      expect(result.strategy).toBe("PROXIMITY_COMBINATION");
      expect(result.valorAlvoCentavos).toBe(target);
      expect(result.itens.length).toBeGreaterThan(0);
      expect(result.deltaCentavos).not.toBe(0);
    });

    it("W3-BAIXA-02: handles candidate pool pruning (> 150 candidates) safely and performantly", () => {
      // Generate 200 distinct candidates
      const pool = Array.from({ length: 200 }, (_, idx) => ({
        id: `PROD-${idx}`,
        codigo: `P-${idx.toString().padStart(3, "0")}`,
        barras: null,
        discriminacao: `Produto Estoque ${idx}`,
        unidade: "UN",
        quantidade: (idx % 10) + 1,
        unitarioCentavos: (idx + 1) * 37, // primes to avoid exact easy matches
      }));

      const startTime = performance.now();
      const result = findDeductionSuggestion(pool, 1500, { timeoutMs: 2.0 });
      const elapsed = performance.now() - startTime;

      expect(["EXACT_UNIT", "EXACT_MULTIPLE", "EXACT_COMBINATION", "PROXIMITY_COMBINATION"]).toContain(result.strategy);
      expect(elapsed).toBeLessThan(100); // Must be fast
    });

    it("W3-BAIXA-03: massive quantity item calculates exact multiple instantaneously without loop explosion", () => {
      const candidates = [
        {
          id: "MASSIVE-1",
          codigo: "MASSIVE-1",
          barras: null,
          discriminacao: "Produto Estoque Massivo",
          unidade: "UN",
          quantidade: 1_000_000,
          unitarioCentavos: 250, // R$ 2,50
        },
      ];

      // Target R$ 250,00 = 25000 centavos -> exact multiple k = 100
      const startTime = performance.now();
      const result = findDeductionSuggestion(candidates, 25000);
      const elapsed = performance.now() - startTime;

      expect(result.strategy).toBe("EXACT_MULTIPLE");
      expect(result.valorSugeridoCentavos).toBe(25000);
      expect(result.deltaCentavos).toBe(0);
      expect(result.itens).toHaveLength(1);
      expect(result.itens[0].quantidadeDebitar).toBe(100);
      expect(elapsed).toBeLessThan(20);
    });

    it("W3-BAIXA-04: resolves ties between identical prices deterministically (higher stock depth, then code)", () => {
      const candidates = [
        { id: "A", codigo: "COD-BBB", barras: null, discriminacao: "Item B", unidade: "UN", quantidade: 10, unitarioCentavos: 1000 },
        { id: "B", codigo: "COD-AAA", barras: null, discriminacao: "Item A", unidade: "UN", quantidade: 50, unitarioCentavos: 1000 },
      ];

      // Target 1000 centavos (exact unit): should pick Candidate B because of higher stock buffer (50 > 10)
      const res1 = findDeductionSuggestion(candidates, 1000);
      expect(res1.itens[0].produtoId).toBe("B");

      // Equal stock buffer: should pick lexicographically smaller code ("COD-AAA" < "COD-BBB")
      const candidatesEqualStock = [
        { id: "A", codigo: "COD-BBB", barras: null, discriminacao: "Item B", unidade: "UN", quantidade: 50, unitarioCentavos: 1000 },
        { id: "B", codigo: "COD-AAA", barras: null, discriminacao: "Item A", unidade: "UN", quantidade: 50, unitarioCentavos: 1000 },
      ];
      const res2 = findDeductionSuggestion(candidatesEqualStock, 1000);
      expect(res2.itens[0].codigo).toBe("COD-AAA");
    });

    it("W3-BAIXA-05: handles boundary target inputs (0, negative, invalid) and filters inactive stock", () => {
      const candidates = [
        { id: "1", codigo: "C1", barras: null, discriminacao: "Item Inativo", unidade: "UN", quantidade: 10, unitarioCentavos: 500, ativo: false },
        { id: "2", codigo: "C2", barras: null, discriminacao: "Item Zerado", unidade: "UN", quantidade: 0, unitarioCentavos: 500, ativo: true },
        { id: "3", codigo: "C3", barras: null, discriminacao: "Item Valido", unidade: "UN", quantidade: 5, unitarioCentavos: 500, ativo: true },
      ];

      // Inactive and zero-stock items must be filtered out
      const active = filterActiveStock(candidates);
      expect(active).toHaveLength(1);
      expect(active[0].codigo).toBe("C3");

      // Target = 0 centavos
      const resZero = findDeductionSuggestion(candidates, 0);
      expect(resZero.strategy).toBe("EXACT_UNIT");
      expect(resZero.itens).toHaveLength(0);
      expect(resZero.deltaCentavos).toBe(0);

      // Target < 0 (negative)
      const resNeg = findDeductionSuggestion(candidates, -100);
      expect(resNeg.strategy).toBe("ASSISTED_CATALOG");
      expect(resNeg.itens).toHaveLength(0);

      // Non-safe integer target
      const resFloat = findDeductionSuggestion(candidates, 12.34 as any);
      expect(resFloat.strategy).toBe("ASSISTED_CATALOG");
    });
  });

  // =========================================================================
  // DOMAIN 4: Atomic Transactions, Concurrency & Audit Immutability
  // =========================================================================
  describe("Domain 4: Atomic Transactions & Concurrency White-Box Hardening", () => {
    it("W4-TX-01: handles concurrent competing deductions with exact atomicity and prevents negative stock", async () => {
      // Seed a single product with stock = 2
      const prodCode = `${TEST_PREFIX}RACE-${Date.now()}`;
      const prod = await prisma.produtoEstoque.create({
        data: {
          codigo: prodCode,
          discriminacao: "[TEST-T5] Produto Concorrencia",
          quantidade: 2,
          unitarioCentavos: 1000,
          totalCentavos: 2000,
          ativo: true,
        },
      });
      trackedProductIds.push(prod.id);

      // Launch 3 concurrent transactions simultaneously, each requesting debit of 1 unit
      const promises = [1, 2, 3].map((idx) =>
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-05-01",
          itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
          operadorObservacao: `[TEST-T5] Concorrencia tentativa ${idx}`,
        })
      );

      const results = await Promise.allSettled(promises);

      // Track created records for cleanup
      for (const res of results) {
        if (res.status === "fulfilled") {
          trackedLancamentoIds.push(res.value.lancamentoDiarioId);
          trackedHistoricoIds.push(...res.value.historicoIds);
        }
      }

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 2 must succeed, and exactly 1 must fail (either concurrency conflict or insufficient stock)
      expect(fulfilled.length).toBe(2);
      expect(rejected.length).toBe(1);

      // Check database state: final stock must be exactly 0, and ativo must be false
      const updatedProd = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(updatedProd).not.toBeNull();
      expect(updatedProd!.quantidade).toBe(0);
      expect(updatedProd!.totalCentavos).toBe(0);
      expect(updatedProd!.ativo).toBe(false);
    });

    it("W4-TX-02: guarantees complete ACID rollback when one item in a multi-item batch fails", async () => {
      const codeA = `${TEST_PREFIX}BATCH-A-${Date.now()}`;
      const codeB = `${TEST_PREFIX}BATCH-B-${Date.now()}`;

      const prodA = await prisma.produtoEstoque.create({
        data: {
          codigo: codeA,
          discriminacao: "[TEST-T5] Multi-Item Prod A",
          quantidade: 10,
          unitarioCentavos: 500,
          totalCentavos: 5000,
          ativo: true,
        },
      });
      const prodB = await prisma.produtoEstoque.create({
        data: {
          codigo: codeB,
          discriminacao: "[TEST-T5] Multi-Item Prod B",
          quantidade: 2, // Only 2 in stock!
          unitarioCentavos: 800,
          totalCentavos: 1600,
          ativo: true,
        },
      });
      trackedProductIds.push(prodA.id, prodB.id);

      // Attempt transaction requesting Prod A (qty 2) and Prod B (qty 5 -> insufficient!)
      await expect(
        executeDeductionTransaction({
          formaPagamento: "DINHEIRO",
          dataLancamento: "2099-05-02",
          itens: [
            { produtoId: prodA.id, quantidadeDebitar: 2 },
            { produtoId: prodB.id, quantidadeDebitar: 5 },
          ],
          operadorObservacao: "[TEST-T5] Falha intencional multi-item",
        })
      ).rejects.toThrow(InsufficientStockError);

      // Check that Prod A was NOT decremented (zero partial writes!)
      const checkA = await prisma.produtoEstoque.findUnique({ where: { id: prodA.id } });
      const checkB = await prisma.produtoEstoque.findUnique({ where: { id: prodB.id } });
      expect(checkA!.quantidade).toBe(10);
      expect(checkB!.quantidade).toBe(2);

      // Check that no orphaned daily sales record was inserted
      const orphanedSales = await prisma.lancamentoDiario.findMany({
        where: { observacoes: "[TEST-T5] Falha intencional multi-item" },
      });
      expect(orphanedSales).toHaveLength(0);
    });

    it("W4-TX-03: zero-balance deactivation and immediate rejection of subsequent debits", async () => {
      const code = `${TEST_PREFIX}ZERO-${Date.now()}`;
      const prod = await prisma.produtoEstoque.create({
        data: {
          codigo: code,
          discriminacao: "[TEST-T5] Produto Esgotavel",
          quantidade: 1,
          unitarioCentavos: 1200,
          totalCentavos: 1200,
          ativo: true,
        },
      });
      trackedProductIds.push(prod.id);

      // Step 1: Debit exactly 1 unit -> stock reaches 0
      const tx1 = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-03",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        operadorObservacao: "[TEST-T5] Baixa que zera estoque",
      });
      trackedLancamentoIds.push(tx1.lancamentoDiarioId);
      trackedHistoricoIds.push(...tx1.historicoIds);

      // Verify product is inactive
      const reloaded = await prisma.produtoEstoque.findUnique({ where: { id: prod.id } });
      expect(reloaded!.quantidade).toBe(0);
      expect(reloaded!.ativo).toBe(false);

      // Step 2: Attempting another debit on this zero-balance item must fail with ProductInactiveError
      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-05-03",
          itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        })
      ).rejects.toThrow(ProductInactiveError);
    });

    it("W4-TX-04: foreign key restrict constraint prevents deletion of product referenced by audit history", async () => {
      const code = `${TEST_PREFIX}FK-${Date.now()}`;
      const prod = await prisma.produtoEstoque.create({
        data: {
          codigo: code,
          discriminacao: "[TEST-T5] Produto com FK",
          quantidade: 5,
          unitarioCentavos: 300,
          totalCentavos: 1500,
          ativo: true,
        },
      });
      trackedProductIds.push(prod.id);

      const tx = await executeDeductionTransaction({
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-05-04",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        operadorObservacao: "[TEST-T5] Baixa FK",
      });
      trackedLancamentoIds.push(tx.lancamentoDiarioId);
      trackedHistoricoIds.push(...tx.historicoIds);

      // Attempting to delete the product directly must violate the Foreign Key Restrict constraint
      let deleteFailed = false;
      try {
        await prisma.produtoEstoque.delete({ where: { id: prod.id } });
      } catch (err: any) {
        deleteFailed = true;
      }
      expect(deleteFailed).toBe(true);

      // On the other hand, deleting the LancamentoDiario must succeed and set null to lancamentoDiarioId (SetNull)
      await prisma.lancamentoDiario.delete({ where: { id: tx.lancamentoDiarioId } });
      const audit = await prisma.historicoBaixa.findUnique({ where: { id: tx.historicoIds[0] } });
      expect(audit).not.toBeNull();
      expect(audit!.lancamentoDiarioId).toBeNull();
    });

    it("W4-TX-05: audit trail immutability: product updates do NOT mutate frozen audit snapshots", async () => {
      const code = `${TEST_PREFIX}AUDIT-${Date.now()}`;
      const prod = await prisma.produtoEstoque.create({
        data: {
          codigo: code,
          discriminacao: "[TEST-T5] Produto Snapshot Original",
          quantidade: 10,
          unitarioCentavos: 1500, // R$ 15,00
          totalCentavos: 15000,
          ativo: true,
        },
      });
      trackedProductIds.push(prod.id);

      const tx = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
        operadorObservacao: "[TEST-T5] Snapshot freeze verification",
      });
      trackedLancamentoIds.push(tx.lancamentoDiarioId);
      trackedHistoricoIds.push(...tx.historicoIds);

      // Now aggressively alter the product in the catalog (price change, rename, deactivate)
      await prisma.produtoEstoque.update({
        where: { id: prod.id },
        data: {
          codigo: `${code}-MUTATED`,
          discriminacao: "[TEST-T5] Produto Totalmente Modificado",
          unitarioCentavos: 9999, // R$ 99,99
          ativo: false,
        },
      });

      // Retrieve audit trail via both query helpers
      const trail = await getTransactionAuditTrail(tx.lancamentoDiarioId);
      const prodHistory = await getProductAuditHistory(prod.id);

      expect(trail).toHaveLength(1);
      expect(trail[0].codigoProduto).toBe(code); // Original frozen code
      expect(trail[0].discriminacaoProduto).toBe("[TEST-T5] Produto Snapshot Original"); // Original description
      expect(trail[0].unitarioCentavos).toBe(1500); // Original price
      expect(trail[0].totalCentavos).toBe(3000); // 2 * 1500

      expect(prodHistory).toHaveLength(1);
      expect(prodHistory[0].unitarioCentavos).toBe(1500);
      expect(prodHistory[0].discriminacaoProduto).toBe("[TEST-T5] Produto Snapshot Original");
    });
  });

  // =========================================================================
  // DOMAIN 5: Financial Consolidation, DRE & SQL Injection Immunity
  // =========================================================================
  describe("Domain 5: Financial Dashboard & Aggregations White-Box Hardening", () => {
    it("W5-FIN-01: non-existent dates return clean zeros without throwing errors", async () => {
      const summary = await getDailySales("2099-05-20");
      expect(summary.data).toBe("2099-05-20");
      expect(summary.totalCartaoCentavos).toBe(0);
      expect(summary.totalDinheiroCentavos).toBe(0);
      expect(summary.totalGeralCentavos).toBe(0);
      expect(summary.quantidadeLancamentos).toBe(0);

      const range = await getDailySalesRange("2099-05-21", "2099-05-25");
      expect(range).toEqual([]);
    });

    it("W5-FIN-02: handles month with only expenses (net deficit confrontation)", async () => {
      const mesAno = "2099-06";

      const d1 = await prisma.despesaMensal.create({
        data: {
          mesAno,
          descricao: "[TEST-T5] Aluguel e Condominio",
          categoria: "CONTAS_FIXAS",
          valorCentavos: 250000, // R$ 2.500,00
          dataPagamento: "2099-06-05",
        },
      });
      const d2 = await prisma.despesaMensal.create({
        data: {
          mesAno,
          descricao: "[TEST-T5] Folha de Pagamento",
          categoria: "PESSOAL",
          valorCentavos: 350000, // R$ 3.500,00
          dataPagamento: "2099-06-06",
        },
      });
      trackedDespesaIds.push(d1.id, d2.id);

      const consolidation = await getMonthlyConsolidation(mesAno);
      expect(consolidation.mesAno).toBe(mesAno);
      expect(consolidation.totalEntradasCentavos).toBe(0);
      expect(consolidation.totalSaidasCentavos).toBe(600000);
      expect(consolidation.saldoLiquidoCentavos).toBe(-600000); // Deficit R$ -6.000,00
      expect(consolidation.diasComVendas).toBe(0);

      const detailed = await getDetailedMonthlyConsolidation(mesAno);
      expect(detailed.saldoLiquidoBRL).toBe("-R$ 6.000,00");
      expect(detailed.margemLiquidaPercentual).toBe(0);
      expect(detailed.despesasPorCategoria).toHaveLength(2);
      expect(detailed.despesasPorCategoria[0].categoria).toBe("PESSOAL"); // 350000 > 250000
    });

    it("W5-FIN-03: accurately computes months with 100% Card sales vs 100% Cash sales", async () => {
      // Month 1: 100% Card
      const mesCard = "2099-07";
      const lCard = await prisma.lancamentoDiario.create({
        data: {
          data: `${mesCard}-10`,
          valorCartaoCentavos: 10000,
          valorDinheiroCentavos: 0,
          totalDiarioCentavos: 10000,
          observacoes: "[TEST-T5] Apenas Cartao",
        },
      });
      trackedLancamentoIds.push(lCard.id);

      const detailedCard = await getDetailedMonthlyConsolidation(mesCard);
      expect(detailedCard.totalCartaoCentavos).toBe(10000);
      expect(detailedCard.totalDinheiroCentavos).toBe(0);
      expect(detailedCard.percentualCartao).toBe(100);
      expect(detailedCard.percentualDinheiro).toBe(0);

      // Month 2: 100% Cash
      const mesCash = "2099-08";
      const lCash = await prisma.lancamentoDiario.create({
        data: {
          data: `${mesCash}-15`,
          valorCartaoCentavos: 0,
          valorDinheiroCentavos: 8000,
          totalDiarioCentavos: 8000,
          observacoes: "[TEST-T5] Apenas Dinheiro",
        },
      });
      trackedLancamentoIds.push(lCash.id);

      const detailedCash = await getDetailedMonthlyConsolidation(mesCash);
      expect(detailedCash.totalCartaoCentavos).toBe(0);
      expect(detailedCash.totalDinheiroCentavos).toBe(8000);
      expect(detailedCash.percentualCartao).toBe(0);
      expect(detailedCash.percentualDinheiro).toBe(100);
    });

    it("W5-FIN-04: rejects SQL injection attempts and malformed date strings", async () => {
      const injectionPayloads = [
        "' OR '1'='1",
        "2026-05-01'; DROP TABLE lancamentos_diarios; --",
        "2026-05-01' UNION SELECT * FROM produtos_estoque --",
        "admin'--",
        "1; WAITFOR DELAY '0:0:5'",
      ];

      for (const payload of injectionPayloads) {
        await expect(getDailySales(payload)).rejects.toThrow();
        await expect(getDailySalesRange("2026-01-01", payload)).rejects.toThrow();
        await expect(getDailySalesRange(payload, "2026-01-01")).rejects.toThrow();
        await expect(getMonthlyConsolidation(payload)).rejects.toThrow();
        await expect(getDetailedMonthlyConsolidation(payload)).rejects.toThrow();
      }
    });
  });
});
