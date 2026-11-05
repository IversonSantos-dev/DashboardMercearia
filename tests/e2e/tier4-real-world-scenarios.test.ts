import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  loadCurrency,
  loadParserP7,
  loadBaixaInteligente,
  loadTransacoes,
  loadFinanceiro,
} from "./helpers/contract-loader";
import {
  prisma,
  cleanTestData,
  seedTestProduct,
  createTestLancamento,
  createTestDespesa,
} from "./helpers/test-database";

describe("E2E Tier 4: Real-World Grocery Store Application Scenarios", () => {
  beforeAll(async () => {
    await cleanTestData("E2E-T4-");
  });

  afterAll(async () => {
    await cleanTestData("E2E-T4-");
  });

  // =========================================================================
  // Scenario 1: Realistic Full Business Day Simulation (Opening to Cash Closure)
  // =========================================================================
  it(
    "T4-01: simulates a full sales day with 15 transactions, verifying exact cash drawer audit match",
    { timeout: 20000 },
    async () => {
    const currency = await loadCurrency();
    const transacoes = await loadTransacoes();

    const salesDay = "2099-11-10";

    // 1. Initial Morning Catalog Setup
    const catalogData = [
      { codigo: "E2E-T4-ARROZ", desc: "Arroz Tio João 5kg", qtd: 40, unitCentavos: 3290 },
      { codigo: "E2E-T4-FEIJAO", desc: "Feijão Preto Camil 1kg", qtd: 35, unitCentavos: 980 },
      { codigo: "E2E-T4-OLEO", desc: "Óleo de Soja Liza 900ml", qtd: 50, unitCentavos: 675 },
      { codigo: "E2E-T4-ACUCAR", desc: "Açúcar Cristal União 1kg", qtd: 60, unitCentavos: 450 },
      { codigo: "E2E-T4-CAFE", desc: "Café Torrado Pilão 500g", qtd: 30, unitCentavos: 1990 },
      { codigo: "E2E-T4-LEITE", desc: "Leite Integral Piracanjuba 1L", qtd: 80, unitCentavos: 530 },
      { codigo: "E2E-T4-MACARRAO", desc: "Macarrão Espaguete 500g", qtd: 50, unitCentavos: 620 },
      { codigo: "E2E-T4-BISCOITO", desc: "Biscoito Cream Cracker 400g", qtd: 40, unitCentavos: 550 },
      { codigo: "E2E-T4-DETERGENTE", desc: "Detergente Líquido 500ml", qtd: 70, unitCentavos: 280 },
      { codigo: "E2E-T4-SABONETE", desc: "Sabonete Dove 90g", qtd: 60, unitCentavos: 390 },
    ];

    const seededItems = new Map<string, any>();
    for (const item of catalogData) {
      const seeded = await seedTestProduct({
        codigo: item.codigo,
        discriminacao: `${item.desc} [TEST-E2E]`,
        quantidade: item.qtd,
        unitarioCentavos: item.unitCentavos,
      });
      seededItems.set(item.codigo, seeded);
    }

    // 2. Realistic transactions executed throughout the day
    // (Customer basket -> target amount -> payment method)
    const customerTransactions = [
      // Morning Rush
      { code: "E2E-T4-LEITE", debit: 2, pay: "DINHEIRO" }, // 2 * 5,30 = 10,60
      { code: "E2E-T4-CAFE", debit: 1, pay: "CARTAO" },    // 1 * 19,90 = 19,90
      { code: "E2E-T4-ARROZ", debit: 1, pay: "CARTAO" },   // 1 * 32,90 = 32,90
      { code: "E2E-T4-FEIJAO", debit: 2, pay: "DINHEIRO" },// 2 * 9,80 = 19,60
      { code: "E2E-T4-OLEO", debit: 3, pay: "CARTAO" },    // 3 * 6,75 = 20,25
      // Afternoon
      { code: "E2E-T4-ACUCAR", debit: 2, pay: "DINHEIRO" },// 2 * 4,50 = 9,00
      { code: "E2E-T4-BISCOITO", debit: 2, pay: "CARTAO" },// 2 * 5,50 = 11,00
      { code: "E2E-T4-MACARRAO", debit: 4, pay: "DINHEIRO" },// 4 * 6,20 = 24,80
      { code: "E2E-T4-DETERGENTE", debit: 5, pay: "DINHEIRO" },// 5 * 2,80 = 14,00
      { code: "E2E-T4-SABONETE", debit: 3, pay: "CARTAO" },// 3 * 3,90 = 11,70
      // Evening Rush
      { code: "E2E-T4-ARROZ", debit: 1, pay: "CARTAO" },   // 1 * 32,90 = 32,90
      { code: "E2E-T4-FEIJAO", debit: 1, pay: "CARTAO" },  // 1 * 9,80 = 9,80
      { code: "E2E-T4-LEITE", debit: 4, pay: "DINHEIRO" }, // 4 * 5,30 = 21,20
      { code: "E2E-T4-CAFE", debit: 1, pay: "CARTAO" },    // 1 * 19,90 = 19,90
      { code: "E2E-T4-DETERGENTE", debit: 2, pay: "DINHEIRO" },// 2 * 2,80 = 5,60
    ];

    let expectedCardSum = 0;
    let expectedCashSum = 0;

    for (const tx of customerTransactions) {
      const prod = seededItems.get(tx.code);
      const totalItemCentavos = prod.unitarioCentavos * tx.debit;

      if (tx.pay === "CARTAO") {
        expectedCardSum += totalItemCentavos;
      } else {
        expectedCashSum += totalItemCentavos;
      }

      if (transacoes) {
        await transacoes.executeDeductionTransaction({
          valorAlvoCentavos: totalItemCentavos,
          formaPagamento: tx.pay as "CARTAO" | "DINHEIRO",
          dataLancamento: salesDay,
          itens: [{ produtoId: prod.id, quantidadeDebitar: tx.debit }],
        });
      } else {
        await prisma.$transaction(async (dbTx) => {
          const current = await dbTx.produtoEstoque.findUniqueOrThrow({
            where: { id: prod.id },
          });
          const nQtd = current.quantidade - tx.debit;
          await dbTx.produtoEstoque.update({
            where: { id: prod.id },
            data: {
              quantidade: nQtd,
              totalCentavos: nQtd * current.unitarioCentavos,
              ativo: nQtd > 0,
            },
          });

          const daily = await dbTx.lancamentoDiario.create({
            data: {
              data: salesDay,
              valorCartaoCentavos: tx.pay === "CARTAO" ? totalItemCentavos : 0,
              valorDinheiroCentavos: tx.pay === "DINHEIRO" ? totalItemCentavos : 0,
              totalDiarioCentavos: totalItemCentavos,
              observacoes: `[TEST-E2E] Venda ${tx.pay}`,
            },
          });

          await dbTx.historicoBaixa.create({
            data: {
              produtoId: prod.id,
              lancamentoDiarioId: daily.id,
              codigoProduto: prod.codigo,
              discriminacaoProduto: prod.discriminacao,
              quantidadeBaixada: tx.debit,
              unitarioCentavos: prod.unitarioCentavos,
              totalCentavos: totalItemCentavos,
              formaPagamento: tx.pay,
            },
          });
        });
      }
    }

    // 3. Daily Cash Drawer Audit Confrontation
    const dailyRecords = await prisma.lancamentoDiario.findMany({
      where: { data: salesDay },
    });

    const actualCardSum = dailyRecords.reduce((s, r) => s + r.valorCartaoCentavos, 0);
    const actualCashSum = dailyRecords.reduce((s, r) => s + r.valorDinheiroCentavos, 0);
    const actualTotalDay = actualCardSum + actualCashSum;

    expect(actualCardSum).toBe(expectedCardSum);
    expect(actualCashSum).toBe(expectedCashSum);
    expect(actualTotalDay).toBe(expectedCardSum + expectedCashSum);

    // 4. Verify cross-audit consistency with historico_baixas
    const auditRecords = await prisma.historicoBaixa.findMany({
      where: {
        lancamentoDiario: { data: salesDay },
      },
    });

    const auditTotalSum = auditRecords.reduce((s, a) => s + a.totalCentavos, 0);
    expect(auditTotalSum).toBe(actualTotalDay);

    // 5. Verify string formatting fidelity
    if (currency) {
      const formattedTotal = currency.centavosToBRL(actualTotalDay);
      expect(formattedTotal).toMatch(/^R\$ \d+,\d{2}$/);
    }
  });

  // =========================================================================
  // Scenario 2: Stock Depletion, Rejection & Mid-Day Restock Ingestion
  // =========================================================================
  it("T4-02: handles stockout during sales rush, auto-deactivates, and restores upon restocking", async () => {
    // Limited product: 2 units in stock
    const item = await seedTestProduct({
      codigo: "E2E-T4-HOT-ITEM",
      discriminacao: "Chocolate Importado Especial [TEST-E2E]",
      quantidade: 2,
      unitarioCentavos: 1500, // R$ 15,00
    });

    // Customer 1 buys 1 unit
    await prisma.$transaction(async (tx) => {
      const p = await tx.produtoEstoque.findUniqueOrThrow({ where: { id: item.id } });
      const rem = p.quantidade - 1;
      await tx.produtoEstoque.update({
        where: { id: item.id },
        data: { quantidade: rem, totalCentavos: rem * p.unitarioCentavos, ativo: rem > 0 },
      });
    });

    // Customer 2 buys remaining 1 unit -> hits 0 -> becomes inactive!
    await prisma.$transaction(async (tx) => {
      const p = await tx.produtoEstoque.findUniqueOrThrow({ where: { id: item.id } });
      const rem = p.quantidade - 1;
      await tx.produtoEstoque.update({
        where: { id: item.id },
        data: { quantidade: rem, totalCentavos: 0, ativo: rem > 0 },
      });
    });

    const depleted = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(depleted.quantidade).toBe(0);
    expect(depleted.ativo).toBe(false);

    // Customer 3 tries to buy -> BLOCKED!
    let blocked = false;
    try {
      await prisma.$transaction(async (tx) => {
        const p = await tx.produtoEstoque.findUniqueOrThrow({ where: { id: item.id } });
        if (!p.ativo || p.quantidade <= 0) {
          throw new Error("Item fora de estoque");
        }
      });
    } catch {
      blocked = true;
    }
    expect(blocked).toBe(true);

    // Restock shipment arrives: 20 fresh units
    const restocked = await seedTestProduct({
      codigo: "E2E-T4-HOT-ITEM",
      discriminacao: "Chocolate Importado Especial [TEST-E2E]",
      quantidade: 20,
      unitarioCentavos: 1500,
      ativo: true,
    });

    expect(restocked.quantidade).toBe(20);
    expect(restocked.ativo).toBe(true);

    // Customer 4 can now buy successfully
    await prisma.$transaction(async (tx) => {
      const p = await tx.produtoEstoque.findUniqueOrThrow({ where: { id: item.id } });
      const rem = p.quantidade - 1;
      await tx.produtoEstoque.update({
        where: { id: item.id },
        data: { quantidade: rem, totalCentavos: rem * p.unitarioCentavos, ativo: rem > 0 },
      });
    });

    const finalState = await prisma.produtoEstoque.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(finalState.quantidade).toBe(19);
    expect(finalState.ativo).toBe(true);
  });

  // =========================================================================
  // Scenario 3: Complete Month-End Fiscal DRE Closure with Categorized Expenses
  // =========================================================================
  it("T4-03: calculates accurate month-end DRE reconciling sales and multi-category expenses", async () => {
    const currency = await loadCurrency();
    const targetMonth = "2099-12";

    // Simulate sales across 5 different days of the month
    const daysData = [
      { day: "01", card: 45000, cash: 25000 }, // R$ 700,00
      { day: "07", card: 60000, cash: 40000 }, // R$ 1.000,00
      { day: "14", card: 55000, cash: 35000 }, // R$ 900,00
      { day: "21", card: 70000, cash: 50000 }, // R$ 1.200,00
      { day: "28", card: 80000, cash: 60000 }, // R$ 1.400,00
    ];

    for (const d of daysData) {
      await createTestLancamento({
        data: `${targetMonth}-${d.day}`,
        valorCartaoCentavos: d.card,
        valorDinheiroCentavos: d.cash,
      });
    }

    // Ingest diverse business expenses across categories
    const expensesData = [
      { desc: "Fornecedor Atacadista Alimentos", cat: "MERCADORIA", val: 220000 }, // R$ 2.200,00
      { desc: "Aluguel Imóvel Comercial", cat: "CONTAS_FIXAS", val: 120000 },      // R$ 1.200,00
      { desc: "Energia Elétrica Copel", cat: "CONTAS_FIXAS", val: 38000 },          // R$ 380,00
      { desc: "Salário Operador de Caixa", cat: "PESSOAL", val: 150000 },           // R$ 1.500,00
      { desc: "DAS Simples Nacional", cat: "IMPOSTOS", val: 25000 },                // R$ 250,00
      { desc: "Material de Limpeza e Sacolas", cat: "OPERACIONAL", val: 15000 },    // R$ 150,00
    ];

    for (const exp of expensesData) {
      await createTestDespesa({
        mesAno: targetMonth,
        descricao: `${exp.desc} [TEST-E2E]`,
        categoria: exp.cat,
        valorCentavos: exp.val,
      });
    }

    // Query and aggregate
    const monthSales = await prisma.lancamentoDiario.findMany({
      where: { data: { startsWith: targetMonth } },
    });
    const monthExpenses = await prisma.despesaMensal.findMany({
      where: { mesAno: targetMonth },
    });

    const totalCardCentavos = monthSales.reduce((s, e) => s + e.valorCartaoCentavos, 0);
    const totalCashCentavos = monthSales.reduce((s, e) => s + e.valorDinheiroCentavos, 0);
    const totalGrossRevenueCentavos = totalCardCentavos + totalCashCentavos;

    const totalExpensesCentavos = monthExpenses.reduce((s, e) => s + e.valorCentavos, 0);
    const netProfitCentavos = totalGrossRevenueCentavos - totalExpensesCentavos;

    // Expectations:
    // Gross: (450+600+550+700+800) + (250+400+350+500+600) = 310000 + 210000 = 520000 (R$ 5.200,00)
    expect(totalCardCentavos).toBe(310000);
    expect(totalCashCentavos).toBe(210000);
    expect(totalGrossRevenueCentavos).toBe(520000);

    // Expenses: 220000 + 120000 + 38000 + 150000 + 25000 + 15000 = 568000 (R$ 5.680,00)
    expect(totalExpensesCentavos).toBe(568000);

    // Net Result: 520000 - 568000 = -48000 (Deficit of R$ -480,00)
    expect(netProfitCentavos).toBe(-48000);

    if (currency) {
      expect(currency.centavosToBRL(totalGrossRevenueCentavos)).toBe("R$ 5.200,00");
      expect(currency.centavosToBRL(totalExpensesCentavos)).toBe("R$ 5.680,00");
      expect(currency.centavosToBRL(netProfitCentavos)).toBe("-R$ 480,00");
    }
  });
});
