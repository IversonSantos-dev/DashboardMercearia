import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";

// Route handlers under test
import { POST as postSugestao } from "@/app/api/baixa/sugestao/route";
import { POST as postExecutar } from "@/app/api/baixa/executar/route";
import { GET as getHistorico } from "@/app/api/baixa/historico/route";
import { POST as postImport } from "@/app/api/inventario/import/route";
import { GET as getProdutos } from "@/app/api/inventario/produtos/route";
import { GET as getConsolidado } from "@/app/api/financeiro/consolidado/route";
import { GET as getMensal } from "@/app/api/financeiro/mensal/route";
import { GET as getDiario } from "@/app/api/financeiro/diario/route";
import {
  GET as getDespesas,
  POST as postDespesas,
  DELETE as deleteDespesas,
} from "@/app/api/despesas/route";
import { DELETE as deleteDespesaById } from "@/app/api/despesas/[id]/route";

describe("E2E Tier 5: White-Box API Adversarial Coverage Hardening", () => {
  const PREFIX = "TEST-T5-";
  const createdProductIds: string[] = [];
  const createdLancamentoIds: string[] = [];
  const createdHistoricoIds: string[] = [];
  const createdDespesaIds: string[] = [];

  const cleanupAllSyntheticRecords = async () => {
    try {
      if (createdHistoricoIds.length > 0) {
        await prisma.historicoBaixa.deleteMany({
          where: { id: { in: createdHistoricoIds } },
        });
      }
      await prisma.historicoBaixa.deleteMany({
        where: {
          OR: [
            { codigoProduto: { startsWith: PREFIX } },
            { discriminacaoProduto: { contains: "[TEST-T5]" } },
          ],
        },
      });

      if (createdLancamentoIds.length > 0) {
        await prisma.lancamentoDiario.deleteMany({
          where: { id: { in: createdLancamentoIds } },
        });
      }
      await prisma.lancamentoDiario.deleteMany({
        where: {
          OR: [
            { data: { startsWith: "2099-" } },
            { observacoes: { contains: "[TEST-T5]" } },
          ],
        },
      });

      if (createdDespesaIds.length > 0) {
        await prisma.despesaMensal.deleteMany({
          where: { id: { in: createdDespesaIds } },
        });
      }
      await prisma.despesaMensal.deleteMany({
        where: {
          OR: [
            { mesAno: { startsWith: "2099-" } },
            { descricao: { startsWith: PREFIX } },
          ],
        },
      });

      if (createdProductIds.length > 0) {
        await prisma.produtoEstoque.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      await prisma.produtoEstoque.deleteMany({
        where: {
          OR: [
            { codigo: { startsWith: PREFIX } },
            { discriminacao: { contains: "[TEST-T5]" } },
          ],
        },
      });
    } catch (err) {
      console.warn("Cleanup warning in tier5-whitebox-api.test.ts:", err);
    }
  };

  beforeAll(async () => {
    await cleanupAllSyntheticRecords();
  });

  afterAll(async () => {
    await cleanupAllSyntheticRecords();
  });

  // -------------------------------------------------------------------------
  // Request Builders
  // -------------------------------------------------------------------------
  function makeJsonRequest(
    url: string,
    method: string = "POST",
    body?: any,
    options?: { malformedJson?: boolean; contentType?: string }
  ): NextRequest {
    if (options?.malformedJson) {
      return new NextRequest(url, {
        method,
        headers: { "content-type": options.contentType ?? "application/json" },
        body: "{ bad_json: unquoted, ",
      });
    }

    if (body !== undefined) {
      return new NextRequest(url, {
        method,
        headers: { "content-type": options?.contentType ?? "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
    }

    return new NextRequest(url, {
      method,
      headers: options?.contentType ? { "content-type": options.contentType } : undefined,
    });
  }

  async function seedProduct(data: {
    codigoSuffix: string;
    discriminacao: string;
    quantidade: number;
    unitarioCentavos: number;
    ativo?: boolean;
  }) {
    const fullCode = `${PREFIX}${data.codigoSuffix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const prod = await prisma.produtoEstoque.create({
      data: {
        codigo: fullCode,
        discriminacao: `[TEST-T5] ${data.discriminacao}`,
        quantidade: data.quantidade,
        unitarioCentavos: data.unitarioCentavos,
        totalCentavos: data.quantidade * data.unitarioCentavos,
        ativo: data.ativo ?? true,
      },
    });
    createdProductIds.push(prod.id);
    return prod;
  }

  // =========================================================================
  // GROUP 1: /api/baixa/sugestao White-Box & Adversarial Error Paths
  // =========================================================================
  describe("Group 1: /api/baixa/sugestao Input Validation & Error Paths", () => {
    const url = "http://localhost:3000/api/baixa/sugestao";

    it("returns HTTP 400 when body contains malformed JSON", async () => {
      const req = makeJsonRequest(url, "POST", null, { malformedJson: true });
      const res = await postSugestao(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Corpo da requisição inválido. JSON esperado.");
    });

    it("returns HTTP 400 when body is not an object (e.g. string or array)", async () => {
      const req = makeJsonRequest(url, "POST", "string-body");
      const res = await postSugestao(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it("returns HTTP 400 when target value is completely missing", async () => {
      const req = makeJsonRequest(url, "POST", { formaPagamento: "CARTAO" });
      const res = await postSugestao(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Valor alvo não informado");
    });

    it("returns HTTP 400 for invalid valorAlvoCentavos (non-integer, <= 0, or excessive)", async () => {
      // Float
      let req = makeJsonRequest(url, "POST", {
        valorAlvoCentavos: 12.5,
        formaPagamento: "CARTAO",
      });
      let res = await postSugestao(req);
      expect(res.status).toBe(400);

      // Zero
      req = makeJsonRequest(url, "POST", {
        valorAlvoCentavos: 0,
        formaPagamento: "CARTAO",
      });
      res = await postSugestao(req);
      expect(res.status).toBe(400);

      // Negative
      req = makeJsonRequest(url, "POST", {
        valorAlvoCentavos: -100,
        formaPagamento: "CARTAO",
      });
      res = await postSugestao(req);
      expect(res.status).toBe(400);

      // Exceeds 100_000_000 (R$ 1.000.000,00)
      req = makeJsonRequest(url, "POST", {
        valorAlvoCentavos: 100_000_001,
        formaPagamento: "CARTAO",
      });
      res = await postSugestao(req);
      expect(res.status).toBe(400);
    });

    it("returns HTTP 400 for invalid valorAlvoBRL formats", async () => {
      // Negative BRL
      let req = makeJsonRequest(url, "POST", {
        valorAlvoBRL: "-50,00",
        formaPagamento: "DINHEIRO",
      });
      let res = await postSugestao(req);
      expect(res.status).toBe(400);

      // Garbage string
      req = makeJsonRequest(url, "POST", {
        valorAlvoBRL: "VALOR_INVALIDO",
        formaPagamento: "DINHEIRO",
      });
      res = await postSugestao(req);
      expect(res.status).toBe(400);
    });

    it("returns HTTP 400 for invalid formaPagamento (e.g. PIX, CHEQUE, empty)", async () => {
      const invalidPayments = ["PIX", "BOLETO", "CHEQUE", "", "  ", 123];
      for (const forma of invalidPayments) {
        const req = makeJsonRequest(url, "POST", {
          valorAlvoCentavos: 500,
          formaPagamento: forma,
        });
        const res = await postSugestao(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.success).toBe(false);
        expect(json.error).toContain("Forma de pagamento inválida");
      }
    });

    it("returns HTTP 400 for invalid date format in body.data", async () => {
      const invalidDates = ["05/11/2026", "2026-1-1", "invalid-date", "2026-11-05T12:00:00Z"];
      for (const d of invalidDates) {
        const req = makeJsonRequest(url, "POST", {
          valorAlvoCentavos: 1000,
          formaPagamento: "CARTAO",
          data: d,
        });
        const res = await postSugestao(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.success).toBe(false);
        expect(json.error).toContain("Data inválida");
      }
    });

    it("clamps limiteAlternativas between 1 and 50 and handles successful suggestion", async () => {
      await seedProduct({
        codigoSuffix: "SUG-1",
        discriminacao: "Produto Teste Sugestao 1",
        quantidade: 10,
        unitarioCentavos: 500,
      });

      const req = makeJsonRequest(url, "POST", {
        valorAlvoCentavos: 1500,
        formaPagamento: "CARTAO",
        data: "2099-01-10",
        limiteAlternativas: 9999, // Should be clamped to 50
      });

      const res = await postSugestao(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.sugestao).toBeDefined();
      expect(json.sugestao.valorAlvoCentavos).toBe(1500);
      expect(json.sugestao.valorAlvoBRL).toBe("R$ 15,00");
      expect(Array.isArray(json.catalogoProximidade)).toBe(true);
      expect(json.catalogoProximidade.length).toBeLessThanOrEqual(50);
    });
  });

  // =========================================================================
  // GROUP 2: /api/baixa/executar Error Paths, Concurrency & Rollback
  // =========================================================================
  describe("Group 2: /api/baixa/executar Concurrency, Rollbacks & Error Codes", () => {
    const url = "http://localhost:3000/api/baixa/executar";

    it("returns HTTP 400 on malformed JSON payload", async () => {
      const req = makeJsonRequest(url, "POST", null, { malformedJson: true });
      const res = await postExecutar(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("JSON esperado");
    });

    it("returns HTTP 400 on missing or invalid formaPagamento", async () => {
      const req = makeJsonRequest(url, "POST", {
        formaPagamento: "BITCOIN",
        data: "2099-01-15",
        itens: [{ produtoId: "any", quantidadeDebitar: 1 }],
      });
      const res = await postExecutar(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Forma de pagamento inválida");
    });

    it("returns HTTP 400 on invalid or non-ISO date format", async () => {
      const req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "15/01/2099",
        itens: [{ produtoId: "any", quantidadeDebitar: 1 }],
      });
      const res = await postExecutar(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Data de lançamento inválida");
    });

    it("returns HTTP 400 when itens array is empty, missing, or corrupt", async () => {
      // Empty array
      let req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
        itens: [],
      });
      let res = await postExecutar(req);
      expect(res.status).toBe(400);

      // Missing itens
      req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
      });
      res = await postExecutar(req);
      expect(res.status).toBe(400);

      // Corrupt item (invalid produtoId)
      req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
        itens: [{ produtoId: "", quantidadeDebitar: 1 }],
      });
      res = await postExecutar(req);
      expect(res.status).toBe(400);

      // Corrupt item (non-integer or <= 0 quantidadeDebitar)
      req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
        itens: [{ produtoId: "some-id", quantidadeDebitar: 0 }],
      });
      res = await postExecutar(req);
      expect(res.status).toBe(400);

      req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
        itens: [{ produtoId: "some-id", quantidadeDebitar: -5 }],
      });
      res = await postExecutar(req);
      expect(res.status).toBe(400);

      req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
        itens: [{ produtoId: "some-id", quantidadeDebitar: 2.5 }],
      });
      res = await postExecutar(req);
      expect(res.status).toBe(400);
    });

    it("returns HTTP 404 when product ID does not exist in database", async () => {
      const nonExistentId = "non-existent-prod-id-99999";
      const req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
        itens: [{ produtoId: nonExistentId, quantidadeDebitar: 1 }],
      });
      const res = await postExecutar(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Produto não encontrado");
    });

    it("returns HTTP 422 when target product is inactive (ativo: false)", async () => {
      const inactiveProd = await seedProduct({
        codigoSuffix: "INACTIVE",
        discriminacao: "Produto Inativo Teste",
        quantidade: 10,
        unitarioCentavos: 250,
        ativo: false,
      });

      const req = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-15",
        itens: [{ produtoId: inactiveProd.id, quantidadeDebitar: 1 }],
      });
      const res = await postExecutar(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error).toContain("está inativo e não pode ser baixado");
    });

    it("returns HTTP 422 when stock is insufficient (requested > available)", async () => {
      const lowStockProd = await seedProduct({
        codigoSuffix: "LOW-STOCK",
        discriminacao: "Produto Baixo Estoque Teste",
        quantidade: 2,
        unitarioCentavos: 300,
      });

      const req = makeJsonRequest(url, "POST", {
        formaPagamento: "DINHEIRO",
        data: "2099-01-15",
        itens: [{ produtoId: lowStockProd.id, quantidadeDebitar: 5 }], // 5 > 2
      });
      const res = await postExecutar(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Saldo de estoque insuficiente");
    });

    it("enforces concurrency conflict (HTTP 409 or 422) under rapid duplicate submissions and rolls back cleanly", async () => {
      // Product with stock = 1
      const scarceProd = await seedProduct({
        codigoSuffix: "CONCURRENT",
        discriminacao: "Produto Concorrencia Teste",
        quantidade: 1,
        unitarioCentavos: 750,
      });

      const payload = {
        formaPagamento: "CARTAO",
        data: "2099-01-20",
        observacoes: "[TEST-T5] Concurrency stress test",
        itens: [{ produtoId: scarceProd.id, quantidadeDebitar: 1 }],
      };

      // Fire 2 simultaneous executions
      const [res1, res2] = await Promise.all([
        postExecutar(makeJsonRequest(url, "POST", payload)),
        postExecutar(makeJsonRequest(url, "POST", payload)),
      ]);

      const status1 = res1.status;
      const status2 = res2.status;

      // Exactly one should succeed (200), and the other must fail (409 or 422)
      const statuses = [status1, status2];
      expect(statuses).toContain(200);

      const failedStatus = statuses.find((s) => s !== 200);
      expect([409, 422]).toContain(failedStatus);

      // Verify DB final state: stock MUST be exactly 0, NEVER negative
      const updatedProd = await prisma.produtoEstoque.findUnique({
        where: { id: scarceProd.id },
      });
      expect(updatedProd).not.toBeNull();
      expect(updatedProd!.quantidade).toBe(0);
      expect(updatedProd!.ativo).toBe(false);

      // Track successful IDs for cleanup
      const dataSuccess = status1 === 200 ? await res1.json() : await res2.json();
      if (dataSuccess.lancamentoId) createdLancamentoIds.push(dataSuccess.lancamentoId);
      if (dataSuccess.historicoIds) createdHistoricoIds.push(...dataSuccess.historicoIds);

      // Verify that the failed attempt did NOT insert orphaned lancamentos or audit rows
      const auditCount = await prisma.historicoBaixa.count({
        where: { produtoId: scarceProd.id },
      });
      expect(auditCount).toBe(1); // exactly 1 audit entry, rollback ensured no orphan
    });

    it("deactivates product (ativo: false) when stock reaches zero, and subsequent debit fails with HTTP 422", async () => {
      const prodToZero = await seedProduct({
        codigoSuffix: "TO-ZERO",
        discriminacao: "Produto Zeramento Teste",
        quantidade: 4,
        unitarioCentavos: 100,
      });

      // Debit all 4 units
      const req1 = makeJsonRequest(url, "POST", {
        formaPagamento: "DINHEIRO",
        data: "2099-01-22",
        observacoes: "[TEST-T5] Zero out",
        itens: [{ produtoId: prodToZero.id, quantidadeDebitar: 4 }],
      });
      const res1 = await postExecutar(req1);
      const data1 = await res1.json();

      expect(res1.status).toBe(200);
      expect(data1.success).toBe(true);
      if (data1.lancamentoId) createdLancamentoIds.push(data1.lancamentoId);
      if (data1.historicoIds) createdHistoricoIds.push(...data1.historicoIds);

      // Check DB
      const dbProd = await prisma.produtoEstoque.findUnique({ where: { id: prodToZero.id } });
      expect(dbProd!.quantidade).toBe(0);
      expect(dbProd!.ativo).toBe(false);

      // Try debiting 1 more unit now that it's inactive/zero
      const req2 = makeJsonRequest(url, "POST", {
        formaPagamento: "DINHEIRO",
        data: "2099-01-22",
        itens: [{ produtoId: prodToZero.id, quantidadeDebitar: 1 }],
      });
      const res2 = await postExecutar(req2);
      expect(res2.status).toBe(422);
    });

    it("aggregates duplicate product entries in itens array: fails if sum exceeds stock, succeeds if sum is available", async () => {
      const prodDup = await seedProduct({
        codigoSuffix: "DUP-ITEMS",
        discriminacao: "Produto Itens Duplicados Teste",
        quantidade: 5,
        unitarioCentavos: 200,
      });

      // Request 3 + 3 = 6 (exceeds stock 5) -> must fail with 422
      const reqFail = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-25",
        itens: [
          { produtoId: prodDup.id, quantidadeDebitar: 3 },
          { produtoId: prodDup.id, quantidadeDebitar: 3 },
        ],
      });
      const resFail = await postExecutar(reqFail);
      expect(resFail.status).toBe(422);

      // Request 2 + 2 = 4 (within stock 5) -> succeeds
      const reqPass = makeJsonRequest(url, "POST", {
        formaPagamento: "CARTAO",
        data: "2099-01-25",
        itens: [
          { produtoId: prodDup.id, quantidadeDebitar: 2 },
          { produtoId: prodDup.id, quantidadeDebitar: 2 },
        ],
      });
      const resPass = await postExecutar(reqPass);
      const dataPass = await resPass.json();
      expect(resPass.status).toBe(200);
      expect(dataPass.success).toBe(true);
      expect(dataPass.totalDebitadoCentavos).toBe(800); // 4 * 200

      if (dataPass.lancamentoId) createdLancamentoIds.push(dataPass.lancamentoId);
      if (dataPass.historicoIds) createdHistoricoIds.push(...dataPass.historicoIds);

      // Remaining stock must be 1 (5 - 4)
      const dbProd = await prisma.produtoEstoque.findUnique({ where: { id: prodDup.id } });
      expect(dbProd!.quantidade).toBe(1);
      expect(dbProd!.ativo).toBe(true);
    });
  });

  // =========================================================================
  // GROUP 3: /api/baixa/historico White-Box Edge Cases & Pagination
  // =========================================================================
  describe("Group 3: /api/baixa/historico Pagination & Filtering Robustness", () => {
    it("handles extreme pagination parameters safely without throwing", async () => {
      // limit = 99999 (should clamp to 200)
      let req = new NextRequest("http://localhost:3000/api/baixa/historico?limit=99999&offset=-10");
      let res = await getHistorico(req);
      let json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.paginacao.limit).toBe(200);
      expect(json.paginacao.offset).toBe(0);

      // limit = -50 (should clamp to 1)
      req = new NextRequest("http://localhost:3000/api/baixa/historico?limit=-50&offset=0");
      res = await getHistorico(req);
      json = await res.json();

      expect(res.status).toBe(200);
      expect(json.paginacao.limit).toBe(1);
    });

    it("filters properly by date range, code, and ignores invalid payment method safely", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/baixa/historico?dataInicio=2099-01-01&dataFim=2099-12-31&formaPagamento=UNKNOWN_PAYMENT"
      );
      const res = await getHistorico(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.totais).toBeDefined();
      expect(json.totais.valorTotalBRL).toBeDefined();
      expect(Array.isArray(json.historico)).toBe(true);
    });
  });

  // =========================================================================
  // GROUP 4: /api/inventario/import Adversarial Edge Cases & File Limits
  // =========================================================================
  describe("Group 4: /api/inventario/import Ingestion Security & Limits", () => {
    const importUrl = "http://localhost:3000/api/inventario/import";

    it("returns HTTP 400 when Content-Type is not multipart/form-data", async () => {
      const req = makeJsonRequest(importUrl, "POST", { file: "test" }, { contentType: "application/json" });
      const res = await postImport(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("multipart/form-data");
    });

    it("returns HTTP 400 when form data has no file attached or empty file", async () => {
      const formData = new FormData();
      const req = new NextRequest(importUrl, { method: "POST", body: formData });
      const res = await postImport(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Nenhum arquivo enviado ou arquivo vazio");
    });

    it("returns HTTP 400 when file extension is unsupported (.txt, .pdf, .json)", async () => {
      const formData = new FormData();
      const blob = new Blob(["some plain text"], { type: "text/plain" });
      formData.append("file", blob, "relatorio.txt");

      const req = new NextRequest(importUrl, { method: "POST", body: formData });
      const res = await postImport(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Formato de arquivo inválido");
    });

    it("returns HTTP 413 when file size exceeds 15 MB limit", async () => {
      const formData = new FormData();
      // 15 MB + 1024 bytes buffer
      const oversizedBuffer = Buffer.alloc(15 * 1024 * 1024 + 1024);
      const blob = new Blob([oversizedBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      formData.append("file", blob, "gigante.xlsx");

      const req = new NextRequest(importUrl, { method: "POST", body: formData });
      const res = await postImport(req);
      const json = await res.json();

      expect(res.status).toBe(413);
      expect(json.success).toBe(false);
      expect(json.error).toContain("limite máximo permitido");
    });

    it("returns HTTP 422 when spreadsheet content is corrupted/unparseable", async () => {
      const formData = new FormData();
      const corruptBlob = new Blob([Buffer.from("THIS_IS_CORRUPT_NON_EXCEL_BYTES")], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      formData.append("file", corruptBlob, "corrompido.xlsx");

      const req = new NextRequest(importUrl, { method: "POST", body: formData });
      const res = await postImport(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
    });

    it("supports ?dryRun=true mode without writing to database", async () => {
      // Build a valid synthetic P7 CSV
      let csvContent = "Razão Social: Mercearia Teste Ltda;CNPJ: 11.222.333/0001-44\n";
      csvContent += "Código;Barras;NCM;Discriminação;Unid;Qtd;Unitário;Total\n";
      const testCode = `${PREFIX}DRYRUN-01`;
      csvContent += `${testCode};789000111;12345678;"[TEST-T5] Produto DryRun";UN;10;5,00;50,00\n`;
      csvContent += ";;;TOTAL GERAL;;;;\n";

      const formData = new FormData();
      const blob = new Blob([Buffer.from(csvContent, "utf-8")], { type: "text/csv" });
      formData.append("file", blob, "dryrun_test.csv");

      const req = new NextRequest(`${importUrl}?dryRun=true`, { method: "POST", body: formData });
      const res = await postImport(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.dryRun).toBe(true);
      expect(json.summary.totalItensValidos).toBe(1);

      // Confirm product was NOT written to DB
      const dbProd = await prisma.produtoEstoque.findUnique({ where: { codigo: testCode } });
      expect(dbProd).toBeNull();
    });

    it("commits import and aggregates duplicated codes within the same file", async () => {
      const testCode = `${PREFIX}DUP-01`;
      let csvContent = "Razão Social: Mercearia Teste Ltda;CNPJ: 11.222.333/0001-44\n";
      csvContent += "Código;Barras;NCM;Discriminação;Unid;Qtd;Unitário;Total\n";
      // 2 rows with the exact same code: qty 3 + qty 7 = 10 total
      csvContent += `${testCode};789000111;12345678;"[TEST-T5] Produto Duplicado A";UN;3;10,00;30,00\n`;
      csvContent += `${testCode};789000111;12345678;"[TEST-T5] Produto Duplicado B";UN;7;10,00;70,00\n`;
      csvContent += ";;;TOTAL GERAL;;;;\n";

      const formData = new FormData();
      const blob = new Blob([Buffer.from(csvContent, "utf-8")], { type: "text/csv" });
      formData.append("file", blob, "duplicados_test.csv");

      const req = new NextRequest(importUrl, { method: "POST", body: formData });
      const res = await postImport(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.dryRun).toBe(false);

      // Verify DB aggregation
      const dbProd = await prisma.produtoEstoque.findUnique({ where: { codigo: testCode } });
      expect(dbProd).not.toBeNull();
      createdProductIds.push(dbProd!.id);

      expect(dbProd!.quantidade).toBe(10); // 3 + 7
      expect(dbProd!.totalCentavos).toBe(10000); // 10 * 1000 centavos
    });
  });

  // =========================================================================
  // GROUP 5: /api/inventario/produtos Search, Sort & SQL Wildcards
  // =========================================================================
  describe("Group 5: /api/inventario/produtos Search, Whitelisting & Injection Resilience", () => {
    it("handles SQL wildcards and special characters in search parameter 'q' safely", async () => {
      const adversarialQueries = ["%", "_", "'", "\"", "' OR '1'='1", "\"; DROP TABLE produtos_estoque; --"];

      for (const query of adversarialQueries) {
        const url = `http://localhost:3000/api/inventario/produtos?q=${encodeURIComponent(query)}`;
        const req = new NextRequest(url);
        const res = await getProdutos(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(Array.isArray(json.produtos)).toBe(true);
        expect(json.pagination).toBeDefined();
      }
    });

    it("clamps extreme pagination and sanitizes invalid sortBy / sortOrder", async () => {
      // Invalid sortBy field ("malicious_field") -> should fallback to "codigo" without error
      const url = "http://localhost:3000/api/inventario/produtos?page=-5&limit=99999&sortBy=malicious_field&sortOrder=random";
      const req = new NextRequest(url);
      const res = await getProdutos(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.pagination.page).toBe(1);
      expect(json.pagination.limit).toBe(100); // clamped to 100 max
    });

    it("filters correctly by status: em_estoque, esgotado, todos", async () => {
      for (const status of ["em_estoque", "esgotado", "todos"]) {
        const url = `http://localhost:3000/api/inventario/produtos?status=${status}`;
        const req = new NextRequest(url);
        const res = await getProdutos(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.stats).toBeDefined();
        expect(typeof json.stats.totalProdutos).toBe("number");
      }
    });

    it("returns empty product list with hasNextPage=false when page exceeds total pages or searching non-existent items", async () => {
      // Non-existent search query
      const urlEmpty = "http://localhost:3000/api/inventario/produtos?q=NON_EXISTENT_PRODUCT_123456789";
      const reqEmpty = new NextRequest(urlEmpty);
      const resEmpty = await getProdutos(reqEmpty);
      const jsonEmpty = await resEmpty.json();

      expect(resEmpty.status).toBe(200);
      expect(jsonEmpty.success).toBe(true);
      expect(jsonEmpty.produtos.length).toBe(0);
      expect(jsonEmpty.pagination.totalCount).toBe(0);

      // Huge page number
      const urlHugePage = "http://localhost:3000/api/inventario/produtos?page=999999&limit=10";
      const reqHugePage = new NextRequest(urlHugePage);
      const resHugePage = await getProdutos(reqHugePage);
      const jsonHugePage = await resHugePage.json();

      expect(resHugePage.status).toBe(200);
      expect(jsonHugePage.success).toBe(true);
      expect(jsonHugePage.produtos.length).toBe(0);
      expect(jsonHugePage.pagination.page).toBe(999999);
      expect(jsonHugePage.pagination.hasNextPage).toBe(false);
      expect(jsonHugePage.pagination.hasPrevPage).toBe(true);
    });
  });

  // =========================================================================
  // GROUP 6: /api/financeiro (Consolidado, Mensal, Diario) Data Contracts
  // =========================================================================
  describe("Group 6: /api/financeiro Endpoints Data Contracts & Input Validation", () => {
    it("consolidado: calculates negative net balance (deficit) accurately when expenses exceed sales", async () => {
      // Create a test expense in 2099-12 with no sales
      const testExpense = await prisma.despesaMensal.create({
        data: {
          descricao: `${PREFIX}Despesa Deficit Mensal`,
          categoria: "OPERACIONAL",
          valorCentavos: 50000, // R$ 500,00
          mesAno: "2099-12",
        },
      });
      createdDespesaIds.push(testExpense.id);

      const req = new NextRequest("http://localhost:3000/api/financeiro/consolidado?mesAno=2099-12");
      const res = await getConsolidado(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.totalEntradasCentavos).toBe(0);
      expect(json.totalSaidasCentavos).toBe(50000);
      expect(json.saldoLiquidoCentavos).toBe(-50000);
      expect(json.saldoLiquidoBRL).toBe("-R$ 500,00");
    });
    it("consolidado: returns HTTP 400 for invalid mesAno formats", async () => {
      const invalidMonths = ["202611", "2026-1", "nov-2026", "2026-123"];
      for (const m of invalidMonths) {
        const req = new NextRequest(`http://localhost:3000/api/financeiro/consolidado?mesAno=${m}`);
        const res = await getConsolidado(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.success).toBe(false);
        expect(json.error).toContain("Mês de referência inválido");
      }
    });

    it("consolidado: defaults to current month when mesAno is omitted", async () => {
      const req = new NextRequest("http://localhost:3000/api/financeiro/consolidado");
      const res = await getConsolidado(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.mesAno).toMatch(/^\d{4}-\d{2}$/);
      expect(json.totalEntradasBRL).toBeDefined();
    });

    it("mensal: confirms route re-exports consolidado and respects identical contract", async () => {
      const reqInvalid = new NextRequest("http://localhost:3000/api/financeiro/mensal?mesAno=INVALID");
      const resInvalid = await getMensal(reqInvalid);
      expect(resInvalid.status).toBe(400);

      const reqValid = new NextRequest("http://localhost:3000/api/financeiro/mensal");
      const resValid = await getMensal(reqValid);
      const json = await resValid.json();
      expect(resValid.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("diario: returns HTTP 400 for invalid specific date, invalid range, or invalid mesAno", async () => {
      // Invalid specific data
      let req = new NextRequest("http://localhost:3000/api/financeiro/diario?data=invalid-date");
      let res = await getDiario(req);
      expect(res.status).toBe(400);

      // Invalid range
      req = new NextRequest("http://localhost:3000/api/financeiro/diario?dataInicio=invalid&dataFim=2099-01-31");
      res = await getDiario(req);
      expect(res.status).toBe(400);

      // Invalid mesAno
      req = new NextRequest("http://localhost:3000/api/financeiro/diario?mesAno=2099");
      res = await getDiario(req);
      expect(res.status).toBe(400);
    });

    it("diario: queries specific date and range successfully with formatted BRL values", async () => {
      const req = new NextRequest("http://localhost:3000/api/financeiro/diario?dataInicio=2099-01-01&dataFim=2099-01-31");
      const res = await getDiario(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.totaisPeriodo).toBeDefined();
      expect(json.totaisPeriodo.totalGeralBRL).toBeDefined();
      expect(Array.isArray(json.dias)).toBe(true);
    });
  });

  // =========================================================================
  // GROUP 7: /api/despesas & /api/despesas/[id] CRUD Validation
  // =========================================================================
  describe("Group 7: /api/despesas Input Validation & HTTP Status Codes", () => {
    const despesasUrl = "http://localhost:3000/api/despesas";

    it("returns HTTP 400 when creating expense with malformed JSON or empty body", async () => {
      let req = makeJsonRequest(despesasUrl, "POST", null, { malformedJson: true });
      let res = await postDespesas(req);
      expect(res.status).toBe(400);

      req = makeJsonRequest(despesasUrl, "POST", "string-not-object");
      res = await postDespesas(req);
      expect(res.status).toBe(400);
    });

    it("returns HTTP 400 when descricao is missing or blank", async () => {
      const req = makeJsonRequest(despesasUrl, "POST", {
        descricao: "   ",
        categoria: "MERCADORIA",
        valorCentavos: 1000,
      });
      const res = await postDespesas(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("O campo 'descricao' é obrigatório");
    });

    it("returns HTTP 400 when categoria is invalid", async () => {
      const invalidCategories = ["FERIAS", "LUXO", "INVESTIMENTO", ""];
      for (const cat of invalidCategories) {
        const req = makeJsonRequest(despesasUrl, "POST", {
          descricao: `${PREFIX}Despesa Teste`,
          categoria: cat,
          valorCentavos: 1000,
        });
        const res = await postDespesas(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.success).toBe(false);
        expect(json.error).toContain("Categoria inválida");
      }
    });

    it("returns HTTP 400 when amount is missing, zero, negative, or non-integer", async () => {
      // Missing amount
      let req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Sem Valor`,
        categoria: "OPERACIONAL",
      });
      let res = await postDespesas(req);
      expect(res.status).toBe(400);

      // Zero valorCentavos
      req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Valor Zero`,
        categoria: "OPERACIONAL",
        valorCentavos: 0,
      });
      res = await postDespesas(req);
      expect(res.status).toBe(400);

      // Negative valorCentavos
      req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Valor Negativo`,
        categoria: "OPERACIONAL",
        valorCentavos: -500,
      });
      res = await postDespesas(req);
      expect(res.status).toBe(400);

      // Float valorCentavos
      req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Valor Float`,
        categoria: "OPERACIONAL",
        valorCentavos: 12.34,
      });
      res = await postDespesas(req);
      expect(res.status).toBe(400);

      // Invalid BRL string
      req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Valor BRL Invalido`,
        categoria: "OPERACIONAL",
        valor: "R$ 0,00",
      });
      res = await postDespesas(req);
      expect(res.status).toBe(400);
    });

    it("returns HTTP 400 when dataPagamento or mesAno formats are invalid", async () => {
      // Invalid dataPagamento
      let req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Data Invalida`,
        categoria: "MERCADORIA",
        valorCentavos: 1000,
        dataPagamento: "05/11/2099",
      });
      let res = await postDespesas(req);
      expect(res.status).toBe(400);

      // Invalid mesAno
      req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}MesAno Invalido`,
        categoria: "MERCADORIA",
        valorCentavos: 1000,
        mesAno: "209911",
      });
      res = await postDespesas(req);
      expect(res.status).toBe(400);
    });

    it("creates an expense successfully (HTTP 201) with integer centavos and string BRL", async () => {
      // 1. With valorCentavos
      let req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Fornecedor de Queijo`,
        categoria: "MERCADORIA",
        valorCentavos: 85050,
        mesAno: "2099-05",
        dataPagamento: "2099-05-10",
      });
      let res = await postDespesas(req);
      let json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.despesa.id).toBeDefined();
      expect(json.despesa.valorBRL).toBe("R$ 850,50");
      createdDespesaIds.push(json.despesa.id);

      // 2. With formatted string valor
      req = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Energia Eletrica`,
        categoria: "CONTAS_FIXAS",
        valor: "R$ 320,00",
        mesAno: "2099-05",
      });
      res = await postDespesas(req);
      json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.despesa.valorCentavos).toBe(32000);
      createdDespesaIds.push(json.despesa.id);
    });

    it("returns HTTP 400 for invalid mesAno filter on GET /api/despesas", async () => {
      const req = new NextRequest("http://localhost:3000/api/despesas?mesAno=INVALID_MONTH");
      const res = await getDespesas(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Formato de mesAno inválido");
    });

    it("deletes expense via DELETE /api/despesas query/body or returns HTTP 400/404", async () => {
      // Missing ID -> 400
      let req = makeJsonRequest(despesasUrl, "DELETE");
      let res = await deleteDespesas(req);
      expect(res.status).toBe(400);

      // Non-existent ID -> 404
      req = makeJsonRequest(`${despesasUrl}?id=non-existent-despesa-uuid`, "DELETE");
      res = await deleteDespesas(req);
      expect(res.status).toBe(404);

      // Create a test expense to delete
      const createReq = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Para Excluir Query`,
        categoria: "OUTROS",
        valorCentavos: 5000,
        mesAno: "2099-06",
      });
      const createRes = await postDespesas(createReq);
      const createJson = await createRes.json();
      const expenseId = createJson.despesa.id;

      // Delete by query param -> 200
      req = makeJsonRequest(`${despesasUrl}?id=${expenseId}`, "DELETE");
      res = await deleteDespesas(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.idExcluido).toBe(expenseId);

      // Confirm DB deletion
      const dbCheck = await prisma.despesaMensal.findUnique({ where: { id: expenseId } });
      expect(dbCheck).toBeNull();
    });

    it("deletes expense via DELETE /api/despesas/[id] or returns HTTP 404", async () => {
      // Non-existent ID -> 404
      const req404 = new NextRequest("http://localhost:3000/api/despesas/non-existent-id");
      const res404 = await deleteDespesaById(req404, {
        params: Promise.resolve({ id: "non-existent-id" }),
      });
      expect(res404.status).toBe(404);

      // Create a test expense to delete
      const createReq = makeJsonRequest(despesasUrl, "POST", {
        descricao: `${PREFIX}Para Excluir Dynamic Route`,
        categoria: "PESSOAL",
        valorCentavos: 15000,
        mesAno: "2099-06",
      });
      const createRes = await postDespesas(createReq);
      const createJson = await createRes.json();
      const expenseId = createJson.despesa.id;

      // Delete by dynamic param -> 200
      const req200 = new NextRequest(`http://localhost:3000/api/despesas/${expenseId}`);
      const res200 = await deleteDespesaById(req200, {
        params: Promise.resolve({ id: expenseId }),
      });
      const json200 = await res200.json();

      expect(res200.status).toBe(200);
      expect(json200.success).toBe(true);
      expect(json200.idExcluido).toBe(expenseId);

      // Confirm DB deletion
      const dbCheck = await prisma.despesaMensal.findUnique({ where: { id: expenseId } });
      expect(dbCheck).toBeNull();
    });
  });
});
