import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "../../src/lib/prisma";
import { GET as getConsolidado } from "../../src/app/api/financeiro/consolidado/route";
import { GET as getMensal } from "../../src/app/api/financeiro/mensal/route";
import { GET as getDiario } from "../../src/app/api/financeiro/diario/route";

describe("API Routes /api/financeiro Integration Tests", () => {
  const PREFIX = "TEST-API-FIN-";
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
      console.warn("Cleanup warning in financeiro-api.test.ts:", err);
    }
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  function makeRequest(url: string): NextRequest {
    return new NextRequest(url, { method: "GET" });
  }

  describe("GET /api/financeiro/consolidado & /api/financeiro/mensal", () => {
    it("returns detailed monthly consolidation for a valid mesAno", async () => {
      const mesAno = "2096-01";
      const l = await prisma.lancamentoDiario.create({
        data: {
          data: `${mesAno}-15`,
          valorCartaoCentavos: 40000,
          valorDinheiroCentavos: 10000,
          totalDiarioCentavos: 50000,
          observacoes: `${PREFIX}venda1`,
        },
      });
      createdLancamentoIds.push(l.id);

      const d = await prisma.despesaMensal.create({
        data: {
          mesAno,
          descricao: `${PREFIX}Aluguel`,
          categoria: "CONTAS_FIXAS",
          valorCentavos: 20000,
        },
      });
      createdDespesaIds.push(d.id);

      const req = makeRequest(`http://localhost:3000/api/financeiro/consolidado?mesAno=${mesAno}`);
      const res = await getConsolidado(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mesAno).toBe(mesAno);
      expect(data.totalEntradasCentavos).toBe(50000);
      expect(data.totalEntradasBRL).toBe("R$ 500,00");
      expect(data.totalSaidasCentavos).toBe(20000);
      expect(data.saldoLiquidoCentavos).toBe(30000);
      expect(data.saldoLiquidoBRL).toBe("R$ 300,00");
      expect(data.despesasPorCategoria).toBeInstanceOf(Array);
      expect(data.despesasPorCategoria.length).toBeGreaterThan(0);
    });

    it("verifies /api/financeiro/mensal alias route produces identical result", async () => {
      const mesAno = "2096-01";
      const req = makeRequest(`http://localhost:3000/api/financeiro/mensal?mesAno=${mesAno}`);
      const res = await getMensal(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.totalEntradasCentavos).toBe(50000);
    });

    it("returns 400 when invalid mesAno format is queried", async () => {
      const req = makeRequest("http://localhost:3000/api/financeiro/consolidado?mesAno=invalid");
      const res = await getConsolidado(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Mês de referência inválido");
    });
  });

  describe("GET /api/financeiro/diario", () => {
    it("returns daily summary and detailed transactions for a single date", async () => {
      const testDate = "2096-02-20";
      const l = await prisma.lancamentoDiario.create({
        data: {
          data: testDate,
          valorCartaoCentavos: 15000,
          valorDinheiroCentavos: 5000,
          totalDiarioCentavos: 20000,
          observacoes: `${PREFIX}venda-diaria`,
        },
      });
      createdLancamentoIds.push(l.id);

      const req = makeRequest(`http://localhost:3000/api/financeiro/diario?data=${testDate}`);
      const res = await getDiario(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBe(testDate);
      expect(data.totalCartaoCentavos).toBe(15000);
      expect(data.totalDinheiroCentavos).toBe(5000);
      expect(data.totalGeralCentavos).toBe(20000);
      expect(data.lancamentos).toBeInstanceOf(Array);
      expect(data.lancamentos.length).toBe(1);
      expect(data.lancamentos[0].id).toBe(l.id);
    });

    it("returns aggregated days for a date range", async () => {
      const d1 = "2096-03-01";
      const d2 = "2096-03-02";

      const l1 = await prisma.lancamentoDiario.create({
        data: {
          data: d1,
          valorCartaoCentavos: 1000,
          valorDinheiroCentavos: 1000,
          totalDiarioCentavos: 2000,
          observacoes: `${PREFIX}range1`,
        },
      });
      const l2 = await prisma.lancamentoDiario.create({
        data: {
          data: d2,
          valorCartaoCentavos: 2000,
          valorDinheiroCentavos: 2000,
          totalDiarioCentavos: 4000,
          observacoes: `${PREFIX}range2`,
        },
      });
      createdLancamentoIds.push(l1.id, l2.id);

      const req = makeRequest(`http://localhost:3000/api/financeiro/diario?dataInicio=${d1}&dataFim=${d2}`);
      const res = await getDiario(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.totaisPeriodo.totalGeralCentavos).toBe(6000);
      expect(data.dias.length).toBe(2);
    });

    it("rejects invalid date with 400 status", async () => {
      const req = makeRequest("http://localhost:3000/api/financeiro/diario?data=invalid-date");
      const res = await getDiario(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
