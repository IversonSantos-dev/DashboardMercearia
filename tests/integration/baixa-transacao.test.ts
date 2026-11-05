import { describe, it, expect, afterAll } from "vitest";
import prisma from "../../src/lib/prisma";
import {
  executeDeductionTransaction,
  getTransactionAuditTrail,
  getProductAuditHistory,
  InsufficientStockError,
  ProductInactiveError,
  ProductNotFoundError,
  ConcurrencyConflictError,
} from "../../src/modules/transacoes";

describe("Atomic Transaction Coordinator & Audit Logging (baixa-transacao)", () => {
  const PREFIX = "TEST-TX-INT-";
  const createdProductIds: string[] = [];
  const createdLancamentoIds: string[] = [];
  const createdHistoricoIds: string[] = [];

  afterAll(async () => {
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
      console.error("Cleanup error in baixa-transacao.test.ts:", err);
    }
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

  // =========================================================================
  // Suite A: Atomic Stock Decrement & Deactivation
  // =========================================================================
  describe("Suite A: Atomic Stock Decrement & Deactivation", () => {
    it("I-TX-01: atomically decrements single product quantity and updates totalCentavos", async () => {
      const prod = await createTestProduct({
        codigo: "DEC-1",
        discriminacao: "Produto Teste Decremento",
        quantidade: 10,
        unitarioCentavos: 500, // R$ 5,00
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-01",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 3 }],
        operadorObservacao: `${PREFIX} Decrement Test`,
      });

      expect(res.sucesso).toBe(true);
      expect(res.totalDebitadoCentavos).toBe(1500);
      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const updated = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(updated?.quantidade).toBe(7);
      expect(updated?.totalCentavos).toBe(3500); // 7 * 500
      expect(updated?.ativo).toBe(true);
    });

    it("I-TX-02: sets ativo = false and totalCentavos = 0 when balance reaches zero", async () => {
      const prod = await createTestProduct({
        codigo: "ZERO-1",
        discriminacao: "Produto Teste Saldo Zero",
        quantidade: 2,
        unitarioCentavos: 800,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-05-01",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
        operadorObservacao: `${PREFIX} Zero Stock Test`,
      });

      expect(res.sucesso).toBe(true);
      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const updated = await prisma.produtoEstoque.findUnique({
        where: { id: prod.id },
      });
      expect(updated?.quantidade).toBe(0);
      expect(updated?.totalCentavos).toBe(0);
      expect(updated?.ativo).toBe(false);
    });

    it("I-TX-03: executes multi-item atomic decrement across distinct products in one transaction", async () => {
      const prodA = await createTestProduct({
        codigo: "MULTI-A",
        discriminacao: "Item Multi A",
        quantidade: 5,
        unitarioCentavos: 1000,
      });
      const prodB = await createTestProduct({
        codigo: "MULTI-B",
        discriminacao: "Item Multi B",
        quantidade: 8,
        unitarioCentavos: 400,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-02",
        itens: [
          { produtoId: prodA.id, quantidadeDebitar: 2 },
          { produtoId: prodB.id, quantidadeDebitar: 3 },
        ],
        operadorObservacao: `${PREFIX} Multi Item Test`,
      });

      expect(res.sucesso).toBe(true);
      expect(res.totalDebitadoCentavos).toBe(3200); // (2 * 1000) + (3 * 400) = 3200
      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const updatedA = await prisma.produtoEstoque.findUnique({ where: { id: prodA.id } });
      const updatedB = await prisma.produtoEstoque.findUnique({ where: { id: prodB.id } });
      expect(updatedA?.quantidade).toBe(3);
      expect(updatedB?.quantidade).toBe(5);
    });
  });

  // =========================================================================
  // Suite B: Rollback & Transactional Integrity
  // =========================================================================
  describe("Suite B: Rollback & Transactional Integrity", () => {
    it("I-TX-04: rolls back entire transaction if any item requested exceeds stock", async () => {
      const prodGood = await createTestProduct({
        codigo: "ROLL-GOOD",
        discriminacao: "Item Com Saldo",
        quantidade: 10,
        unitarioCentavos: 1000,
      });
      const prodBad = await createTestProduct({
        codigo: "ROLL-BAD",
        discriminacao: "Item Saldo Baixo",
        quantidade: 2,
        unitarioCentavos: 500,
      });

      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-05-03",
          itens: [
            { produtoId: prodGood.id, quantidadeDebitar: 5 },
            { produtoId: prodBad.id, quantidadeDebitar: 10 }, // 10 exceeds 2!
          ],
          operadorObservacao: `${PREFIX} Overdraft Test`,
        })
      ).rejects.toThrow(InsufficientStockError);

      // Verify ZERO partial writes: prodGood still has 10
      const checkGood = await prisma.produtoEstoque.findUnique({ where: { id: prodGood.id } });
      const checkBad = await prisma.produtoEstoque.findUnique({ where: { id: prodBad.id } });
      expect(checkGood?.quantidade).toBe(10);
      expect(checkBad?.quantidade).toBe(2);
    });

    it("I-TX-05: rejects deduction for inactive product and rolls back", async () => {
      const prodInactive = await createTestProduct({
        codigo: "INACTIVE",
        discriminacao: "Produto Inativo",
        quantidade: 0,
        unitarioCentavos: 500,
        ativo: false,
      });

      await expect(
        executeDeductionTransaction({
          formaPagamento: "DINHEIRO",
          dataLancamento: "2099-05-03",
          itens: [{ produtoId: prodInactive.id, quantidadeDebitar: 1 }],
        })
      ).rejects.toThrow(ProductInactiveError);
    });

    it("I-TX-06: rejects deduction for non-existent product ID and rolls back", async () => {
      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-05-03",
          itens: [{ produtoId: "non-existent-product-id-1234", quantidadeDebitar: 1 }],
        })
      ).rejects.toThrow(ProductNotFoundError);
    });
  });

  // =========================================================================
  // Suite C: Concurrency & Race Condition Defense
  // =========================================================================
  describe("Suite C: Concurrency & Race Condition Defense", () => {
    it("I-TX-07: handles 2 concurrent transactions competing for last unit", async () => {
      const prod = await createTestProduct({
        codigo: "RACE-1",
        discriminacao: "Produto Última Unidade",
        quantidade: 1,
        unitarioCentavos: 2500,
      });

      const tx1 = executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-04",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        operadorObservacao: `${PREFIX} Race 1`,
      });

      const tx2 = executeDeductionTransaction({
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-05-04",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        operadorObservacao: `${PREFIX} Race 2`,
      });

      const results = await Promise.allSettled([tx1, tx2]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 1 succeeds, exactly 1 fails
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Track created IDs from the winning transaction
      const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      createdLancamentoIds.push(winner.lancamentoDiarioId);
      createdHistoricoIds.push(...winner.historicoIds);

      // Check ending stock is exactly 0 and inactive, never negative
      const finalProd = await prisma.produtoEstoque.findUnique({ where: { id: prod.id } });
      expect(finalProd?.quantidade).toBe(0);
      expect(finalProd?.ativo).toBe(false);
    });
  });

  // =========================================================================
  // Suite D: Daily Sales Ledger Integration
  // =========================================================================
  describe("Suite D: Daily Sales Ledger Integration", () => {
    it("I-TX-08: records under valorCartaoCentavos when formaPagamento is CARTAO", async () => {
      const prod = await createTestProduct({
        codigo: "PAY-CARTAO",
        discriminacao: "Item Cartão",
        quantidade: 5,
        unitarioCentavos: 4200,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        operadorObservacao: `${PREFIX} Venda Cartao`,
      });

      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const entry = await prisma.lancamentoDiario.findUnique({
        where: { id: res.lancamentoDiarioId },
      });
      expect(entry?.valorCartaoCentavos).toBe(4200);
      expect(entry?.valorDinheiroCentavos).toBe(0);
      expect(entry?.totalDiarioCentavos).toBe(4200);
    });

    it("I-TX-09: records under valorDinheiroCentavos when formaPagamento is DINHEIRO", async () => {
      const prod = await createTestProduct({
        codigo: "PAY-DINHEIRO",
        discriminacao: "Item Dinheiro",
        quantidade: 5,
        unitarioCentavos: 1800,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-05-05",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
        operadorObservacao: `${PREFIX} Venda Dinheiro`,
      });

      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const entry = await prisma.lancamentoDiario.findUnique({
        where: { id: res.lancamentoDiarioId },
      });
      expect(entry?.valorCartaoCentavos).toBe(0);
      expect(entry?.valorDinheiroCentavos).toBe(3600);
      expect(entry?.totalDiarioCentavos).toBe(3600);
    });

    it("I-TX-10: supports retroactive date entry for previous day fiscal entries", async () => {
      const prod = await createTestProduct({
        codigo: "RETRO",
        discriminacao: "Item Retroativo",
        quantidade: 5,
        unitarioCentavos: 1000,
      });

      const retroDate = "2020-01-15";
      const res = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: retroDate,
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        operadorObservacao: `${PREFIX} Retroativo`,
      });

      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const entry = await prisma.lancamentoDiario.findUnique({
        where: { id: res.lancamentoDiarioId },
      });
      expect(entry?.data).toBe(retroDate);
    });

    it("I-TX-11: pre-aggregates duplicate item entries for the same product safely", async () => {
      const prod = await createTestProduct({
        codigo: "DUP",
        discriminacao: "Item Duplicado na Lista",
        quantidade: 10,
        unitarioCentavos: 500,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-06",
        itens: [
          { produtoId: prod.id, quantidadeDebitar: 2 },
          { produtoId: prod.id, quantidadeDebitar: 3 },
        ],
        operadorObservacao: `${PREFIX} Duplicate Entries`,
      });

      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      expect(res.sucesso).toBe(true);
      expect(res.totalDebitadoCentavos).toBe(2500); // (2+3) * 500

      const updated = await prisma.produtoEstoque.findUnique({ where: { id: prod.id } });
      expect(updated?.quantidade).toBe(5); // 10 - 5 = 5
    });
  });

  // =========================================================================
  // Suite E: Immutable Audit Trail & Helpers
  // =========================================================================
  describe("Suite E: Immutable Audit Trail & Query Helpers", () => {
    it("I-TX-12: creates immutable snapshot in historico_baixas", async () => {
      const prod = await createTestProduct({
        codigo: "SNAPSHOT",
        discriminacao: "Item Snapshot Imutável",
        quantidade: 10,
        unitarioCentavos: 3000,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-07",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
        operadorObservacao: `${PREFIX} Snapshot Test`,
      });

      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const auditRecord = await prisma.historicoBaixa.findUniqueOrThrow({
        where: { id: res.historicoIds[0] },
      });

      expect(auditRecord.codigoProduto).toBe(prod.codigo);
      expect(auditRecord.discriminacaoProduto).toBe(prod.discriminacao);
      expect(auditRecord.quantidadeBaixada).toBe(2);
      expect(auditRecord.unitarioCentavos).toBe(3000);
      expect(auditRecord.totalCentavos).toBe(6000);
      expect(auditRecord.formaPagamento).toBe("CARTAO");
      expect(auditRecord.lancamentoDiarioId).toBe(res.lancamentoDiarioId);
    });

    it("I-TX-13: getTransactionAuditTrail returns audit items for daily sales entry", async () => {
      const prod = await createTestProduct({
        codigo: "HELPER-1",
        discriminacao: "Item Helper 1",
        quantidade: 10,
        unitarioCentavos: 1200,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-05-08",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
        operadorObservacao: `${PREFIX} Helper Trail`,
      });

      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const trail = await getTransactionAuditTrail(res.lancamentoDiarioId);
      expect(trail.length).toBe(1);
      expect(trail[0].codigoProduto).toBe(prod.codigo);
      expect(trail[0].totalCentavos).toBe(1200);
    });

    it("I-TX-14: getProductAuditHistory returns historical deductions for a product", async () => {
      const prod = await createTestProduct({
        codigo: "HELPER-2",
        discriminacao: "Item Helper 2",
        quantidade: 10,
        unitarioCentavos: 700,
      });

      const res = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-05-08",
        itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
        operadorObservacao: `${PREFIX} Product History`,
      });

      createdLancamentoIds.push(res.lancamentoDiarioId);
      createdHistoricoIds.push(...res.historicoIds);

      const history = await getProductAuditHistory(prod.id);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].produtoId).toBe(prod.id);
      expect(history[0].quantidadeBaixada).toBe(2);
    });
  });
});
