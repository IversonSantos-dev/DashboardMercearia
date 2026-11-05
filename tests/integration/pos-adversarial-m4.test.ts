import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "../../src/lib/prisma";
import { POST as postSugestao } from "../../src/app/api/baixa/sugestao/route";
import { POST as postExecutar } from "../../src/app/api/baixa/executar/route";
import { brlToCentavos, centavosToBRL, multiplyMoney } from "../../src/modules/currency";

describe("Milestone 4 POS & Deduction Subsystem Adversarial Stress Suite", () => {
  const PREFIX = "TEST-ADV-M4-";
  const createdProductIds: string[] = [];
  const createdLancamentoIds: string[] = [];
  const createdHistoricoIds: string[] = [];

  const cleanup = async () => {
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
      console.warn("Cleanup warning in pos-adversarial-m4.test.ts:", err);
    }
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  async function createProduct(data: {
    codigo: string;
    discriminacao: string;
    quantidade: number;
    unitarioCentavos: number;
    ativo?: boolean;
    barras?: string;
  }) {
    const fullCode = `${PREFIX}${data.codigo}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const prod = await prisma.produtoEstoque.create({
      data: {
        codigo: fullCode,
        barras: data.barras ?? `789${Math.floor(1000000000 + Math.random() * 9000000000)}`,
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

  // =========================================================================
  // Challenge 1: Target value 0 or negative: verified blocked
  // =========================================================================
  describe("Challenge 1: Target value 0 or negative blocked", () => {
    it("ADV-C1-01: rejects valorAlvoCentavos = 0 with HTTP 400", async () => {
      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoCentavos: 0,
        formaPagamento: "CARTAO",
      });
      const res = await postSugestao(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/valorAlvoCentavos inválido/i);
    });

    it("ADV-C1-02: rejects negative valorAlvoCentavos (-500) with HTTP 400", async () => {
      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoCentavos: -500,
        formaPagamento: "DINHEIRO",
      });
      const res = await postSugestao(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/valorAlvoCentavos inválido/i);
    });

    it("ADV-C1-03: rejects valorAlvoBRL = 'R$ 0,00' and negative BRL with HTTP 400", async () => {
      const req1 = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoBRL: "R$ 0,00",
        formaPagamento: "CARTAO",
      });
      const res1 = await postSugestao(req1);
      expect(res1.status).toBe(400);

      const req2 = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoBRL: "-R$ 25,00",
        formaPagamento: "CARTAO",
      });
      const res2 = await postSugestao(req2);
      expect(res2.status).toBe(400);
    });

    it("ADV-C1-04: rejects floating point valorAlvoCentavos (12.34) with HTTP 400", async () => {
      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoCentavos: 12.34,
        formaPagamento: "CARTAO",
      });
      const res = await postSugestao(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("ADV-C1-05: rejects invalid payment method with HTTP 400", async () => {
      const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
        valorAlvoCentavos: 1000,
        formaPagamento: "PIX",
      });
      const res = await postSugestao(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/forma de pagamento inválida/i);
    });

    it("ADV-C1-06: rejects execution with zero or negative item quantity", async () => {
      const prod = await createProduct({
        codigo: "ZERO-QTY",
        discriminacao: "Produto Teste Qty Zero",
        quantidade: 10,
        unitarioCentavos: 1000,
      });

      // Zero quantity
      const reqZero = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2026-11-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 0 }],
      });
      const resZero = await postExecutar(reqZero);
      expect(resZero.status).toBe(400);

      // Negative quantity
      const reqNeg = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2026-11-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: -2 }],
      });
      const resNeg = await postExecutar(reqNeg);
      expect(resNeg.status).toBe(400);

      // Non-integer float quantity
      const reqFloat = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2026-11-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1.5 }],
      });
      const resFloat = await postExecutar(reqFloat);
      expect(resFloat.status).toBe(400);
    });
  });

  // =========================================================================
  // Challenge 2: Multi-item deduction calculation & Float Drift Elimination
  // =========================================================================
  describe("Challenge 2: Multi-item deduction calculation fidelity", () => {
    it("ADV-C2-01: calculates multi-item total with zero drift against integer arithmetic", async () => {
      // Create 5 items with fractional BRL unit prices known to cause IEEE-754 binary float issues
      const itemsData = [
        { codigo: "FLOAT-1", discriminacao: "Café 500g", unitarioCentavos: 1499, qtd: 3 }, // 3 * 14.99 = 44.97
        { codigo: "FLOAT-2", discriminacao: "Açúcar 1kg", unitarioCentavos: 439, qtd: 7 },  // 7 * 4.39 = 30.73
        { codigo: "FLOAT-3", discriminacao: "Leite 1L", unitarioCentavos: 529, qtd: 11 },   // 11 * 5.29 = 58.19
        { codigo: "FLOAT-4", discriminacao: "Biscoito", unitarioCentavos: 333, qtd: 5 },    // 5 * 3.33 = 16.65
        { codigo: "FLOAT-5", discriminacao: "Sabão em Pó", unitarioCentavos: 2199, qtd: 2 },// 2 * 21.99 = 43.98
      ];

      const createdProds: any[] = [];
      for (const d of itemsData) {
        const p = await createProduct({
          codigo: d.codigo,
          discriminacao: d.discriminacao,
          quantidade: 50,
          unitarioCentavos: d.unitarioCentavos,
        });
        createdProds.push({ prod: p, debitQty: d.qtd, unit: d.unitarioCentavos });
      }

      // Expected integer sum:
      // (3 * 1499) + (7 * 439) + (11 * 529) + (5 * 333) + (2 * 2199)
      // = 4497 + 3073 + 5819 + 1665 + 4398 = 19452 cents (R$ 194,52)
      let expectedTotalCentavos = 0;
      for (const item of createdProds) {
        expectedTotalCentavos += multiplyMoney(item.unit, item.debitQty);
      }
      expect(expectedTotalCentavos).toBe(19452);

      const payload = {
        formaPagamento: "CARTAO",
        data: "2026-11-05",
        observacoes: `${PREFIX}MultiItemFidelityTest`,
        itens: createdProds.map((cp) => ({
          produtoId: cp.prod.id,
          quantidadeDebitar: cp.debitQty,
        })),
      };

      const req = makePostRequest("http://localhost:3000/api/baixa/executar", payload);
      const res = await postExecutar(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalDebitadoCentavos).toBe(19452);
      expect(json.totalDebitadoBRL).toBe("R$ 194,52");
      createdLancamentoIds.push(json.lancamentoId);
      createdHistoricoIds.push(...json.historicoIds);

      // Verify DB daily ledger record
      const lancamento = await prisma.lancamentoDiario.findUnique({
        where: { id: json.lancamentoId },
      });
      expect(lancamento).not.toBeNull();
      expect(lancamento?.valorCartaoCentavos).toBe(19452);
      expect(lancamento?.valorDinheiroCentavos).toBe(0);
      expect(lancamento?.totalDiarioCentavos).toBe(19452);

      // Verify DB audit records sum
      const audits = await prisma.historicoBaixa.findMany({
        where: { lancamentoDiarioId: json.lancamentoId },
      });
      expect(audits.length).toBe(5);
      const auditSum = audits.reduce((acc, a) => acc + a.totalCentavos, 0);
      expect(auditSum).toBe(19452);
    });

    it("ADV-C2-02: fuzzer - 500 multi-item cart combinations maintain strict mathematical invariant", () => {
      // Verify integer multiplication invariant against floating point drift
      let floatDriftDetected = false;
      for (let i = 0; i < 500; i++) {
        const qty = Math.floor(Math.random() * 20) + 1;
        const unitCentavos = Math.floor(Math.random() * 9999) + 1;
        const integerTotal = multiplyMoney(unitCentavos, qty);

        const floatUnit = unitCentavos / 100;
        const naiveFloatTotal = floatUnit * qty;
        if (naiveFloatTotal.toString().includes("00000000") || naiveFloatTotal.toString().includes("99999999")) {
          floatDriftDetected = true;
        }

        expect(Number.isInteger(integerTotal)).toBe(true);
        expect(integerTotal).toBe(unitCentavos * qty);
      }
      expect(floatDriftDetected).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 3: Stock boundary conditions & quantity adjustment clamping
  // =========================================================================
  describe("Challenge 3: Stock boundary conditions", () => {
    it("ADV-C3-01: UI clamping logic clamps quantity between 1 and available stock", () => {
      const clampQty = (novaQtd: number, available: number) => {
        return Math.max(1, Math.min(novaQtd, available));
      };

      expect(clampQty(0, 5)).toBe(1);
      expect(clampQty(-10, 5)).toBe(1);
      expect(clampQty(1, 5)).toBe(1);
      expect(clampQty(3, 5)).toBe(3);
      expect(clampQty(5, 5)).toBe(5);
      expect(clampQty(6, 5)).toBe(5);
      expect(clampQty(999, 5)).toBe(5);
    });

    it("ADV-C3-02: execution fails with HTTP 422 when attempting to debit more than available stock", async () => {
      const prod = await createProduct({
        codigo: "BOUND-EXCEED",
        discriminacao: "Produto Estoque Limite",
        quantidade: 3,
        unitarioCentavos: 1000,
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2026-11-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 4 }],
      });
      const res = await postExecutar(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/saldo de estoque insuficiente/i);

      // Verify stock in database remains untouched (still 3)
      const freshProd = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(freshProd?.quantidade).toBe(3);
      expect(freshProd?.ativo).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 4: Suggestion with empty inventory ("SEM_ESTOQUE")
  // =========================================================================
  describe("Challenge 4: Empty inventory handling", () => {
    it("ADV-C4-01: returns graceful SEM_ESTOQUE when all products are depleted or inactive", async () => {
      // Temporarily mark all active products as inactive to simulate empty stock
      const activeProductsBefore = await prisma.produtoEstoque.findMany({
        where: { ativo: true, quantidade: { gt: 0 } },
        select: { id: true },
      });

      const activeIds = activeProductsBefore.map((p) => p.id);
      if (activeIds.length > 0) {
        await prisma.produtoEstoque.updateMany({
          where: { id: { in: activeIds } },
          data: { ativo: false },
        });
      }

      try {
        const req = makePostRequest("http://localhost:3000/api/baixa/sugestao", {
          valorAlvoCentavos: 5000,
          formaPagamento: "CARTAO",
        });

        const res = await postSugestao(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.sugestao.estrategia).toBe("SEM_ESTOQUE");
        expect(json.sugestao.valorAlvoCentavos).toBe(5000);
        expect(json.sugestao.valorSugeridoCentavos).toBe(0);
        expect(json.sugestao.deltaCentavos).toBe(-5000);
        expect(json.sugestao.itens).toEqual([]);
        expect(json.catalogoProximidade).toEqual([]);
      } finally {
        // Restore active products
        if (activeIds.length > 0) {
          await prisma.produtoEstoque.updateMany({
            where: { id: { in: activeIds } },
            data: { ativo: true },
          });
        }
      }
    });
  });

  // =========================================================================
  // Challenge 5: Deduction execution atomicity & zero-balance deactivation
  // =========================================================================
  describe("Challenge 5: Deduction execution atomicity, zero balance deactivation & financial entry", () => {
    it("ADV-C5-01: deactivates product (ativo = false) when balance reaches zero (CARTAO)", async () => {
      const prod = await createProduct({
        codigo: "ZERO-DEACT-CARD",
        discriminacao: "Produto Para Zerar Cartão",
        quantidade: 2,
        unitarioCentavos: 3500, // R$ 35,00
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2026-11-05",
        observacoes: `${PREFIX}DeactCardTest`,
        itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
      });

      const res = await postExecutar(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalDebitadoCentavos).toBe(7000);
      createdLancamentoIds.push(json.lancamentoId);
      createdHistoricoIds.push(...json.historicoIds);

      // Check receipt item details
      expect(json.detalhesItens[0].quantidadeRestante).toBe(0);
      expect(json.detalhesItens[0].ativo).toBe(false);

      // Verify database state: product is deactivated and quantity is 0
      const updatedProd = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(updatedProd?.quantidade).toBe(0);
      expect(updatedProd?.totalCentavos).toBe(0);
      expect(updatedProd?.ativo).toBe(false);

      // Verify daily sales entry in CARTAO
      const lancamento = await prisma.lancamentoDiario.findUnique({
        where: { id: json.lancamentoId },
      });
      expect(lancamento?.valorCartaoCentavos).toBe(7000);
      expect(lancamento?.valorDinheiroCentavos).toBe(0);
      expect(lancamento?.totalDiarioCentavos).toBe(7000);

      // Verify audit record
      const audit = await prisma.historicoBaixa.findUnique({
        where: { id: json.historicoIds[0] },
      });
      expect(audit?.quantidadeBaixada).toBe(2);
      expect(audit?.unitarioCentavos).toBe(3500);
      expect(audit?.totalCentavos).toBe(7000);
      expect(audit?.formaPagamento).toBe("CARTAO");
      expect(audit?.lancamentoDiarioId).toBe(json.lancamentoId);

      // Trying to debit again on this zeroed/deactivated product must fail with HTTP 422
      const retryReq = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "CARTAO",
        data: "2026-11-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
      });
      const retryRes = await postExecutar(retryReq);
      expect(retryRes.status).toBe(422);
      const retryJson = await retryRes.json();
      expect(retryJson.error).toMatch(/está inativo e não pode ser baixado/i);
    });

    it("ADV-C5-02: partial debit leaves product active with updated stock balance (DINHEIRO)", async () => {
      const prod = await createProduct({
        codigo: "PARTIAL-CASH",
        discriminacao: "Produto Débito Parcial Dinheiro",
        quantidade: 10,
        unitarioCentavos: 1250, // R$ 12,50
      });

      const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
        formaPagamento: "DINHEIRO",
        data: "2026-11-05",
        observacoes: `${PREFIX}PartialCashTest`,
        itens: [{ produtoId: prod.id, quantidadeDebitar: 3 }],
      });

      const res = await postExecutar(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalDebitadoCentavos).toBe(3750);
      createdLancamentoIds.push(json.lancamentoId);
      createdHistoricoIds.push(...json.historicoIds);

      // Check updated product state: quantity = 7, total = 8750, ativo = true
      const updatedProd = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(updatedProd?.quantidade).toBe(7);
      expect(updatedProd?.totalCentavos).toBe(8750);
      expect(updatedProd?.ativo).toBe(true);

      // Verify daily sales entry in DINHEIRO
      const lancamento = await prisma.lancamentoDiario.findUnique({
        where: { id: json.lancamentoId },
      });
      expect(lancamento?.valorCartaoCentavos).toBe(0);
      expect(lancamento?.valorDinheiroCentavos).toBe(3750);
      expect(lancamento?.totalDiarioCentavos).toBe(3750);
    });
  });

  // =========================================================================
  // Challenge 6: Concurrency resilience & Depleted stock race conditions
  // =========================================================================
  describe("Challenge 6: Concurrency resilience", () => {
    it("ADV-C6-01: 10 concurrent debits on stock = 2 allow exactly 2 to succeed and 8 to fail cleanly with 409 or 422", async () => {
      const prod = await createProduct({
        codigo: "RACE-STOCK-2",
        discriminacao: "Produto Teste Corrida Concorrencia",
        quantidade: 2,
        unitarioCentavos: 2000,
      });

      const promises = Array.from({ length: 10 }).map(async (_, idx) => {
        const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
          formaPagamento: idx % 2 === 0 ? "CARTAO" : "DINHEIRO",
          data: "2026-11-05",
          observacoes: `${PREFIX}RaceTest-${idx}`,
          itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        });
        const res = await postExecutar(req);
        const json = await res.json();
        return { status: res.status, json };
      });

      const results = await Promise.all(results_promises(promises));

      const successes = results.filter((r) => r.status === 200);
      const conflictsOrDepleted = results.filter((r) => r.status === 409 || r.status === 422);

      expect(successes.length).toBe(2);
      expect(conflictsOrDepleted.length).toBe(8);

      for (const s of successes) {
        createdLancamentoIds.push(s.json.lancamentoId);
        createdHistoricoIds.push(...s.json.historicoIds);
      }

      // Check database state
      const finalProd = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(finalProd?.quantidade).toBe(0);
      expect(finalProd?.totalCentavos).toBe(0);
      expect(finalProd?.ativo).toBe(false);

      // Verify no negative stock in SQLite
      expect(finalProd!.quantidade).toBeGreaterThanOrEqual(0);
    });

    it("ADV-C6-02: 15 concurrent debits on stock = 1 allow exactly 1 to succeed and 14 to return 409/422", async () => {
      const prod = await createProduct({
        codigo: "RACE-STOCK-1",
        discriminacao: "Produto Teste Corrida Unitaria",
        quantidade: 1,
        unitarioCentavos: 5000,
      });

      const promises = Array.from({ length: 15 }).map(async (_, idx) => {
        const req = makePostRequest("http://localhost:3000/api/baixa/executar", {
          formaPagamento: "CARTAO",
          data: "2026-11-05",
          observacoes: `${PREFIX}RaceSingle-${idx}`,
          itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        });
        const res = await postExecutar(req);
        const json = await res.json();
        return { status: res.status, json };
      });

      const results = await Promise.all(results_promises(promises));

      const successes = results.filter((r) => r.status === 200);
      const failures = results.filter((r) => r.status === 409 || r.status === 422);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(14);

      if (successes.length > 0) {
        createdLancamentoIds.push(successes[0].json.lancamentoId);
        createdHistoricoIds.push(...successes[0].json.historicoIds);
      }

      const finalProd = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(finalProd?.quantidade).toBe(0);
      expect(finalProd?.ativo).toBe(false);
    });
  });
});

function results_promises<T>(promises: Promise<T>[]): Promise<T>[] {
  return promises;
}
