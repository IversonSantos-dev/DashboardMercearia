import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../../src/lib/prisma";
import {
  getDailySales,
  getDailySalesRange,
  getMonthlyConsolidation,
  getDetailedMonthlyConsolidation,
  CANONICAL_EXPENSE_CATEGORIES,
} from "../../src/modules/financeiro";

describe("Financeiro Module Unit & Contract Tests", () => {
  const PREFIX = "TEST-FIN-MOD-";
  const createdLancamentoIds: string[] = [];
  const createdDespesaIds: string[] = [];

  const cleanup = async () => {
    try {
      if (createdLancamentoIds.length > 0) {
        await prisma.lancamentoDiario.deleteMany({
          where: { id: { in: createdLancamentoIds } },
        });
      }
      await prisma.lancamentoDiario.deleteMany({
        where: { observacoes: { startsWith: PREFIX } },
      });

      if (createdDespesaIds.length > 0) {
        await prisma.despesaMensal.deleteMany({
          where: { id: { in: createdDespesaIds } },
        });
      }
      await prisma.despesaMensal.deleteMany({
        where: { descricao: { startsWith: PREFIX } },
      });
    } catch (err) {
      console.warn("Cleanup warning in financeiro-module.test.ts:", err);
    }
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  async function createLancamento(data: {
    data: string;
    cartao: number;
    dinheiro: number;
    obs?: string;
  }) {
    const l = await prisma.lancamentoDiario.create({
      data: {
        data: data.data,
        valorCartaoCentavos: data.cartao,
        valorDinheiroCentavos: data.dinheiro,
        totalDiarioCentavos: data.cartao + data.dinheiro,
        observacoes: `${PREFIX}${data.obs || "venda"}`,
      },
    });
    createdLancamentoIds.push(l.id);
    return l;
  }

  async function createDespesa(data: {
    mesAno: string;
    descricao: string;
    categoria: string;
    valorCentavos: number;
    dataPagamento?: string;
  }) {
    const d = await prisma.despesaMensal.create({
      data: {
        mesAno: data.mesAno,
        descricao: `${PREFIX}${data.descricao}`,
        categoria: data.categoria,
        valorCentavos: data.valorCentavos,
        dataPagamento: data.dataPagamento || `${data.mesAno}-10`,
      },
    });
    createdDespesaIds.push(d.id);
    return d;
  }

  describe("getDailySales", () => {
    it("returns zeroes for an empty day with no transactions (T2-B22 contract)", async () => {
      const emptyDate = "2098-01-01";
      const res = await getDailySales(emptyDate);

      expect(res).toEqual({
        data: emptyDate,
        totalCartaoCentavos: 0,
        totalDinheiroCentavos: 0,
        totalGeralCentavos: 0,
        quantidadeLancamentos: 0,
      });
    });

    it("aggregates multiple sales entries on the same day correctly", async () => {
      const testDate = "2098-02-15";
      await createLancamento({ data: testDate, cartao: 5000, dinheiro: 2500 });
      await createLancamento({ data: testDate, cartao: 12000, dinheiro: 3000 });

      const res = await getDailySales(testDate);
      expect(res.data).toBe(testDate);
      expect(res.totalCartaoCentavos).toBe(17000);
      expect(res.totalDinheiroCentavos).toBe(5500);
      expect(res.totalGeralCentavos).toBe(22500);
      expect(res.quantidadeLancamentos).toBe(2);
    });

    it("rejects invalid date formats with a clear error", async () => {
      await expect(getDailySales("15-02-2098")).rejects.toThrow(/Data inválida/);
      await expect(getDailySales("")).rejects.toThrow(/Data inválida/);
      await expect(getDailySales("2098/02/15")).rejects.toThrow(/Data inválida/);
    });
  });

  describe("getDailySalesRange", () => {
    it("returns aggregated days within [startDate, endDate] in descending order", async () => {
      const d1 = "2098-03-01";
      const d2 = "2098-03-05";
      const d3 = "2098-03-10";

      await createLancamento({ data: d1, cartao: 1000, dinheiro: 0 });
      await createLancamento({ data: d2, cartao: 0, dinheiro: 2000 });
      await createLancamento({ data: d3, cartao: 3000, dinheiro: 3000 });

      const range = await getDailySalesRange("2098-03-01", "2098-03-07");
      expect(range.length).toBe(2);
      expect(range[0].data).toBe(d2); // Descending order
      expect(range[1].data).toBe(d1);
      expect(range[0].totalDinheiroCentavos).toBe(2000);
      expect(range[1].totalCartaoCentavos).toBe(1000);
    });

    it("rejects invalid date ranges", async () => {
      await expect(getDailySalesRange("invalid", "2098-03-05")).rejects.toThrow(
        /Intervalo de datas inválido/
      );
    });
  });

  describe("getMonthlyConsolidation", () => {
    it("returns zeroes for an empty month without throwing", async () => {
      const emptyMonth = "2098-04";
      const res = await getMonthlyConsolidation(emptyMonth);

      expect(res).toEqual({
        mesAno: emptyMonth,
        totalCartaoCentavos: 0,
        totalDinheiroCentavos: 0,
        totalEntradasCentavos: 0,
        totalSaidasCentavos: 0,
        saldoLiquidoCentavos: 0,
        diasComVendas: 0,
      });
    });

    it("calculates surplus when revenues exceed expenses", async () => {
      const month = "2098-05";
      await createLancamento({ data: `${month}-01`, cartao: 10000, dinheiro: 5000 });
      await createLancamento({ data: `${month}-02`, cartao: 20000, dinheiro: 10000 });
      await createDespesa({
        mesAno: month,
        descricao: "Luz",
        categoria: "CONTAS_FIXAS",
        valorCentavos: 8000,
      });

      const res = await getMonthlyConsolidation(month);
      expect(res.totalCartaoCentavos).toBe(30000);
      expect(res.totalDinheiroCentavos).toBe(15000);
      expect(res.totalEntradasCentavos).toBe(45000);
      expect(res.totalSaidasCentavos).toBe(8000);
      expect(res.saldoLiquidoCentavos).toBe(37000);
      expect(res.diasComVendas).toBe(2);
    });

    it("handles monthly deficit cleanly with negative net balance (T2-B23)", async () => {
      const month = "2098-06";
      await createLancamento({ data: `${month}-01`, cartao: 10000, dinheiro: 0 }); // R$ 100,00
      await createDespesa({
        mesAno: month,
        descricao: "Reforma",
        categoria: "OPERACIONAL",
        valorCentavos: 35000, // R$ 350,00
      });

      const res = await getMonthlyConsolidation(month);
      expect(res.totalEntradasCentavos).toBe(10000);
      expect(res.totalSaidasCentavos).toBe(35000);
      expect(res.saldoLiquidoCentavos).toBe(-25000); // Deficit of -R$ 250,00
    });
  });

  describe("getDetailedMonthlyConsolidation", () => {
    it("returns formatted BRL and category breakdown across canonical categories", async () => {
      const month = "2098-07";
      await createLancamento({ data: `${month}-10`, cartao: 50000, dinheiro: 50000 }); // R$ 1.000,00

      for (const cat of CANONICAL_EXPENSE_CATEGORIES) {
        await createDespesa({
          mesAno: month,
          descricao: `Despesa ${cat}`,
          categoria: cat,
          valorCentavos: 5000, // R$ 50,00
        });
      }

      const res = await getDetailedMonthlyConsolidation(month);
      expect(res.totalEntradasBRL).toBe("R$ 1.000,00");
      expect(res.totalSaidasBRL).toBe("R$ 300,00"); // 6 x 50
      expect(res.saldoLiquidoBRL).toBe("R$ 700,00");
      expect(res.despesasPorCategoria.length).toBe(6);
      expect(res.quantidadeDespesas).toBe(6);
      expect(res.percentualCartao).toBe(50);
      expect(res.percentualDinheiro).toBe(50);
    });
  });
});
