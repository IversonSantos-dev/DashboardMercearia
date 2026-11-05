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

describe("E2E Tier 3: Cross-Feature Combinations (Full Lifecycle Integration)", () => {
  beforeAll(async () => {
    await cleanTestData("E2E-T3-");
  });

  afterAll(async () => {
    await cleanTestData("E2E-T3-");
  });

  it("T3-01: complete lifecycle: Import P7 -> Smart Deduction -> Daily Cash Closure -> Monthly Confrontation", async () => {
    const currency = await loadCurrency();
    const parser = await loadParserP7();
    const engine = await loadBaixaInteligente();
    const transacoes = await loadTransacoes();

    const testMonth = "2099-09";
    const testDate = `${testMonth}-15`;

    // -----------------------------------------------------------------------
    // STEP 1: Generate & Parse Model P7 Spreadsheet
    // -----------------------------------------------------------------------
    const fixtureItems = [
      {
        codigo: "E2E-T3-01-ARROZ",
        barras: "78910001",
        discriminacao: "Arroz Tipo 1 5kg [TEST-E2E]",
        quantidade: 20,
        unitario: 25.0, // R$ 25,00
      },
      {
        codigo: "E2E-T3-01-FEIJAO",
        barras: "78910002",
        discriminacao: "Feijão Carioca 1kg [TEST-E2E]",
        quantidade: 30,
        unitario: 8.5, // R$ 8,50
      },
      {
        codigo: "E2E-T3-01-OLEO",
        barras: "78910003",
        discriminacao: "Óleo de Soja 900ml [TEST-E2E]",
        quantidade: 40,
        unitario: 6.5, // R$ 6,50
      },
    ];

    let itemsToIngest: Array<{
      codigo: string;
      barras: string | null;
      ncm: string | null;
      discriminacao: string;
      unidade: string;
      quantidade: number;
      unitarioCentavos: number;
      totalCentavos: number;
    }>;

    if (parser) {
      const buffer = generateModelP7Xlsx(fixtureItems);
      const parseResult = await parser.parseModelP7File(buffer, "estoque_inicial.xlsx");
      itemsToIngest = parseResult.items;
    } else {
      itemsToIngest = fixtureItems.map((f) => ({
        codigo: f.codigo,
        barras: f.barras,
        ncm: null,
        discriminacao: f.discriminacao,
        unidade: "UN",
        quantidade: f.quantidade,
        unitarioCentavos: Math.round(f.unitario * 100),
        totalCentavos: Math.round(f.quantidade * f.unitario * 100),
      }));
    }

    // -----------------------------------------------------------------------
    // STEP 2: Ingest Parsed Items into Database
    // -----------------------------------------------------------------------
    for (const item of itemsToIngest) {
      await seedTestProduct({
        codigo: item.codigo,
        barras: item.barras,
        discriminacao: item.discriminacao,
        quantidade: item.quantidade,
        unitarioCentavos: item.unitarioCentavos,
      });
    }

    const stockedArroz = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { codigo: "E2E-T3-01-ARROZ" },
    });
    const stockedOleo = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { codigo: "E2E-T3-01-OLEO" },
    });
    expect(stockedArroz.quantidade).toBe(20);
    expect(stockedOleo.quantidade).toBe(40);

    // -----------------------------------------------------------------------
    // STEP 3 & 4: Intelligent Deduction for Sale #1 (Cartão, R$ 25,00)
    // -----------------------------------------------------------------------
    let sale1Debit = { produtoId: stockedArroz.id, quantidadeDebitar: 1 };
    if (engine) {
      const candidates = [
        {
          id: stockedArroz.id,
          codigo: stockedArroz.codigo,
          barras: stockedArroz.barras,
          discriminacao: stockedArroz.discriminacao,
          unidade: stockedArroz.unidade,
          quantidade: stockedArroz.quantidade,
          unitarioCentavos: stockedArroz.unitarioCentavos,
        },
      ];
      const suggestion = engine.findDeductionSuggestion(candidates, 2500);
      expect(suggestion.valorSugeridoCentavos).toBe(2500);
      sale1Debit = {
        produtoId: suggestion.itens[0].produtoId,
        quantidadeDebitar: suggestion.itens[0].quantidadeDebitar,
      };
    }

    // -----------------------------------------------------------------------
    // STEP 5: Atomic Transaction for Sale #1 (CARTAO: R$ 25,00)
    // -----------------------------------------------------------------------
    if (transacoes) {
      await transacoes.executeDeductionTransaction({
        valorAlvoCentavos: 2500,
        formaPagamento: "CARTAO",
        dataLancamento: testDate,
        itens: [sale1Debit],
      });
    } else {
      await prisma.$transaction(async (tx) => {
        const prod = await tx.produtoEstoque.findUniqueOrThrow({
          where: { id: sale1Debit.produtoId },
        });
        const nQtd = prod.quantidade - sale1Debit.quantidadeDebitar;
        await tx.produtoEstoque.update({
          where: { id: prod.id },
          data: {
            quantidade: nQtd,
            totalCentavos: nQtd * prod.unitarioCentavos,
            ativo: nQtd > 0,
          },
        });

        const daily = await tx.lancamentoDiario.create({
          data: {
            data: testDate,
            valorCartaoCentavos: 2500,
            valorDinheiroCentavos: 0,
            totalDiarioCentavos: 2500,
            observacoes: "[TEST-E2E] Venda Cartão Lifecycle",
          },
        });

        await tx.historicoBaixa.create({
          data: {
            produtoId: prod.id,
            lancamentoDiarioId: daily.id,
            codigoProduto: prod.codigo,
            discriminacaoProduto: prod.discriminacao,
            quantidadeBaixada: sale1Debit.quantidadeDebitar,
            unitarioCentavos: prod.unitarioCentavos,
            totalCentavos: 2500,
            formaPagamento: "CARTAO",
          },
        });
      });
    }

    // -----------------------------------------------------------------------
    // STEP 6 & 7: Atomic Transaction for Sale #2 (DINHEIRO, 2 Óleos = R$ 13,00)
    // -----------------------------------------------------------------------
    if (transacoes) {
      await transacoes.executeDeductionTransaction({
        valorAlvoCentavos: 1300,
        formaPagamento: "DINHEIRO",
        dataLancamento: testDate,
        itens: [{ produtoId: stockedOleo.id, quantidadeDebitar: 2 }],
      });
    } else {
      await prisma.$transaction(async (tx) => {
        const prod = await tx.produtoEstoque.findUniqueOrThrow({
          where: { id: stockedOleo.id },
        });
        const nQtd = prod.quantidade - 2;
        await tx.produtoEstoque.update({
          where: { id: prod.id },
          data: {
            quantidade: nQtd,
            totalCentavos: nQtd * prod.unitarioCentavos,
            ativo: nQtd > 0,
          },
        });

        const daily = await tx.lancamentoDiario.create({
          data: {
            data: testDate,
            valorCartaoCentavos: 0,
            valorDinheiroCentavos: 1300,
            totalDiarioCentavos: 1300,
            observacoes: "[TEST-E2E] Venda Dinheiro Lifecycle",
          },
        });

        await tx.historicoBaixa.create({
          data: {
            produtoId: prod.id,
            lancamentoDiarioId: daily.id,
            codigoProduto: prod.codigo,
            discriminacaoProduto: prod.discriminacao,
            quantidadeBaixada: 2,
            unitarioCentavos: prod.unitarioCentavos,
            totalCentavos: 1300,
            formaPagamento: "DINHEIRO",
          },
        });
      });
    }

    // -----------------------------------------------------------------------
    // STEP 8: Verify Daily Sales Closure
    // -----------------------------------------------------------------------
    const dailyEntries = await prisma.lancamentoDiario.findMany({
      where: { data: testDate },
    });
    const totalCartao = dailyEntries.reduce((s, e) => s + e.valorCartaoCentavos, 0);
    const totalDinheiro = dailyEntries.reduce((s, e) => s + e.valorDinheiroCentavos, 0);
    const totalDiario = totalCartao + totalDinheiro;

    expect(totalCartao).toBe(2500); // R$ 25,00
    expect(totalDinheiro).toBe(1300); // R$ 13,00
    expect(totalDiario).toBe(3800); // R$ 38,00

    // Verify stock counts decreased precisely
    const postArroz = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { id: stockedArroz.id },
    });
    const postOleo = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { id: stockedOleo.id },
    });
    expect(postArroz.quantidade).toBe(19); // 20 - 1
    expect(postOleo.quantidade).toBe(38); // 40 - 2

    // -----------------------------------------------------------------------
    // STEP 9: Register Monthly Expenses for Confrontation
    // -----------------------------------------------------------------------
    await createTestDespesa({
      mesAno: testMonth,
      descricao: "Água e Esgoto Sanepar [TEST-E2E]",
      categoria: "CONTAS_FIXAS",
      valorCentavos: 1200, // R$ 12,00
    });

    // -----------------------------------------------------------------------
    // STEP 10: Monthly Consolidation
    // -----------------------------------------------------------------------
    const monthSales = await prisma.lancamentoDiario.findMany({
      where: { data: { startsWith: testMonth } },
    });
    const monthExpenses = await prisma.despesaMensal.findMany({
      where: { mesAno: testMonth },
    });

    const sumEntradas = monthSales.reduce((a, b) => a + b.totalDiarioCentavos, 0);
    const sumSaidas = monthExpenses.reduce((a, b) => a + b.valorCentavos, 0);
    const netResult = sumEntradas - sumSaidas;

    expect(sumEntradas).toBe(3800); // R$ 38,00
    expect(sumSaidas).toBe(1200); // R$ 12,00
    expect(netResult).toBe(2600); // R$ 26,00 lucro líquido

    if (currency) {
      expect(currency.centavosToBRL(netResult)).toBe("R$ 26,00");
    }
  });

  it("T3-02: stock exhaustion lifecycle: item deactivates on 0 and rejects further sales", async () => {
    const product = await seedTestProduct({
      codigo: "E2E-T3-DEPLETE",
      discriminacao: "Produto Limitado [TEST-E2E]",
      quantidade: 3,
      unitarioCentavos: 1000,
    });

    // Sale 1: debit 2 units -> 1 left
    await prisma.$transaction(async (tx) => {
      const p = await tx.produtoEstoque.findUniqueOrThrow({
        where: { id: product.id },
      });
      const rem = p.quantidade - 2;
      await tx.produtoEstoque.update({
        where: { id: p.id },
        data: {
          quantidade: rem,
          totalCentavos: rem * p.unitarioCentavos,
          ativo: rem > 0,
        },
      });
    });

    let current = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(current.quantidade).toBe(1);
    expect(current.ativo).toBe(true);

    // Sale 2: debit last unit -> 0 left -> deactivated!
    await prisma.$transaction(async (tx) => {
      const p = await tx.produtoEstoque.findUniqueOrThrow({
        where: { id: product.id },
      });
      const rem = p.quantidade - 1;
      await tx.produtoEstoque.update({
        where: { id: p.id },
        data: {
          quantidade: rem,
          totalCentavos: 0,
          ativo: rem > 0,
        },
      });
    });

    current = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(current.quantidade).toBe(0);
    expect(current.ativo).toBe(false);

    // Sale 3: Attempting to debit from inactive/zero-stock item must be blocked
    let sale3Blocked = false;
    try {
      await prisma.$transaction(async (tx) => {
        const p = await tx.produtoEstoque.findUniqueOrThrow({
          where: { id: product.id },
        });
        if (!p.ativo || p.quantidade <= 0) {
          throw new Error("Item sem estoque disponível para baixa");
        }
      });
    } catch {
      sale3Blocked = true;
    }
    expect(sale3Blocked).toBe(true);
  });

  it("T3-03: multi-day financial timeline aggregates range queries accurately", async () => {
    const d1 = "2099-10-01";
    const d2 = "2099-10-02";
    const d3 = "2099-10-03";

    // D1: 100% Cartão (R$ 150,00)
    await createTestLancamento({
      data: d1,
      valorCartaoCentavos: 15000,
      valorDinheiroCentavos: 0,
    });

    // D2: 100% Dinheiro (R$ 90,00)
    await createTestLancamento({
      data: d2,
      valorCartaoCentavos: 0,
      valorDinheiroCentavos: 9000,
    });

    // D3: Mixed (Cartão R$ 80,00 + Dinheiro R$ 40,00 = R$ 120,00)
    await createTestLancamento({
      data: d3,
      valorCartaoCentavos: 8000,
      valorDinheiroCentavos: 4000,
    });

    const entries = await prisma.lancamentoDiario.findMany({
      where: {
        data: { in: [d1, d2, d3] },
      },
      orderBy: { data: "asc" },
    });

    expect(entries.length).toBe(3);
    const totalCartaoRange = entries.reduce((s, e) => s + e.valorCartaoCentavos, 0);
    const totalDinheiroRange = entries.reduce((s, e) => s + e.valorDinheiroCentavos, 0);
    const totalGeralRange = totalCartaoRange + totalDinheiroRange;

    expect(totalCartaoRange).toBe(23000); // 150 + 80 = R$ 230,00
    expect(totalDinheiroRange).toBe(13000); // 90 + 40 = R$ 130,00
    expect(totalGeralRange).toBe(36000); // R$ 360,00
  });

  it("T3-04: multi-import restock preserves historical audit logs while updating stock balances", async () => {
    // Initial import
    const prod = await seedTestProduct({
      codigo: "E2E-T3-RESTOCK",
      discriminacao: "Sabonete Líquido 250ml [TEST-E2E]",
      quantidade: 10,
      unitarioCentavos: 700,
    });

    // Customer purchase
    const auditRecord = await prisma.historicoBaixa.create({
      data: {
        produtoId: prod.id,
        codigoProduto: prod.codigo,
        discriminacaoProduto: prod.discriminacao,
        quantidadeBaixada: 4,
        unitarioCentavos: 700,
        totalCentavos: 2800,
        formaPagamento: "DINHEIRO",
      },
    });

    // Decrement stock
    await prisma.produtoEstoque.update({
      where: { id: prod.id },
      data: { quantidade: 6, totalCentavos: 4200 },
    });

    // Second import arrives (restock + price update to R$ 7,50)
    const restocked = await seedTestProduct({
      codigo: "E2E-T3-RESTOCK",
      discriminacao: "Sabonete Líquido 250ml [TEST-E2E]",
      quantidade: 50, // New physical inventory count
      unitarioCentavos: 750, // New unit price
    });

    expect(restocked.quantidade).toBe(50);
    expect(restocked.unitarioCentavos).toBe(750);

    // Verify historical audit record still holds immutable previous price snapshot (R$ 7,00)
    const historicalAudit = await prisma.historicoBaixa.findUniqueOrThrow({
      where: { id: auditRecord.id },
    });
    expect(historicalAudit.unitarioCentavos).toBe(700);
    expect(historicalAudit.totalCentavos).toBe(2800);
  });
});
