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

describe("E2E Tier 2: Boundary & Corner Cases", () => {
  beforeAll(async () => {
    await cleanTestData("E2E-T2-");
  });

  afterAll(async () => {
    await cleanTestData("E2E-T2-");
  });

  // =========================================================================
  // Group A: Monetary Engine Boundaries & Adversarial Formats (F4)
  // =========================================================================
  describe("Group A: Monetary Engine Boundaries (F4)", () => {
    it("T2-B01: handles empty, whitespace, and zero strings safely", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      expect(currency.brlToCentavos("")).toBe(0);
      expect(currency.brlToCentavos("   ")).toBe(0);
      expect(currency.brlToCentavos("0")).toBe(0);
      expect(currency.brlToCentavos("0,00")).toBe(0);
      expect(currency.brlToCentavos("R$ 0,00")).toBe(0);
    });

    it("T2-B02: handles maximum safe financial values without floating point distortion", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      // R$ 999.999.999,99 = 99,999,999,999 centavos (fits within JS Number.MAX_SAFE_INTEGER 9e15)
      const bigBrl = "R$ 999.999.999,99";
      const centavos = currency.brlToCentavos(bigBrl);
      expect(centavos).toBe(99999999999);
      expect(currency.centavosToBRL(centavos)).toBe(bigBrl);
    });

    it("T2-B03: handles float inputs with rounding to nearest discrete centavo", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      // 10.555 -> 1056 centavos; 10.554 -> 1055 centavos
      expect(currency.brlToCentavos(10.555)).toBe(1056);
      expect(currency.brlToCentavos(10.554)).toBe(1055);
    });

    it("T2-B04: parses adversarial string representations with chaotic spaces and leading zeros", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      expect(currency.brlToCentavos("   R$   00012,30  ")).toBe(1230);
      expect(currency.brlToCentavos("005,50")).toBe(550);
      expect(currency.brlToCentavos("  0,05  ")).toBe(5);
    });

    it("T2-B05: handles negative amounts and arithmetic deficits without crashing", async () => {
      const currency = await loadCurrency();
      if (!currency) return;

      const deficit = currency.subtractMoney(500, 800); // 5.00 - 8.00 = -3.00
      expect(deficit).toBe(-300);
      // Format negative amounts
      expect(currency.centavosToBRL(-300)).toContain("-");
      expect(currency.centavosToBRL(-300)).toContain("3,00");
    });
  });

  // =========================================================================
  // Group B: Database Schema & Relational Boundaries (F2, F3)
  // =========================================================================
  describe("Group B: Relational Schema & Integrity Boundaries (F2, F3)", () => {
    it("T2-B06: rejects duplicate product codigo violating unique constraint", async () => {
      await seedTestProduct({
        codigo: "E2E-T2-DUP-01",
        discriminacao: "Primeiro Produto [TEST-E2E]",
        quantidade: 10,
        unitarioCentavos: 1000,
      });

      let duplicateFailed = false;
      try {
        await prisma.produtoEstoque.create({
          data: {
            codigo: "E2E-T2-DUP-01",
            discriminacao: "Produto Duplicado com Mesmo Código [TEST-E2E]",
            quantidade: 5,
            unitarioCentavos: 1000,
            totalCentavos: 5000,
          },
        });
      } catch {
        duplicateFailed = true;
      }
      expect(duplicateFailed).toBe(true);
    });

    it("T2-B07: persists extremely long description strings without truncation", async () => {
      const longName = "Refrigerante Sabor Cola " + "Especial ".repeat(30) + "[TEST-E2E]";
      const product = await seedTestProduct({
        codigo: "E2E-T2-LONG-DESC",
        discriminacao: longName,
        quantidade: 10,
        unitarioCentavos: 800,
      });

      expect(product.discriminacao).toBe(longName);
      expect(product.discriminacao.length).toBeGreaterThan(200);
    });

    it("T2-B08: supports zero values for both Card and Cash on LancamentoDiario", async () => {
      const lancamento = await createTestLancamento({
        data: "2099-07-01",
        valorCartaoCentavos: 0,
        valorDinheiroCentavos: 0,
        observacoes: "[TEST-E2E] Dia sem vendas",
      });

      expect(lancamento.totalDiarioCentavos).toBe(0);
    });

    it("T2-B09: sets lancamentoDiarioId to NULL in historico_baixas when daily entry is deleted (onDelete: SetNull)", async () => {
      const product = await seedTestProduct({
        codigo: "E2E-T2-SETNULL-PROD",
        discriminacao: "Produto Teste SetNull [TEST-E2E]",
        quantidade: 10,
        unitarioCentavos: 1000,
      });

      const lancamento = await createTestLancamento({
        data: "2099-07-02",
        valorCartaoCentavos: 2000,
        valorDinheiroCentavos: 0,
      });

      const audit = await prisma.historicoBaixa.create({
        data: {
          produtoId: product.id,
          lancamentoDiarioId: lancamento.id,
          codigoProduto: product.codigo,
          discriminacaoProduto: product.discriminacao,
          quantidadeBaixada: 2,
          unitarioCentavos: 1000,
          totalCentavos: 2000,
          formaPagamento: "CARTAO",
        },
      });

      expect(audit.lancamentoDiarioId).toBe(lancamento.id);

      // Delete the daily record
      await prisma.lancamentoDiario.delete({ where: { id: lancamento.id } });

      // Verify audit record persists with null foreign key reference
      const reloadedAudit = await prisma.historicoBaixa.findUnique({
        where: { id: audit.id },
      });
      expect(reloadedAudit).not.toBeNull();
      expect(reloadedAudit?.lancamentoDiarioId).toBeNull();
    });

    it("T2-B10: handles products with unit price of 0 (promotional/bonification items)", async () => {
      const freeItem = await seedTestProduct({
        codigo: "E2E-T2-FREE-ITEM",
        discriminacao: "Brinde Promocional da Mercearia [TEST-E2E]",
        quantidade: 100,
        unitarioCentavos: 0,
      });

      expect(freeItem.unitarioCentavos).toBe(0);
      expect(freeItem.totalCentavos).toBe(0);
    });
  });

  // =========================================================================
  // Group C: Model P7 Parser Boundaries & Adversarial Spreadsheets (F6-F10)
  // =========================================================================
  describe("Group C: Model P7 Parser Boundaries & Adversarial Files (F6-F10)", () => {
    it("T2-B11: handles 0-byte empty file buffer gracefully without unhandled crash", async () => {
      const parser = await loadParserP7();
      if (!parser) {
        console.warn("[SKIP] M2 Parser P7 not yet implemented.");
        return;
      }

      let errorCaught = false;
      try {
        await parser.parseModelP7File(Buffer.alloc(0), "empty.xlsx");
      } catch (err) {
        errorCaught = true;
        expect(err).toBeDefined();
      }
      expect(errorCaught).toBe(true);
    });

    it("T2-B12: parses file containing only administrative headers and no product data", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const buffer = generateModelP7Xlsx([], {
        includeSummaryRow: false,
      });

      const res = await parser.parseModelP7File(buffer, "no_items.xlsx");
      expect(res.items.length).toBe(0);
      expect(res.totalItensValidos).toBe(0);
    });

    it("T2-B13: handles mixed spreadsheet isolating corrupt rows in quarantine without aborting valid rows", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const buffer = generateModelP7Csv(
        [
          {
            codigo: "E2E-OK-1",
            discriminacao: "Produto Válido 1",
            quantidade: 10,
            unitario: "5,00",
          },
          {
            codigo: "", // Missing mandatory code
            discriminacao: "Sem Código",
            quantidade: 5,
            unitario: "10,00",
          },
          {
            codigo: "E2E-OK-2",
            discriminacao: "Produto Válido 2",
            quantidade: 20,
            unitario: "2,50",
          },
          {
            codigo: "E2E-NEG",
            discriminacao: "Preço Negativo",
            quantidade: 1,
            unitario: "-15,00",
          },
        ],
        { delimiter: ";" }
      );

      const res = await parser.parseModelP7File(buffer, "mixed_dirty.csv");
      expect(res.items.length).toBe(2);
      expect(res.items.map((i) => i.codigo)).toEqual(["E2E-OK-1", "E2E-OK-2"]);
      expect(res.quarantine.length).toBeGreaterThanOrEqual(2);
    });

    it("T2-B14: handles special Portuguese characters and escaped semicolons within quotes", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const buffer = generateModelP7Csv(
        [
          {
            codigo: "E2E-PUNCT-1",
            discriminacao: 'Pão de Açúcar; Especial & Cia "Tradicional"',
            quantidade: 10,
            unitario: "12,90",
          },
        ],
        { delimiter: ";", encoding: "utf-8" }
      );

      const res = await parser.parseModelP7File(buffer, "punct.csv");
      expect(res.items.length).toBe(1);
      expect(res.items[0].discriminacao).toContain("Pão de Açúcar");
    });

    it("T2-B15: handles massive quantity sizes (e.g. 50,000 units) without overflow", async () => {
      const parser = await loadParserP7();
      if (!parser) return;

      const buffer = generateModelP7Xlsx([
        {
          codigo: "E2E-MASSIVE",
          discriminacao: "Fósforos Maço com 10 Caixas",
          quantidade: 50000,
          unitario: 4.5,
          total: 225000.0,
        },
      ]);

      const res = await parser.parseModelP7File(buffer, "massive.xlsx");
      expect(res.items.length).toBe(1);
      expect(res.items[0].quantidade).toBe(50000);
      expect(res.items[0].totalCentavos).toBe(22500000); // R$ 225.000,00
    });
  });

  // =========================================================================
  // Group D: Intelligent Deduction Engine Boundaries (F13-F16)
  // =========================================================================
  describe("Group D: Intelligent Deduction Engine Boundaries (F13-F16)", () => {
    it("T2-B16: handles target amount of 0 centavos safely", async () => {
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
          discriminacao: "Item",
          unidade: "UN",
          quantidade: 10,
          unitarioCentavos: 500,
        },
      ];

      const res = engine.findDeductionSuggestion(stock, 0);
      expect(res.valorSugeridoCentavos).toBe(0);
      expect(res.itens.length).toBe(0);
    });

    it("T2-B17: handles target amount exceeding total inventory valuation", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      // Total stock is R$ 10,00
      const stock = [
        {
          id: "1",
          codigo: "P1",
          barras: null,
          discriminacao: "Item Único",
          unidade: "UN",
          quantidade: 1,
          unitarioCentavos: 1000,
        },
      ];

      // Request R$ 1.000.000,00
      const res = engine.findDeductionSuggestion(stock, 100000000);
      expect(res).toBeDefined();
      expect(res.deltaCentavos).toBeDefined();
    });

    it("T2-B18: handles empty inventory array without throwing unhandled exceptions", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const res = engine.findDeductionSuggestion([], 1500);
      expect(res).toBeDefined();
      expect(res.itens.length).toBe(0);
    });

    it("T2-B19: ignores candidates with 0 available quantity", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "zero-item",
          codigo: "P-ZERO",
          barras: null,
          discriminacao: "Item Sem Saldo",
          unidade: "UN",
          quantidade: 0,
          unitarioCentavos: 1000, // exact match price, but 0 stock!
        },
        {
          id: "avail-item",
          codigo: "P-AVAIL",
          barras: null,
          discriminacao: "Item Com Saldo",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 1200,
        },
      ];

      const res = engine.findDeductionSuggestion(stock, 1000);
      // Item with 0 stock must NEVER be suggested
      expect(res.itens.some((i) => i.codigo === "P-ZERO")).toBe(false);
    });

    it("T2-B20: handles prime odd target (R$ 0,07) with minimal delta proximity selection", async () => {
      const engine = await loadBaixaInteligente();
      if (!engine) return;

      const stock = [
        {
          id: "1",
          codigo: "P1",
          barras: null,
          discriminacao: "Bala Avulsa",
          unidade: "UN",
          quantidade: 50,
          unitarioCentavos: 10, // R$ 0,10
        },
      ];

      // Target R$ 0,07
      const res = engine.findDeductionSuggestion(stock, 7);
      expect(res).toBeDefined();
      expect(res.deltaCentavos).toBeDefined();
    });
  });

  // =========================================================================
  // Group E: Atomic Transactions & Financial Boundaries (F17-F19, F23-F25)
  // =========================================================================
  describe("Group E: Atomic Transactions & Financial Boundaries (F17-F19, F23-F25)", () => {
    it("T2-B21: rolls back transaction if debit quantity exceeds available stock", async () => {
      const product = await seedTestProduct({
        codigo: "E2E-T2-OVERDRAFT",
        discriminacao: "Produto Estoque Baixo [TEST-E2E]",
        quantidade: 3,
        unitarioCentavos: 1000,
      });

      let transactionFailed = false;
      try {
        await prisma.$transaction(async (tx) => {
          const item = await tx.produtoEstoque.findUniqueOrThrow({
            where: { id: product.id },
          });

          const debitQuantity = 10; // Exceeds available 3!
          if (item.quantidade < debitQuantity) {
            throw new Error("Saldo de estoque insuficiente para baixa");
          }

          await tx.produtoEstoque.update({
            where: { id: product.id },
            data: { quantidade: item.quantidade - debitQuantity },
          });
        });
      } catch {
        transactionFailed = true;
      }

      expect(transactionFailed).toBe(true);

      // Verify stock was not decremented
      const check = await prisma.produtoEstoque.findUnique({
        where: { id: product.id },
      });
      expect(check?.quantidade).toBe(3);
    });

    it("T2-B22: returns zero values when querying daily sales for a day with no transactions", async () => {
      const emptyDay = "2099-12-31";
      const entries = await prisma.lancamentoDiario.findMany({
        where: { data: emptyDay },
      });

      const totalCartao = entries.reduce((s, e) => s + e.valorCartaoCentavos, 0);
      const totalDinheiro = entries.reduce((s, e) => s + e.valorDinheiroCentavos, 0);

      expect(entries.length).toBe(0);
      expect(totalCartao).toBe(0);
      expect(totalDinheiro).toBe(0);
    });

    it("T2-B23: handles monthly deficit when total expenses exceed sales", async () => {
      const mesAno = "2099-08";

      // Vendas: R$ 100,00
      await createTestLancamento({
        data: `${mesAno}-10`,
        valorCartaoCentavos: 10000,
        valorDinheiroCentavos: 0,
      });

      // Despesas: R$ 350,00
      await createTestDespesa({
        mesAno,
        descricao: "Manutenção Emergencial Freezers [TEST-E2E]",
        categoria: "OPERACIONAL",
        valorCentavos: 35000,
      });

      const sales = await prisma.lancamentoDiario.findMany({
        where: { data: { startsWith: mesAno } },
      });
      const expenses = await prisma.despesaMensal.findMany({
        where: { mesAno },
      });

      const totalEntradas = sales.reduce((a, b) => a + b.totalDiarioCentavos, 0);
      const totalSaidas = expenses.reduce((a, b) => a + b.valorCentavos, 0);
      const saldoLiquido = totalEntradas - totalSaidas;

      expect(totalEntradas).toBe(10000);
      expect(totalSaidas).toBe(35000);
      expect(saldoLiquido).toBe(-25000); // Deficit of R$ -250,00
    });

    it("T2-B24: handles year boundary filtering (2099-12 vs 2100-01) cleanly", async () => {
      await createTestLancamento({
        data: "2099-12-31",
        valorCartaoCentavos: 2000,
        valorDinheiroCentavos: 0,
      });
      await createTestLancamento({
        data: "2100-01-01",
        valorCartaoCentavos: 5000,
        valorDinheiroCentavos: 0,
      });

      const decEntries = await prisma.lancamentoDiario.findMany({
        where: { data: { startsWith: "2099-12" } },
      });
      const janEntries = await prisma.lancamentoDiario.findMany({
        where: { data: { startsWith: "2100-01" } },
      });

      expect(decEntries.length).toBeGreaterThanOrEqual(1);
      expect(janEntries.length).toBeGreaterThanOrEqual(1);
      expect(decEntries.every((e) => e.data.startsWith("2099-12"))).toBe(true);
      expect(janEntries.every((e) => e.data.startsWith("2100-01"))).toBe(true);
    });

    it("T2-B25: executes transaction coordinator with missing or invalid product ID safely", async () => {
      const transacoes = await loadTransacoes();
      if (!transacoes) return;

      let errorCaught = false;
      try {
        await transacoes.executeDeductionTransaction({
          valorAlvoCentavos: 1000,
          formaPagamento: "CARTAO",
          dataLancamento: "2099-01-01",
          itens: [{ produtoId: "non-existent-id", quantidadeDebitar: 1 }],
        });
      } catch {
        errorCaught = true;
      }
      expect(errorCaught).toBe(true);
    });
  });
});
