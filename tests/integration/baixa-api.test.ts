import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "../../src/lib/prisma";
import { POST as postSugestao } from "../../src/app/api/baixa/sugestao/route";
import { POST as postExecutar } from "../../src/app/api/baixa/executar/route";
import { GET as getHistorico } from "../../src/app/api/baixa/historico/route";

describe("API Routes /api/baixa Integration Tests", () => {
  const PREFIX = "TEST-API-BAIXA-";
  const createdProductIds: string[] = [];
  const createdLancamentoIds: string[] = [];
  const createdHistoricoIds: string[] = [];

  const cleanupRecords = async () => {
    try {
      if (createdHistoricoIds.length > 0) {
        await prisma.historicoBaixa.deleteMany({
          where: { id: { in: createdHistoricoIds } },
        });
      }
      await prisma.historicoBaixa.deleteMany({
        where: { codigoProduto: { startsWith: PREFIX } },
      });

      if (createdLancamentoIds.length > 0) {
        await prisma.lancamentoDiario.deleteMany({
          where: { id: { in: createdLancamentoIds } },
        });
      }
      await prisma.lancamentoDiario.deleteMany({
        where: { observacoes: { startsWith: PREFIX } },
      });

      if (createdProductIds.length > 0) {
        await prisma.produtoEstoque.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      await prisma.produtoEstoque.deleteMany({
        where: { codigo: { startsWith: PREFIX } },
      });
    } catch (err) {
      console.warn("Cleanup warning in baixa-api.test.ts:", err);
    }
  };

  beforeAll(async () => {
    await cleanupRecords();
  });

  afterAll(async () => {
    await cleanupRecords();
  });

  async function createTestProduct(data: {
    codigo: string;
    discriminacao: string;
    quantidade: number;
    unitarioCentavos: number;
    ativo?: boolean;
  }) {
    const fullCode = `${PREFIX}${data.codigo}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const prod = await prisma.produtoEstoque.create({
      data: {
        codigo: fullCode,
        discriminacao: data.discriminacao,
        quantidade: data.quantidade,
        unitarioCentavos: data.unitarioCentavos,
        totalCentavos: data.quantidade * data.unitarioCentavos,
        ativo: data.ativo ?? true,
      },
    });
    createdProductIds.push(prod.id);
    return prod;
  }

  function makePostRequest(url: string, body: any): NextRequest {
    return new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function makeGetRequest(url: string): NextRequest {
    return new NextRequest(url, {
      method: "GET",
    });
  }

  // =========================================================================
  // Suite A: POST /api/baixa/sugestao
  // =========================================================================
  describe("Suite A: POST /api/baixa/sugestao", () => {
    it("I-API-01: returns 200 OK with exact suggestion for integer valorAlvoCentavos", async () => {
      const prod = await createTestProduct({
        codigo: "SUG-INT",
        discriminacao: "Arroz API Teste",
        quantidade: 10,
        unitarioCentavos: 2550, // R$ 25,50
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoCentavos: 2550,
        formaPagamento: "CARTAO",
      });

      const res = await postSugestao(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.sugestao.valorAlvoCentavos).toBe(2550);
      expect(json.sugestao.valorSugeridoCentavos).toBe(2550);
      expect(json.sugestao.deltaCentavos).toBe(0);
      expect(json.sugestao.itens.length).toBeGreaterThanOrEqual(1);
      expect(json.sugestao.itens[0]).toHaveProperty("quantidadeDisponivel");
      expect(json.sugestao.itens[0]).toHaveProperty("unitarioBRL");
      expect(json.sugestao.itens[0]).toHaveProperty("totalItemBRL");
      expect(json.tempoExecucaoMs).toBeDefined();
    });

    it("I-API-02: returns 200 OK with exact suggestion for BRL string valorAlvoBRL", async () => {
      await createTestProduct({
        codigo: "SUG-BRL",
        discriminacao: "Feijão API Teste",
        quantidade: 10,
        unitarioCentavos: 850,
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoBRL: "R$ 8,50",
        formaPagamento: "DINHEIRO",
      });

      const res = await postSugestao(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.sugestao.valorAlvoCentavos).toBe(850);
      expect(json.sugestao.valorAlvoBRL).toBe("R$ 8,50");
    });

    it("I-API-03: returns 400 Bad Request on negative or non-numeric target value", async () => {
      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoCentavos: -100,
        formaPagamento: "CARTAO",
      });

      const res = await postSugestao(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it("I-API-04: returns 400 Bad Request on invalid formaPagamento", async () => {
      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoCentavos: 1000,
        formaPagamento: "BITCOIN",
      });

      const res = await postSugestao(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("I-API-05: returns 400 Bad Request when request body is empty", async () => {
      const req = new NextRequest("http://localhost:3000/api/baixa/sugestao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });

      const res = await postSugestao(req);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Suite B: POST /api/baixa/executar
  // =========================================================================
  describe("Suite B: POST /api/baixa/executar", () => {
    it("I-API-06: returns 200 OK on successful deduction transaction", async () => {
      const prod = await createTestProduct({
        codigo: "EXEC-OK",
        discriminacao: "Produto Execução OK",
        quantidade: 10,
        unitarioCentavos: 1500,
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2099-06-01",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
        observacoes: `${PREFIX} Execução Sucesso`,
      });

      const res = await postExecutar(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.lancamentoId).toBeDefined();
      expect(json.totalDebitadoCentavos).toBe(3000); // 2 * 1500
      expect(json.totalDebitadoBRL).toBe("R$ 30,00");
      expect(json.itensBaixados).toBe(1);
      expect(json.detalhesItens[0].quantidadeDebitada).toBe(2);
      expect(json.detalhesItens[0].quantidadeRestante).toBe(8);

      createdLancamentoIds.push(json.lancamentoId);
      createdHistoricoIds.push(...json.historicoIds);
    });

    it("I-API-07: returns 400 Bad Request on empty itens array or negative quantity", async () => {
      const reqEmpty = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2099-06-01",
        itens: [],
      });

      const resEmpty = await postExecutar(reqEmpty);
      expect(resEmpty.status).toBe(400);

      const reqNegative = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2099-06-01",
        itens: [{ produtoId: "pid-1", quantidadeDebitar: -5 }],
      });

      const resNegative = await postExecutar(reqNegative);
      expect(resNegative.status).toBe(400);
    });

    it("I-API-08: returns 422 Unprocessable Entity when requested quantity exceeds stock", async () => {
      const prod = await createTestProduct({
        codigo: "EXEC-OVER",
        discriminacao: "Produto Saldo Baixo",
        quantidade: 2,
        unitarioCentavos: 1000,
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "DINHEIRO",
        data: "2099-06-01",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 10 }],
      });

      const res = await postExecutar(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("insuficiente");
    });

    it("I-API-09: returns 404 Not Found when product ID does not exist", async () => {
      const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2099-06-01",
        itens: [{ produtoId: "non-existent-id-9999", quantidadeDebitar: 1 }],
      });

      const res = await postExecutar(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("não encontrado");
    });

    it("I-API-10: merges duplicate produtoId items in payload and deducts correctly", async () => {
      const prod = await createTestProduct({
        codigo: "EXEC-DUP",
        discriminacao: "Produto Duplicado Payload",
        quantidade: 10,
        unitarioCentavos: 500,
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2099-06-02",
        itens: [
          { produtoId: prod.id, quantidadeDebitar: 1 },
          { produtoId: prod.id, quantidadeDebitar: 2 },
        ],
        observacoes: `${PREFIX} Duplicados Payload`,
      });

      const res = await postExecutar(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      createdLancamentoIds.push(json.lancamentoId);
      createdHistoricoIds.push(...json.historicoIds);

      const updated = await prisma.produtoEstoque.findUnique({ where: { id: prod.id } });
      expect(updated?.quantidade).toBe(7); // 10 - (1 + 2) = 7
    });
  });

  // =========================================================================
  // Suite C: GET /api/baixa/historico
  // =========================================================================
  describe("Suite C: GET /api/baixa/historico", () => {
    it("I-API-11: returns 200 OK with audit list filtered by date", async () => {
      const prod = await createTestProduct({
        codigo: "HIST-DATE",
        discriminacao: "Produto Histórico Data",
        quantidade: 10,
        unitarioCentavos: 2000,
      });

      const testDate = "2099-07-15";
      const execReq = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: testDate,
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        observacoes: `${PREFIX} Histórico Data Test`,
      });

      const execRes = await postExecutar(execReq);
      const execJson = await execRes.json();
      createdLancamentoIds.push(execJson.lancamentoId);
      createdHistoricoIds.push(...execJson.historicoIds);

      // Query by date
      const getReq = makeGetRequest(`http://localhost:3000/api/baixa/historico?data=${testDate}`);
      const getRes = await getHistorico(getReq);
      expect(getRes.status).toBe(200);

      const json = await getRes.json();
      expect(json.success).toBe(true);
      expect(json.historico.length).toBeGreaterThanOrEqual(1);
      expect(json.totais.valorTotalCentavos).toBeGreaterThanOrEqual(2000);
      expect(json.totais.valorTotalBRL).toBeDefined();
    });

    it("I-API-12: returns 200 OK with pagination metadata", async () => {
      const getReq = makeGetRequest("http://localhost:3000/api/baixa/historico?limit=5&offset=0");
      const getRes = await getHistorico(getReq);
      expect(getRes.status).toBe(200);

      const json = await getRes.json();
      expect(json.paginacao).toBeDefined();
      expect(json.paginacao.limit).toBe(5);
      expect(json.paginacao.offset).toBe(0);
      expect(json.paginacao.totalRegistros).toBeGreaterThanOrEqual(0);
      expect(typeof json.paginacao.temMais).toBe("boolean");
    });

    it("I-API-13: returns 200 OK filtered by formaPagamento", async () => {
      const getReq = makeGetRequest("http://localhost:3000/api/baixa/historico?formaPagamento=DINHEIRO");
      const getRes = await getHistorico(getReq);
      expect(getRes.status).toBe(200);

      const json = await getRes.json();
      expect(json.success).toBe(true);
      for (const entry of json.historico) {
        expect(entry.formaPagamento).toBe("DINHEIRO");
      }
    });

    it("I-API-14: returns 200 OK filtered by product codigo", async () => {
      const prod = await createTestProduct({
        codigo: "HIST-COD",
        discriminacao: "Produto Código Específico",
        quantidade: 10,
        unitarioCentavos: 1100,
      });

      const execReq = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "DINHEIRO",
        data: "2099-07-20",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        observacoes: `${PREFIX} Histórico Código`,
      });

      const execRes = await postExecutar(execReq);
      const execJson = await execRes.json();
      createdLancamentoIds.push(execJson.lancamentoId);
      createdHistoricoIds.push(...execJson.historicoIds);

      const getReq = makeGetRequest(`http://localhost:3000/api/baixa/historico?codigo=${encodeURIComponent(prod.codigo)}`);
      const getRes = await getHistorico(getReq);
      expect(getRes.status).toBe(200);

      const json = await getRes.json();
      expect(json.historico.length).toBe(1);
      expect(json.historico[0].codigoProduto).toBe(prod.codigo);
    });
  });
});
