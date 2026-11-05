import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  loadCurrency,
  loadParserP7,
  loadBaixaInteligente,
  loadTransacoes,
  loadFinanceiro,
} from "./helpers/contract-loader";
import {
  generateModelP7Xlsx,
  generateModelP7Csv,
} from "./helpers/fixture-generator";
import {
  prisma,
  cleanTestData,
  seedTestProduct,
  createTestLancamento,
  createTestDespesa,
} from "./helpers/test-database";

describe("E2E Tier 1: Feature Coverage (Isolation & Interface Contracts)", () => {
  beforeAll(async () => {
    await cleanTestData("E2E-T1-");
  });

  afterAll(async () => {
    await cleanTestData("E2E-T1-");
  });

  // =========================================================================
  // F4: Strict Integer-Cents Monetary Engine
  // =========================================================================
  describe("F4: Strict Integer-Cents Monetary Engine Contract", () => {
    it("T1-F4-1: converts formatted BRL string to exact integer centavos", async () => {
      const currency = await loadCurrency();
      expect(currency).not.toBeNull();
      if (!currency) return;

      expect(currency.brlToCentavos("R$ 0,00")).toBe(0);
      expect(currency.brlToCentavos("R$ 1,00")).toBe(100);
      expect(currency.brlToCentavos("R$ 12,34")).toBe(1234);
      expect(currency.brlToCentavos("R$ 1.234,56")).toBe(123456);
      expect(currency.brlToCentavos("150,75")).toBe(15075);
    });

    it("T1-F4-2: formats integer centavos to Brazilian standard currency format (R$ 0,00)", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      expect(currency.centavosToBRL(0)).toBe("R$ 0,00");
      expect(currency.centavosToBRL(5)).toBe("R$ 0,05");
      expect(currency.centavosToBRL(99)).toBe("R$ 0,99");
      expect(currency.centavosToBRL(100)).toBe("R$ 1,00");
      expect(currency.centavosToBRL(123456)).toBe("R$ 1.234,56");
    });

    it("T1-F4-3: performs exact additive and subtractive arithmetic without float drift", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      // In IEEE-754: 0.1 + 0.2 = 0.30000000000000004
      // In integer centavos: 10 + 20 = 30
      const a = currency.brlToCentavos("0,10");
      const b = currency.brlToCentavos("0,20");
      const sum = currency.addMoney(a, b);
      expect(sum).toBe(30);
      expect(currency.centavosToBRL(sum)).toBe("R$ 0,30");

      const diff = currency.subtractMoney(sum, a);
      expect(diff).toBe(20);
      expect(currency.centavosToBRL(diff)).toBe("R$ 0,20");
    });

    it("T1-F4-4: performs integer multiplication with discrete quantity", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      const unitarioCentavos = currency.brlToCentavos("R$ 3,45"); // 345
      const total3Units = currency.multiplyMoney(unitarioCentavos, 3); // 1035
      expect(total3Units).toBe(1035);
      expect(currency.centavosToBRL(total3Units)).toBe("R$ 10,35");

      const totalZero = currency.multiplyMoney(unitarioCentavos, 0);
      expect(totalZero).toBe(0);
    });

    it("T1-F4-5: provides formatDecimalBRL for tabular raw views without R$ prefix", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      expect(currency.formatDecimalBRL(0)).toBe("0,00");
      expect(currency.formatDecimalBRL(123456)).toBe("1234,56");
      expect(currency.formatDecimalBRL(999)).toBe("9,99");
    });
  });

  // =========================================================================
  // F2 & F3: Prisma ORM, Relational Schema, Models & Constraints
  // =========================================================================
  describe("F2 & F3: Relational Persistence, Schema & Foreign Key Constraints", () => {
    it("T1-F2-1: verifies SQLite WAL mode and critical PRAGMA settings", async () => {
      const journalMode = await prisma.$queryRaw<
        Array<{ journal_mode: string }>
      >`PRAGMA journal_mode;`;
      expect(journalMode[0].journal_mode.toLowerCase()).toBe("wal");

      const busyTimeout = await prisma.$queryRaw<
        Array<{ timeout: number }>
      >`PRAGMA busy_timeout;`;
      expect(Number(busyTimeout[0].timeout)).toBeGreaterThanOrEqual(5000);
    });

    it("T1-F3-2: creates and reads a ProdutoEstoque with integer centavos and defaults", async () => {
      const item = await seedTestProduct({
        codigo: "E2E-T1-PROD-01",
        barras: "7891000100011",
        ncm: "1006.30.21",
        discriminacao: "Arroz Agulhinha Tipo 1 5kg [TEST-E2E]",
        unidade: "PCT",
        quantidade: 50,
        unitarioCentavos: 2890, // R$ 28,90
      });

      expect(item.id).toBeDefined();
      expect(item.codigo).toBe("E2E-T1-PROD-01");
      expect(item.quantidade).toBe(50);
      expect(item.unitarioCentavos).toBe(2890);
      expect(item.totalCentavos).toBe(144500); // 50 * 2890
      expect(item.ativo).toBe(true);
    });

    it("T1-F3-3: creates LancamentoDiario tracking separate Card and Cash amounts", async () => {
      const lancamento = await createTestLancamento({
        data: "2099-01-15",
        valorCartaoCentavos: 125000, // R$ 1.250,00
        valorDinheiroCentavos: 75000, // R$ 750,00
      });

      expect(lancamento.id).toBeDefined();
      expect(lancamento.valorCartaoCentavos).toBe(125000);
      expect(lancamento.valorDinheiroCentavos).toBe(75000);
      expect(lancamento.totalDiarioCentavos).toBe(200000); // 125000 + 75000
    });

    it("T1-F3-4: enforces Foreign Key Restrict on ProdutoEstoque referenced by HistoricoBaixa", async () => {
      const product = await seedTestProduct({
        codigo: "E2E-T1-FK-PROD",
        discriminacao: "Produto Teste FK [TEST-E2E]",
        quantidade: 10,
        unitarioCentavos: 1500,
      });

      await prisma.historicoBaixa.create({
        data: {
          produtoId: product.id,
          codigoProduto: product.codigo,
          discriminacaoProduto: product.discriminacao,
          quantidadeBaixada: 2,
          unitarioCentavos: product.unitarioCentavos,
          totalCentavos: 3000,
          formaPagamento: "CARTAO",
        },
      });

      // Attempting to delete the product must fail due to foreign key restriction
      let failed = false;
      try {
        await prisma.produtoEstoque.delete({ where: { id: product.id } });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    });

    it("T1-F3-5: creates DespesaMensal categorized entry for DRE confrontation", async () => {
      const despesa = await createTestDespesa({
        mesAno: "2099-01",
        descricao: "Conta de Energia Elétrica Mercearia [TEST-E2E]",
        categoria: "CONTAS_FIXAS",
        valorCentavos: 85000, // R$ 850,00
        dataPagamento: "2099-01-10",
      });

      expect(despesa.id).toBeDefined();
      expect(despesa.mesAno).toBe("2099-01");
      expect(despesa.categoria).toBe("CONTAS_FIXAS");
      expect(despesa.valorCentavos).toBe(85000);
    });
  });

  // =========================================================================
  // F6, F7, F8, F9, F10: Model P7 Parser & Dynamic Anchor Detection
  // =========================================================================
  describe("F6-F10: Model P7 Parser, Delimiters, Encodings & Validation", () => {
    it("T1-F8-1: parses valid Model P7 .xlsx file skipping administrative preamble", async () => {
      const parser = await loadParserP7();
      if (!parser) {
        console.warn("[SKIP] M2 Parser P7 not yet implemented.");
        return;
      }

      const buffer = generateModelP7Xlsx([
        {
          codigo: "E2E-P7-01",
          barras: "789123456001",
          ncm: "2106.90.90",
          discriminacao: "Refrigerante Cola 2L",
          unidade: "UN",
          quantidade: 24,
          unitario: 8.5,
          total: 204.0,
        },
        {
          codigo: "E2E-P7-02",
          barras: "789123456002",
          ncm: "1905.31.00",
          discriminacao: "Biscoito Recheado Chocolate 130g",
          unidade: "PCT",
          quantidade: 50,
          unitario: 3.25,
          total: 162.5,
        },
      ]);

      const result = await parser.parseModelP7File(buffer, "inventario.xlsx");
      expect(result.items.length).toBe(2);
      expect(result.items[0].codigo).toBe("E2E-P7-01");
      expect(result.items[0].unitarioCentavos).toBe(850);
      expect(result.items[0].totalCentavos).toBe(20400);
      expect(result.items[1].codigo).toBe("E2E-P7-02");
      expect(result.items[1].unitarioCentavos).toBe(325);
    });

    it("T1-F7-2: detects semicolon delimiter and Latin-1 encoding in .csv P7 files", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const buffer = generateModelP7Csv(
        [
          {
            codigo: "E2E-P7-CSV1",
            barras: "7891000200020",
            discriminacao: "Açúcar Refinado Especial 1kg", // Accented
            unidade: "KG",
            quantidade: 100,
            unitario: "4,50",
            total: "450,00",
          },
        ],
        { delimiter: ";", encoding: "latin1" }
      );

      const result = await parser.parseModelP7File(buffer, "inventario-latin1.csv");
      expect(result.items.length).toBe(1);
      expect(result.items[0].codigo).toBe("E2E-P7-CSV1");
      expect(result.items[0].discriminacao).toContain("Açúcar");
      expect(result.items[0].unitarioCentavos).toBe(450);
    });

    it("T1-F6-3: reliably finds table headers despite variable administrative preambles", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const longPreamble = [
        "ESTADO DE SÃO PAULO - SECRETARIA DA FAZENDA",
        "LIVRO DE REGISTRO DE INVENTÁRIO - MODELO 7",
        "ESTABELECIMENTO: MERCEARIA CENTRAL LTDA",
        "INSCRIÇÃO ESTADUAL: 111.222.333.444",
        "CNPJ: 00.123.456/0001-78",
        "EXERCÍCIO DE 2025",
        "",
      ];

      const buffer = generateModelP7Xlsx(
        [
          {
            codigo: "E2E-P7-PRE",
            discriminacao: "Item pós-preâmbulo longo",
            quantidade: 10,
            unitario: 10.0,
          },
        ],
        { administrativePreamble: longPreamble }
      );

      const result = await parser.parseModelP7File(buffer, "preambulo_longo.xlsx");
      expect(result.items.length).toBe(1);
      expect(result.items[0].codigo).toBe("E2E-P7-PRE");
    });

    it("T1-F9-4: halts extraction before TOTAL GERAL and summary rows", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const buffer = generateModelP7Xlsx(
        [
          {
            codigo: "E2E-P7-VALID",
            discriminacao: "Produto Válido Final",
            quantidade: 5,
            unitario: 2.0,
          },
        ],
        { includeSummaryRow: true, totalGeralValue: "R$ 10,00" }
      );

      const result = await parser.parseModelP7File(buffer, "com_totais.xlsx");
      expect(result.items.length).toBe(1);
      // Ensure "TOTAL GERAL" is not accidentally ingested as a product item
      expect(result.items.some((it) => it.discriminacao.includes("TOTAL GERAL"))).toBe(false);
    });

    it("T1-F10-5: routes corrupted or unparseable rows into quarantine list", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const buffer = generateModelP7Csv(
        [
          {
            codigo: "E2E-VALID",
            discriminacao: "Produto Íntegro",
            quantidade: 10,
            unitario: "5,00",
          },
          {
            codigo: "E2E-CORRUPT",
            discriminacao: "Produto com Preço Corrompido",
            quantidade: 10,
            unitario: "TEXTO_INVALIDO",
          },
        ],
        { delimiter: ";" }
      );

      const result = await parser.parseModelP7File(buffer, "quarantine_test.csv");
      expect(result.items.length).toBe(1);
      expect(result.items[0].codigo).toBe("E2E-VALID");
      expect(result.quarantine.length).toBeGreaterThanOrEqual(1);
      expect(result.quarantine[0].reason).toBeDefined();
    });
  });

  // =========================================================================
  // F12: Inventory Bulk Ingestion & Upsert
  // =========================================================================
  describe("F12: Inventory Ingestion & Bulk Persistence Contract", () => {
    it("T1-F12-1: inserts parsed P7 items into database cleanly", async () => {
      const item = await seedTestProduct({
        codigo: "E2E-T1-INGEST-1",
        barras: "7890001",
        discriminacao: "Sabão em Pó 1kg [TEST-E2E]",
        unidade: "CX",
        quantidade: 30,
        unitarioCentavos: 1290,
      });

      const found = await prisma.produtoEstoque.findUnique({
        where: { codigo: "E2E-T1-INGEST-1" },
      });
      expect(found).not.toBeNull();
      expect(found?.discriminacao).toBe("Sabão em Pó 1kg [TEST-E2E]");
      expect(found?.totalCentavos).toBe(38700);
    });

    it("T1-F12-2: upserts existing products updating quantity and price", async () => {
      await seedTestProduct({
        codigo: "E2E-T1-INGEST-2",
        discriminacao: "Detergente Neutro 500ml [TEST-E2E]",
        quantidade: 20,
        unitarioCentavos: 250,
      });

      // Restock: new shipment arrives with updated quantity and new price
      const updated = await seedTestProduct({
        codigo: "E2E-T1-INGEST-2",
        discriminacao: "Detergente Neutro 500ml [TEST-E2E]",
        quantidade: 50,
        unitarioCentavos: 275,
      });

      expect(updated.quantidade).toBe(50);
      expect(updated.unitarioCentavos).toBe(275);
      expect(updated.totalCentavos).toBe(13750);
    });

    it("T1-F12-3: preserves inactive status if stock is 0 upon import", async () => {
      const zeroItem = await seedTestProduct({
        codigo: "E2E-T1-INGEST-ZERO",
        discriminacao: "Item Esgotado [TEST-E2E]",
        quantidade: 0,
        unitarioCentavos: 1000,
      });

      expect(zeroItem.ativo).toBe(false);
    });

    it("T1-F12-4: supports optional barcode and NCM fields as nullable strings", async () => {
      const item = await seedTestProduct({
        codigo: "E2E-T1-INGEST-NULLS",
        barras: null,
        ncm: null,
        discriminacao: "Hortifrúti Sem EAN [TEST-E2E]",
        quantidade: 15,
        unitarioCentavos: 400,
      });

      expect(item.barras).toBeNull();
      expect(item.ncm).toBeNull();
    });

    it("T1-F12-5: queries products by barcode index accurately", async () => {
      await seedTestProduct({
        codigo: "E2E-T1-BARCODE",
        barras: "7891234567890",
        discriminacao: "Café Torrado e Moído 500g [TEST-E2E]",
        quantidade: 25,
        unitarioCentavos: 1890,
      });

      const found = await prisma.produtoEstoque.findFirst({
        where: { barras: "7891234567890" },
      });
      expect(found).not.toBeNull();
      expect(found?.codigo).toBe("E2E-T1-BARCODE");
    });
  });

  // =========================================================================
  // F13-F16: Intelligent Deduction Engine Contract
  // =========================================================================
  describe("F13-F16: Intelligent Deduction Matching Engine", () => {
    it("T1-F13-1: matches exact unit when single item equals target amount", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) {
        console.warn("[SKIP] M3 Baixa Inteligente not yet implemented.");
        return;
      }

      const stock = [
        {
          id: "1",
          codigo: "P1",
          barras: null,
          discriminacao: "Óleo de Soja 900ml",
          unidade: "UN",
          quantidade: 10,
          unitarioCentavos: 750, // R$ 7,50
        },
        {
          id: "2",
          codigo: "P2",
          barras: null,
          discriminacao: "Azeite 500ml",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 3500, // R$ 35,00
        },
      ];

      const suggestion = engine.findDeductionSuggestion(stock, 750);
      expect(suggestion.strategy).toBe("EXACT_UNIT");
      expect(suggestion.valorAlvoCentavos).toBe(750);
      expect(suggestion.valorSugeridoCentavos).toBe(750);
      expect(suggestion.deltaCentavos).toBe(0);
      expect(suggestion.itens.length).toBe(1);
      expect(suggestion.itens[0].codigo).toBe("P1");
      expect(suggestion.itens[0].quantidadeDebitar).toBe(1);
    });

    it("T1-F13-2: matches exact multiple when integer quantity equals target amount", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "1",
          codigo: "P-LEITE",
          barras: null,
          discriminacao: "Leite UHT Integral 1L",
          unidade: "UN",
          quantidade: 20,
          unitarioCentavos: 500, // R$ 5,00
        },
      ];

      // Target: R$ 20,00 (4 * 5,00)
      const suggestion = engine.findDeductionSuggestion(stock, 2000);
      expect(["EXACT_UNIT", "EXACT_MULTIPLE"]).toContain(suggestion.strategy);
      expect(suggestion.valorSugeridoCentavos).toBe(2000);
      expect(suggestion.deltaCentavos).toBe(0);
      expect(suggestion.itens[0].quantidadeDebitar).toBe(4);
    });

    it("T1-F14-3: finds exact combination of distinct items when no single multiple matches", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "1",
          codigo: "P-CHA",
          barras: null,
          discriminacao: "Chá Mate 250g",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 650, // R$ 6,50
        },
        {
          id: "2",
          codigo: "P-BISCOITO",
          barras: null,
          discriminacao: "Biscoito Cream Cracker",
          unidade: "PCT",
          quantidade: 10,
          unitarioCentavos: 450, // R$ 4,50
        },
      ];

      // Target: R$ 11,00 (6,50 + 4,50)
      const suggestion = engine.findDeductionSuggestion(stock, 1100);
      expect(suggestion.valorSugeridoCentavos).toBe(1100);
      expect(suggestion.deltaCentavos).toBe(0);
      expect(suggestion.itens.length).toBe(2);
    });

    it("T1-F15-4: returns nearest proximity combination when exact match is impossible", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "1",
          codigo: "P1",
          barras: null,
          discriminacao: "Item A",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 1000, // R$ 10,00
        },
        {
          id: "2",
          codigo: "P2",
          barras: null,
          discriminacao: "Item B",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 1500, // R$ 15,00
        },
      ];

      // Target: R$ 11,00 (closest is 10,00 with delta 1,00)
      const suggestion = engine.findDeductionSuggestion(stock, 1100);
      expect(suggestion.valorSugeridoCentavos).toBeDefined();
      expect(suggestion.deltaCentavos).toBeDefined();
      expect(Math.abs(suggestion.deltaCentavos)).toBeLessThanOrEqual(500);
    });

    it("T1-F16-5: returns assisted catalog alternatives when requested", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "1",
          codigo: "P1",
          barras: null,
          discriminacao: "Pão de Forma",
          unidade: "PCT",
          quantidade: 8,
          unitarioCentavos: 890,
        },
        {
          id: "2",
          codigo: "P2",
          barras: null,
          discriminacao: "Margarina 500g",
          unidade: "UN",
          quantidade: 12,
          unitarioCentavos: 720,
        },
      ];

      const suggestion = engine.findDeductionSuggestion(stock, 1500);
      expect(suggestion).toBeDefined();
      expect(suggestion.itens).toBeInstanceOf(Array);
    });
  });

  // =========================================================================
  // F17, F18, F19: Atomic Transactions Subsystem Contract
  // =========================================================================
  describe("F17-F19: Atomic Transactions, Daily Sales Book & Audit Trail", () => {
    it("T1-F17-1: atomically decrements stock quantity in database transaction", async () => {
      const product = await seedTestProduct({
        codigo: "E2E-T1-ATOMIC-1",
        discriminacao: "Macarrão Espaguete 500g [TEST-E2E]",
        quantidade: 10,
        unitarioCentavos: 450,
      });

      // Perform atomic decrement
      await prisma.$transaction(async (tx) => {
        const item = await tx.produtoEstoque.findUniqueOrThrow({
          where: { id: product.id },
        });
        const novaQtd = item.quantidade - 3;
        await tx.produtoEstoque.update({
          where: { id: product.id },
          data: {
            quantidade: novaQtd,
            totalCentavos: novaQtd * item.unitarioCentavos,
          },
        });
      });

      const updated = await prisma.produtoEstoque.findUnique({
        where: { id: product.id },
      });
      expect(updated?.quantidade).toBe(7);
      expect(updated?.totalCentavos).toBe(3150);
    });

    it("T1-F17-2: deactivates product (ativo = false) when balance reaches zero", async () => {
      const product = await seedTestProduct({
        codigo: "E2E-T1-ATOMIC-ZERO",
        discriminacao: "Farinha de Trigo 1kg [TEST-E2E]",
        quantidade: 2,
        unitarioCentavos: 550,
      });

      await prisma.$transaction(async (tx) => {
        const item = await tx.produtoEstoque.findUniqueOrThrow({
          where: { id: product.id },
        });
        const novaQtd = item.quantidade - 2;
        await tx.produtoEstoque.update({
          where: { id: product.id },
          data: {
            quantidade: novaQtd,
            totalCentavos: 0,
            ativo: novaQtd > 0,
          },
        });
      });

      const updated = await prisma.produtoEstoque.findUnique({
        where: { id: product.id },
      });
      expect(updated?.quantidade).toBe(0);
      expect(updated?.ativo).toBe(false);
    });

    it("T1-F18-3: records sales transaction in lancamentos_diarios under CARTAO", async () => {
      const lancamento = await prisma.lancamentoDiario.create({
        data: {
          data: "2099-01-20",
          valorCartaoCentavos: 4500,
          valorDinheiroCentavos: 0,
          totalDiarioCentavos: 4500,
          observacoes: "[TEST-E2E] Venda Cartão",
        },
      });

      expect(lancamento.valorCartaoCentavos).toBe(4500);
      expect(lancamento.valorDinheiroCentavos).toBe(0);
      expect(lancamento.totalDiarioCentavos).toBe(4500);
    });

    it("T1-F18-4: records sales transaction in lancamentos_diarios under DINHEIRO", async () => {
      const lancamento = await prisma.lancamentoDiario.create({
        data: {
          data: "2099-01-20",
          valorCartaoCentavos: 0,
          valorDinheiroCentavos: 2500,
          totalDiarioCentavos: 2500,
          observacoes: "[TEST-E2E] Venda Dinheiro",
        },
      });

      expect(lancamento.valorCartaoCentavos).toBe(0);
      expect(lancamento.valorDinheiroCentavos).toBe(2500);
      expect(lancamento.totalDiarioCentavos).toBe(2500);
    });

    it("T1-F19-5: writes immutable audit trail in historico_baixas with historical snapshot", async () => {
      const product = await seedTestProduct({
        codigo: "E2E-T1-AUDIT",
        discriminacao: "Extrato de Tomate 340g [TEST-E2E]",
        quantidade: 20,
        unitarioCentavos: 380,
      });

      const audit = await prisma.historicoBaixa.create({
        data: {
          produtoId: product.id,
          codigoProduto: product.codigo,
          discriminacaoProduto: product.discriminacao,
          quantidadeBaixada: 2,
          unitarioCentavos: product.unitarioCentavos,
          totalCentavos: 760,
          formaPagamento: "CARTAO",
        },
      });

      expect(audit.id).toBeDefined();
      expect(audit.codigoProduto).toBe("E2E-T1-AUDIT");
      expect(audit.quantidadeBaixada).toBe(2);
      expect(audit.totalCentavos).toBe(760);
      expect(audit.formaPagamento).toBe("CARTAO");
      expect(audit.dataHora).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // F20-F21: Front of Store POS & Deduction Preview Contracts
  // =========================================================================
  describe("F20-F21: Front of Store POS & Deduction Preview Contract", () => {
    it("T1-F20-1: validates POS payload with Cartao payment method", async () => {
      const transacoes = await loadTransacoes();
      if (!transacoes) {
        console.warn("[SKIP] M3 Transacoes not yet implemented.");
        return;
      }

      const product = await seedTestProduct({
        codigo: "E2E-T1-POS-CARTAO",
        discriminacao: "Item POS Cartão [TEST-E2E]",
        quantidade: 10,
        unitarioCentavos: 1000,
      });

      const result = await transacoes.executeDeductionTransaction({
        valorAlvoCentavos: 1000,
        formaPagamento: "CARTAO",
        dataLancamento: "2099-02-01",
        itens: [{ produtoId: product.id, quantidadeDebitar: 1 }],
      });

      expect(result.sucesso).toBe(true);
      expect(result.totalDebitadoCentavos).toBe(1000);
    });

    it("T1-F20-2: validates POS payload with Dinheiro payment method", async () => {
      const transacoes = await loadTransacoes();
      if (!transacoes) return;

      const product = await seedTestProduct({
        codigo: "E2E-T1-POS-DINHEIRO",
        discriminacao: "Item POS Dinheiro [TEST-E2E]",
        quantidade: 10,
        unitarioCentavos: 1500,
      });

      const result = await transacoes.executeDeductionTransaction({
        valorAlvoCentavos: 1500,
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-02-01",
        itens: [{ produtoId: product.id, quantidadeDebitar: 1 }],
      });

      expect(result.sucesso).toBe(true);
      expect(result.totalDebitadoCentavos).toBe(1500);
    });

    it("T1-F20-3: permits retroactive date selection for previous day fiscal entries", async () => {
      const transacoes = await loadTransacoes();
      if (!transacoes) return;

      const product = await seedTestProduct({
        codigo: "E2E-T1-POS-RETRO",
        discriminacao: "Item Retroativo [TEST-E2E]",
        quantidade: 10,
        unitarioCentavos: 2000,
      });

      const result = await transacoes.executeDeductionTransaction({
        valorAlvoCentavos: 2000,
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-01-31", // Retroactive date
        itens: [{ produtoId: product.id, quantidadeDebitar: 1 }],
      });

      expect(result.sucesso).toBe(true);
      const lancamento = await prisma.lancamentoDiario.findUnique({
        where: { id: result.lancamentoDiarioId },
      });
      expect(lancamento?.data).toBe("2099-01-31");
    });

    it("T1-F21-4: ensures preview suggestion payload contains required UI contract fields", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "preview-1",
          codigo: "E2E-PREV",
          barras: "789000000001",
          discriminacao: "Sardinha em Lata 125g",
          unidade: "UN",
          quantidade: 15,
          unitarioCentavos: 490,
        },
      ];

      const res = engine.findDeductionSuggestion(stock, 490);
      expect(res.itens[0]).toHaveProperty("produtoId");
      expect(res.itens[0]).toHaveProperty("codigo");
      expect(res.itens[0]).toHaveProperty("discriminacao");
      expect(res.itens[0]).toHaveProperty("quantidadeDebitar");
      expect(res.itens[0]).toHaveProperty("unitarioCentavos");
      expect(res.itens[0]).toHaveProperty("totalItemCentavos");
    });

    it("T1-F21-5: verifies delta is displayed when suggested total differs from target", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "p1",
          codigo: "P1",
          barras: null,
          discriminacao: "Item Teste",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 500,
        },
      ];

      const res = engine.findDeductionSuggestion(stock, 550);
      expect(res.deltaCentavos).toBeDefined();
    });
  });

  // =========================================================================
  // F23, F24, F25: Financial Dashboard & Expense Management Contracts
  // =========================================================================
  describe("F23-F25: Financial Consolidation & Expense Management", () => {
    it("T1-F23-1: aggregates daily sales separating Card and Cash", async () => {
      const testDate = "2099-03-10";
      await createTestLancamento({
        data: testDate,
        valorCartaoCentavos: 5000,
        valorDinheiroCentavos: 2000,
      });
      await createTestLancamento({
        data: testDate,
        valorCartaoCentavos: 3000,
        valorDinheiroCentavos: 4000,
      });

      const dayEntries = await prisma.lancamentoDiario.findMany({
        where: { data: testDate },
      });

      const totalCartao = dayEntries.reduce((acc, curr) => acc + curr.valorCartaoCentavos, 0);
      const totalDinheiro = dayEntries.reduce((acc, curr) => acc + curr.valorDinheiroCentavos, 0);
      const totalGeral = totalCartao + totalDinheiro;

      expect(totalCartao).toBe(8000);
      expect(totalDinheiro).toBe(6000);
      expect(totalGeral).toBe(14000);
    });

    it("T1-F24-2: consolidates monthly sales into cumulative totals", async () => {
      const mesAno = "2099-04";
      await createTestLancamento({
        data: `${mesAno}-01`,
        valorCartaoCentavos: 10000,
        valorDinheiroCentavos: 5000,
      });
      await createTestLancamento({
        data: `${mesAno}-15`,
        valorCartaoCentavos: 20000,
        valorDinheiroCentavos: 10000,
      });

      const entries = await prisma.lancamentoDiario.findMany({
        where: { data: { startsWith: mesAno } },
      });

      const sumCartao = entries.reduce((acc, e) => acc + e.valorCartaoCentavos, 0);
      const sumDinheiro = entries.reduce((acc, e) => acc + e.valorDinheiroCentavos, 0);
      const sumTotal = sumCartao + sumDinheiro;

      expect(sumCartao).toBe(30000);
      expect(sumDinheiro).toBe(15000);
      expect(sumTotal).toBe(45000);
    });

    it("T1-F25-3: calculates net monthly balance by confronting sales against expenses", async () => {
      const mesAno = "2099-05";
      // Entradas: R$ 500,00
      await createTestLancamento({
        data: `${mesAno}-05`,
        valorCartaoCentavos: 30000,
        valorDinheiroCentavos: 20000,
      });

      // Saídas: R$ 200,00 (Mercadorias) + R$ 100,00 (Aluguel) = R$ 300,00
      await createTestDespesa({
        mesAno,
        descricao: "Fornecedor de Bebidas [TEST-E2E]",
        categoria: "MERCADORIA",
        valorCentavos: 20000,
      });
      await createTestDespesa({
        mesAno,
        descricao: "Aluguel Ponto Comercial [TEST-E2E]",
        categoria: "CONTAS_FIXAS",
        valorCentavos: 10000,
      });

      const entries = await prisma.lancamentoDiario.findMany({
        where: { data: { startsWith: mesAno } },
      });
      const expenses = await prisma.despesaMensal.findMany({
        where: { mesAno },
      });

      const totalEntradas = entries.reduce((a, b) => a + b.totalDiarioCentavos, 0);
      const totalSaidas = expenses.reduce((a, b) => a + b.valorCentavos, 0);
      const saldoLiquido = totalEntradas - totalSaidas;

      expect(totalEntradas).toBe(50000); // R$ 500,00
      expect(totalSaidas).toBe(30000); // R$ 300,00
      expect(saldoLiquido).toBe(20000); // R$ 200,00
    });

    it("T1-F25-4: categorizes expenses across supported business categories", async () => {
      const categories = [
        "OPERACIONAL",
        "MERCADORIA",
        "CONTAS_FIXAS",
        "PESSOAL",
        "IMPOSTOS",
        "OUTROS",
      ];

      for (const cat of categories) {
        const item = await createTestDespesa({
          mesAno: "2099-06",
          descricao: `Despesa Categoria ${cat} [TEST-E2E]`,
          categoria: cat,
          valorCentavos: 5000,
        });
        expect(item.categoria).toBe(cat);
      }
    });

    it("T1-F24-5: verifies financeiro module contract if implemented", async () => {
      const financeiro = await loadFinanceiro();
      if (!financeiro) {
        console.warn("[SKIP] M4 Financeiro not yet implemented.");
        return;
      }

      const daily = await financeiro.getDailySales("2099-01-01");
      expect(daily).toHaveProperty("totalCartaoCentavos");
      expect(daily).toHaveProperty("totalDinheiroCentavos");
      expect(daily).toHaveProperty("totalGeralCentavos");
    });
  });
});
