import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "../../src/lib/prisma";
import { GET as getDespesas, POST as postDespesas, DELETE as deleteDespesas } from "../../src/app/api/despesas/route";
import { DELETE as deleteDespesaById } from "../../src/app/api/despesas/[id]/route";

describe("API Routes /api/despesas Integration Tests", () => {
  const PREFIX = "TEST-API-DESPESA-";
  const createdDespesaIds: string[] = [];

  const cleanup = async () => {
    try {
      if (createdDespesaIds.length > 0) {
        await prisma.despesaMensal.deleteMany({
          where: { id: { in: createdDespesaIds } },
        });
      }
      await prisma.despesaMensal.deleteMany({
        where: { descricao: { startsWith: PREFIX } },
      });
    } catch (err) {
      console.warn("Cleanup warning in despesas-api.test.ts:", err);
    }
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  function makeRequest(url: string, method: string = "GET", body?: any): NextRequest {
    if (body !== undefined) {
      return new NextRequest(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    return new NextRequest(url, { method });
  }

  describe("POST /api/despesas", () => {
    it("creates a new expense using valorCentavos integer", async () => {
      const payload = {
        descricao: `${PREFIX}Fornecedor Arroz`,
        categoria: "MERCADORIA",
        valorCentavos: 125000, // R$ 1.250,00
        mesAno: "2097-01",
        dataPagamento: "2097-01-05",
      };

      const req = makeRequest("http://localhost:3000/api/despesas", "POST", payload);
      const res = await postDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.despesa.id).toBeDefined();
      expect(data.despesa.descricao).toBe(payload.descricao);
      expect(data.despesa.categoria).toBe("MERCADORIA");
      expect(data.despesa.valorCentavos).toBe(125000);
      expect(data.despesa.valorBRL).toBe("R$ 1.250,00");

      createdDespesaIds.push(data.despesa.id);
    });

    it("creates a new expense using formatted BRL string", async () => {
      const payload = {
        descricao: `${PREFIX}Conta de Luz`,
        categoria: "CONTAS_FIXAS",
        valor: "R$ 450,80",
        mesAno: "2097-01",
      };

      const req = makeRequest("http://localhost:3000/api/despesas", "POST", payload);
      const res = await postDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.despesa.valorCentavos).toBe(45080);
      expect(data.despesa.valorBRL).toBe("R$ 450,80");

      createdDespesaIds.push(data.despesa.id);
    });

    it("rejects invalid category with 400 status", async () => {
      const payload = {
        descricao: `${PREFIX}Invalido`,
        categoria: "CATEGORIA_INEXISTENTE",
        valorCentavos: 1000,
      };

      const req = makeRequest("http://localhost:3000/api/despesas", "POST", payload);
      const res = await postDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Categoria inválida");
    });

    it("rejects missing or empty description with 400 status", async () => {
      const payload = {
        descricao: "   ",
        categoria: "OPERACIONAL",
        valorCentavos: 1000,
      };

      const req = makeRequest("http://localhost:3000/api/despesas", "POST", payload);
      const res = await postDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("descricao");
    });

    it("rejects non-positive monetary amount with 400 status", async () => {
      const payload = {
        descricao: `${PREFIX}Zero`,
        categoria: "OPERACIONAL",
        valorCentavos: 0,
      };

      const req = makeRequest("http://localhost:3000/api/despesas", "POST", payload);
      const res = await postDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe("GET /api/despesas", () => {
    it("lists expenses filtered by mesAno and calculates totals", async () => {
      const mesAno = "2097-02";
      const d1 = await prisma.despesaMensal.create({
        data: {
          mesAno,
          descricao: `${PREFIX}Internet`,
          categoria: "CONTAS_FIXAS",
          valorCentavos: 15000,
        },
      });
      const d2 = await prisma.despesaMensal.create({
        data: {
          mesAno,
          descricao: `${PREFIX}Salários`,
          categoria: "PESSOAL",
          valorCentavos: 250000,
        },
      });
      createdDespesaIds.push(d1.id, d2.id);

      const req = makeRequest(`http://localhost:3000/api/despesas?mesAno=${mesAno}`);
      const res = await getDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.contagem).toBe(2);
      expect(data.totalCentavos).toBe(265000);
      expect(data.totalBRL).toBe("R$ 2.650,00");
    });

    it("filters expenses by category", async () => {
      const mesAno = "2097-03";
      const d = await prisma.despesaMensal.create({
        data: {
          mesAno,
          descricao: `${PREFIX}GPS Tributos`,
          categoria: "IMPOSTOS",
          valorCentavos: 40000,
        },
      });
      createdDespesaIds.push(d.id);

      const req = makeRequest(`http://localhost:3000/api/despesas?mesAno=${mesAno}&categoria=IMPOSTOS`);
      const res = await getDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.despesas.length).toBe(1);
      expect(data.despesas[0].categoria).toBe("IMPOSTOS");
    });
  });

  describe("DELETE /api/despesas", () => {
    it("deletes an expense via query parameter ?id=", async () => {
      const d = await prisma.despesaMensal.create({
        data: {
          mesAno: "2097-04",
          descricao: `${PREFIX}Para Deletar`,
          categoria: "OUTROS",
          valorCentavos: 5000,
        },
      });

      const req = makeRequest(`http://localhost:3000/api/despesas?id=${d.id}`, "DELETE");
      const res = await deleteDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.idExcluido).toBe(d.id);

      const check = await prisma.despesaMensal.findUnique({ where: { id: d.id } });
      expect(check).toBeNull();
    });

    it("returns 404 when deleting a non-existent ID", async () => {
      const req = makeRequest("http://localhost:3000/api/despesas?id=id-inexistente", "DELETE");
      const res = await deleteDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it("deletes an expense via dynamic route [id]", async () => {
      const d = await prisma.despesaMensal.create({
        data: {
          mesAno: "2097-04",
          descricao: `${PREFIX}Para Deletar Dinamico`,
          categoria: "OUTROS",
          valorCentavos: 7000,
        },
      });

      const req = makeRequest(`http://localhost:3000/api/despesas/${d.id}`, "DELETE");
      const res = await deleteDespesaById(req, { params: Promise.resolve({ id: d.id }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.idExcluido).toBe(d.id);

      const check = await prisma.despesaMensal.findUnique({ where: { id: d.id } });
      expect(check).toBeNull();
    });
  });
});
