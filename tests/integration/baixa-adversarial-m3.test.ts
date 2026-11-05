import { describe, it, expect, afterAll } from "vitest";
import prisma from "../../src/lib/prisma";
import {
  executeDeductionTransaction,
  DeductionValidationError,
  ProductNotFoundError,
  ProductInactiveError,
  InsufficientStockError,
  ConcurrencyConflictError,
  getTransactionAuditTrail,
} from "../../src/modules/transacoes";

describe("Adversarial Empirical Challenge: Concurrency, Race Condition & ACID Rollback", () => {
  const PREFIX = "ADV-M3-";
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
      console.error("Cleanup error in baixa-adversarial-m3.test.ts:", err);
    }
  });

  async function createAdversarialProduct(data: {
    codeSuffix: string;
    discriminacao: string;
    quantidade: number;
    unitarioCentavos: number;
    ativo?: boolean;
  }) {
    const fullCode = `${PREFIX}${data.codeSuffix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
  // Challenge 1: High-Concurrency Race Condition Defense
  // =========================================================================
  describe("Challenge 1: High-Concurrency Race Condition Defense", () => {
    it("ADV-C1-01: 10 parallel transactions competing for a product with quantity = 2: exactly 2 succeed, 8 fail, stock = 0, no negatives", async () => {
      const prod = await createAdversarialProduct({
        codeSuffix: "RACE-10-FOR-2",
        discriminacao: "Produto Disputado 10x2",
        quantidade: 2,
        unitarioCentavos: 750, // R$ 7,50
      });

      // Launch 10 concurrent deduction attempts in parallel, each requesting 1 unit
      const attempts = Array.from({ length: 10 }, (_, idx) =>
        executeDeductionTransaction({
          formaPagamento: idx % 2 === 0 ? "CARTAO" : "DINHEIRO",
          dataLancamento: "2099-11-10",
          itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
          operadorObservacao: `${PREFIX} Race 10x2 Attempt ${idx}`,
        }).then(
          (res) => ({ status: "fulfilled" as const, value: res, index: idx }),
          (err) => ({ status: "rejected" as const, reason: err, index: idx })
        )
      );

      const results = await Promise.all(attempts);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Register created records for subsequent cleanup
      for (const f of fulfilled) {
        if (f.status === "fulfilled") {
          createdLancamentoIds.push(f.value.lancamentoDiarioId);
          createdHistoricoIds.push(...f.value.historicoIds);
        }
      }

      // Verification: Exactly 2 succeed, exactly 8 fail
      expect(fulfilled.length).toBe(2);
      expect(rejected.length).toBe(8);

      // Verify all rejections are legitimate concurrency/stock/active guards
      for (const rej of rejected) {
        if (rej.status === "rejected") {
          const isExpectedError =
            rej.reason instanceof ConcurrencyConflictError ||
            rej.reason instanceof ProductInactiveError ||
            rej.reason instanceof InsufficientStockError;
          expect(isExpectedError).toBe(true);
        }
      }

      // Check ending database state
      const finalProd = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { id: prod.id },
      });

      expect(finalProd.quantidade).toBe(0);
      expect(finalProd.totalCentavos).toBe(0);
      expect(finalProd.ativo).toBe(false);
      expect(finalProd.quantidade).toBeGreaterThanOrEqual(0); // Zero negative balance invariant
    });

    it("ADV-C1-02: 15 parallel transactions competing for a product with quantity = 4 (each debiting 1)", async () => {
      const prod = await createAdversarialProduct({
        codeSuffix: "RACE-15-FOR-4",
        discriminacao: "Produto Disputado 15x4",
        quantidade: 4,
        unitarioCentavos: 1200,
      });

      const attempts = Array.from({ length: 15 }, (_, idx) =>
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-10",
          itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
          operadorObservacao: `${PREFIX} Race 15x4 Attempt ${idx}`,
        }).then(
          (res) => ({ status: "fulfilled" as const, value: res }),
          (err) => ({ status: "rejected" as const, reason: err })
        )
      );

      const results = await Promise.all(attempts);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      for (const f of fulfilled) {
        if (f.status === "fulfilled") {
          createdLancamentoIds.push(f.value.lancamentoDiarioId);
          createdHistoricoIds.push(...f.value.historicoIds);
        }
      }

      expect(fulfilled.length).toBe(4);
      expect(rejected.length).toBe(11);

      const finalProd = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { id: prod.id },
      });
      expect(finalProd.quantidade).toBe(0);
      expect(finalProd.totalCentavos).toBe(0);
      expect(finalProd.ativo).toBe(false);
    });

    it("ADV-C1-03: 6 parallel transactions competing for a product with quantity = 3 (each debiting 2)", async () => {
      const prod = await createAdversarialProduct({
        codeSuffix: "RACE-6-FOR-3-DEBIT-2",
        discriminacao: "Produto Disputado Qtd 3 Debitando 2",
        quantidade: 3,
        unitarioCentavos: 1000,
      });

      const attempts = Array.from({ length: 6 }, (_, idx) =>
        executeDeductionTransaction({
          formaPagamento: "DINHEIRO",
          dataLancamento: "2099-11-10",
          itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
          operadorObservacao: `${PREFIX} Race Qtd3-Debit2 Attempt ${idx}`,
        }).then(
          (res) => ({ status: "fulfilled" as const, value: res }),
          (err) => ({ status: "rejected" as const, reason: err })
        )
      );

      const results = await Promise.all(attempts);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      for (const f of fulfilled) {
        if (f.status === "fulfilled") {
          createdLancamentoIds.push(f.value.lancamentoDiarioId);
          createdHistoricoIds.push(...f.value.historicoIds);
        }
      }

      // Exactly 1 can debit 2 from 3 (leaving 1); the remaining 5 must fail because 1 < 2!
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(5);

      const finalProd = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { id: prod.id },
      });
      expect(finalProd.quantidade).toBe(1);
      expect(finalProd.totalCentavos).toBe(1000);
      expect(finalProd.ativo).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 2: Partial Debit Failure & 100% Atomic Rollback
  // =========================================================================
  describe("Challenge 2: Partial Debit Failure & 100% Atomic Rollback", () => {
    it("ADV-C2-01: multi-item deduction where item #1 has stock but item #2 has insufficient stock: 0 partial writes", async () => {
      const prodA = await createAdversarialProduct({
        codeSuffix: "ROLLBACK-ITEM-A",
        discriminacao: "Produto A Com Saldo Suficiente",
        quantidade: 20,
        unitarioCentavos: 500,
      });

      const prodB = await createAdversarialProduct({
        codeSuffix: "ROLLBACK-ITEM-B",
        discriminacao: "Produto B Sem Saldo Suficiente",
        quantidade: 1,
        unitarioCentavos: 800,
      });

      // Attempt transaction requesting 5 of A (valid) and 10 of B (invalid: 10 > 1)
      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-11",
          itens: [
            { produtoId: prodA.id, quantidadeDebitar: 5 },
            { produtoId: prodB.id, quantidadeDebitar: 10 },
          ],
          operadorObservacao: `${PREFIX} Multi-Item Partial Overdraft`,
        })
      ).rejects.toThrow(InsufficientStockError);

      // Verify item #1 was NOT decremented (zero partial writes)
      const afterA = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { id: prodA.id },
      });
      const afterB = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { id: prodB.id },
      });

      expect(afterA.quantidade).toBe(20);
      expect(afterA.totalCentavos).toBe(10000);
      expect(afterA.ativo).toBe(true);

      expect(afterB.quantidade).toBe(1);
      expect(afterB.totalCentavos).toBe(800);
      expect(afterB.ativo).toBe(true);

      // Verify zero orphaned records in lancamentos_diarios or historico_baixas
      const orphanedLancamento = await prisma.lancamentoDiario.findFirst({
        where: { observacoes: `${PREFIX} Multi-Item Partial Overdraft` },
      });
      expect(orphanedLancamento).toBeNull();

      const orphanedHistorico = await prisma.historicoBaixa.findMany({
        where: { produtoId: { in: [prodA.id, prodB.id] } },
      });
      expect(orphanedHistorico.length).toBe(0);
    });

    it("ADV-C2-02: 3-item deduction where items #1 and #2 have stock but item #3 does not exist", async () => {
      const prod1 = await createAdversarialProduct({
        codeSuffix: "THREE-1",
        discriminacao: "Item Valido 1",
        quantidade: 10,
        unitarioCentavos: 300,
      });
      const prod2 = await createAdversarialProduct({
        codeSuffix: "THREE-2",
        discriminacao: "Item Valido 2",
        quantidade: 10,
        unitarioCentavos: 400,
      });

      await expect(
        executeDeductionTransaction({
          formaPagamento: "DINHEIRO",
          dataLancamento: "2099-11-11",
          itens: [
            { produtoId: prod1.id, quantidadeDebitar: 2 },
            { produtoId: prod2.id, quantidadeDebitar: 3 },
            { produtoId: "non-existent-fake-product-uuid-9999", quantidadeDebitar: 1 },
          ],
          operadorObservacao: `${PREFIX} Non-Existent Third Item`,
        })
      ).rejects.toThrow(ProductNotFoundError);

      // Check both prod1 and prod2 are completely untouched
      const after1 = await prisma.produtoEstoque.findUniqueOrThrow({ where: { id: prod1.id } });
      const after2 = await prisma.produtoEstoque.findUniqueOrThrow({ where: { id: prod2.id } });
      expect(after1.quantidade).toBe(10);
      expect(after2.quantidade).toBe(10);
    });

    it("ADV-C2-03: duplicate entries for same product totaling more than available stock triggers full rollback", async () => {
      const prod = await createAdversarialProduct({
        codeSuffix: "DUP-OVERDRAFT",
        discriminacao: "Item Duplicado Excedente",
        quantidade: 4,
        unitarioCentavos: 600,
      });

      // 3 + 2 = 5 > 4 available
      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-11",
          itens: [
            { produtoId: prod.id, quantidadeDebitar: 3 },
            { produtoId: prod.id, quantidadeDebitar: 2 },
          ],
          operadorObservacao: `${PREFIX} Dup Overdraft`,
        })
      ).rejects.toThrow(InsufficientStockError);

      const after = await prisma.produtoEstoque.findUniqueOrThrow({ where: { id: prod.id } });
      expect(after.quantidade).toBe(4);
      expect(after.ativo).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 3: Inactive Item Bypass Attempts
  // =========================================================================
  describe("Challenge 3: Inactive Item Bypass Attempts", () => {
    it("ADV-C3-01: rejects deduction when product has ativo = false and quantidade = 0", async () => {
      const prod = await createAdversarialProduct({
        codeSuffix: "INACTIVE-ZERO",
        discriminacao: "Produto Desativado Saldo Zero",
        quantidade: 0,
        unitarioCentavos: 1500,
        ativo: false,
      });

      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-12",
          itens: [{ produtoId: prod.id, quantidadeDebitar: 1 }],
          operadorObservacao: `${PREFIX} Inactive Zero Bypass`,
        })
      ).rejects.toThrow(ProductInactiveError);
    });

    it("ADV-C3-02: rejects deduction when product has ativo = false EVEN IF quantidade > 0 (administratively blocked)", async () => {
      const prod = await createAdversarialProduct({
        codeSuffix: "INACTIVE-WITH-STOCK",
        discriminacao: "Produto Bloqueado Administrativamente",
        quantidade: 50, // Physical stock exists, but administratively disabled
        unitarioCentavos: 2000,
        ativo: false,
      });

      await expect(
        executeDeductionTransaction({
          formaPagamento: "DINHEIRO",
          dataLancamento: "2099-11-12",
          itens: [{ produtoId: prod.id, quantidadeDebitar: 2 }],
          operadorObservacao: `${PREFIX} Inactive With Stock Bypass`,
        })
      ).rejects.toThrow(ProductInactiveError);

      // Verify stock was not touched
      const after = await prisma.produtoEstoque.findUniqueOrThrow({ where: { id: prod.id } });
      expect(after.quantidade).toBe(50);
      expect(after.ativo).toBe(false);
    });

    it("ADV-C3-03: multi-item deduction containing one inactive item among active items triggers 100% rollback", async () => {
      const prodActive = await createAdversarialProduct({
        codeSuffix: "ACTIVE-MIXED",
        discriminacao: "Item Ativo no Lote",
        quantidade: 10,
        unitarioCentavos: 1000,
        ativo: true,
      });

      const prodInactive = await createAdversarialProduct({
        codeSuffix: "INACTIVE-MIXED",
        discriminacao: "Item Inativo no Lote",
        quantidade: 10,
        unitarioCentavos: 1000,
        ativo: false,
      });

      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-12",
          itens: [
            { produtoId: prodActive.id, quantidadeDebitar: 2 },
            { produtoId: prodInactive.id, quantidadeDebitar: 1 },
          ],
          operadorObservacao: `${PREFIX} Inactive Mixed Batch`,
        })
      ).rejects.toThrow(ProductInactiveError);

      const afterActive = await prisma.produtoEstoque.findUniqueOrThrow({ where: { id: prodActive.id } });
      expect(afterActive.quantidade).toBe(10);
    });
  });

  // =========================================================================
  // Challenge 4: Financial Ledger Reconciliation
  // =========================================================================
  describe("Challenge 4: Financial Ledger Reconciliation", () => {
    it("ADV-C4-01: sum of daily sales in lancamentos_diarios strictly equals sum of historico_baixas across mixed transactions", async () => {
      const prod1 = await createAdversarialProduct({
        codeSuffix: "LEDGER-1",
        discriminacao: "Item Ledger 1",
        quantidade: 50,
        unitarioCentavos: 333, // R$ 3,33
      });

      const prod2 = await createAdversarialProduct({
        codeSuffix: "LEDGER-2",
        discriminacao: "Item Ledger 2",
        quantidade: 50,
        unitarioCentavos: 777, // R$ 7,77
      });

      const prod3 = await createAdversarialProduct({
        codeSuffix: "LEDGER-3",
        discriminacao: "Item Ledger 3",
        quantidade: 50,
        unitarioCentavos: 1250, // R$ 12,50
      });

      // Execute 4 distinct transactions:
      // Tx 1: CARTAO, Single item (3 x prod1 = 999)
      const res1 = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-11-15",
        itens: [{ produtoId: prod1.id, quantidadeDebitar: 3 }],
        operadorObservacao: `${PREFIX} Ledger Tx 1`,
      });
      createdLancamentoIds.push(res1.lancamentoDiarioId);
      createdHistoricoIds.push(...res1.historicoIds);

      // Tx 2: DINHEIRO, Multi item (2 x prod2 = 1554 + 1 x prod3 = 1250 => total 2804)
      const res2 = await executeDeductionTransaction({
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-11-15",
        itens: [
          { produtoId: prod2.id, quantidadeDebitar: 2 },
          { produtoId: prod3.id, quantidadeDebitar: 1 },
        ],
        operadorObservacao: `${PREFIX} Ledger Tx 2`,
      });
      createdLancamentoIds.push(res2.lancamentoDiarioId);
      createdHistoricoIds.push(...res2.historicoIds);

      // Tx 3: CARTAO, Multi item across 3 products (1 x prod1 = 333 + 1 x prod2 = 777 + 2 x prod3 = 2500 => total 3610)
      const res3 = await executeDeductionTransaction({
        formaPagamento: "CARTAO",
        dataLancamento: "2099-11-16",
        itens: [
          { produtoId: prod1.id, quantidadeDebitar: 1 },
          { produtoId: prod2.id, quantidadeDebitar: 1 },
          { produtoId: prod3.id, quantidadeDebitar: 2 },
        ],
        operadorObservacao: `${PREFIX} Ledger Tx 3`,
      });
      createdLancamentoIds.push(res3.lancamentoDiarioId);
      createdHistoricoIds.push(...res3.historicoIds);

      // Tx 4: DINHEIRO, Single item (5 x prod1 = 1665)
      const res4 = await executeDeductionTransaction({
        formaPagamento: "DINHEIRO",
        dataLancamento: "2099-11-16",
        itens: [{ produtoId: prod1.id, quantidadeDebitar: 5 }],
        operadorObservacao: `${PREFIX} Ledger Tx 4`,
      });
      createdLancamentoIds.push(res4.lancamentoDiarioId);
      createdHistoricoIds.push(...res4.historicoIds);

      // --- Strict Reconciliation Invariants ---

      // 1. Per-transaction parity: lancamento.totalDiarioCentavos == sum(linked historico_baixas)
      for (const lancId of [res1.lancamentoDiarioId, res2.lancamentoDiarioId, res3.lancamentoDiarioId, res4.lancamentoDiarioId]) {
        const lanc = await prisma.lancamentoDiario.findUniqueOrThrow({ where: { id: lancId } });
        const auditItems = await prisma.historicoBaixa.findMany({ where: { lancamentoDiarioId: lancId } });

        const auditSum = auditItems.reduce((acc, it) => acc + it.totalCentavos, 0);

        // Invariant: lancamento total strictly equals sum of linked audit records
        expect(lanc.totalDiarioCentavos).toBe(auditSum);

        // Invariant: totalDiarioCentavos == valorCartaoCentavos + valorDinheiroCentavos
        expect(lanc.totalDiarioCentavos).toBe(lanc.valorCartaoCentavos + lanc.valorDinheiroCentavos);

        // Invariant: payment method segregation
        for (const item of auditItems) {
          if (item.formaPagamento === "CARTAO") {
            expect(lanc.valorCartaoCentavos).toBeGreaterThan(0);
          } else if (item.formaPagamento === "DINHEIRO") {
            expect(lanc.valorDinheiroCentavos).toBeGreaterThan(0);
          }
        }
      }

      // 2. Aggregate batch reconciliation for this challenge batch
      const c4LancamentoIds = [res1.lancamentoDiarioId, res2.lancamentoDiarioId, res3.lancamentoDiarioId, res4.lancamentoDiarioId];
      const c4HistoricoIds = [...res1.historicoIds, ...res2.historicoIds, ...res3.historicoIds, ...res4.historicoIds];

      const testLancamentos = await prisma.lancamentoDiario.findMany({
        where: { id: { in: c4LancamentoIds } },
      });
      const testHistoricos = await prisma.historicoBaixa.findMany({
        where: { id: { in: c4HistoricoIds } },
      });

      const totalLancamentosCentavos = testLancamentos.reduce((acc, l) => acc + l.totalDiarioCentavos, 0);
      const totalHistoricosCentavos = testHistoricos.reduce((acc, h) => acc + h.totalCentavos, 0);

      const totalCartaoLancamentos = testLancamentos.reduce((acc, l) => acc + l.valorCartaoCentavos, 0);
      const totalCartaoHistoricos = testHistoricos
        .filter((h) => h.formaPagamento === "CARTAO")
        .reduce((acc, h) => acc + h.totalCentavos, 0);

      const totalDinheiroLancamentos = testLancamentos.reduce((acc, l) => acc + l.valorDinheiroCentavos, 0);
      const totalDinheiroHistoricos = testHistoricos
        .filter((h) => h.formaPagamento === "DINHEIRO")
        .reduce((acc, h) => acc + h.totalCentavos, 0);

      // Batch Ledger Parity
      expect(totalLancamentosCentavos).toBe(totalHistoricosCentavos);
      expect(totalCartaoLancamentos).toBe(totalCartaoHistoricos);
      expect(totalDinheiroLancamentos).toBe(totalDinheiroHistoricos);
      expect(totalLancamentosCentavos).toBe(totalCartaoLancamentos + totalDinheiroLancamentos);

      // Expected exact values for this batch:
      // Tx 1: 999 (Cartão)
      // Tx 2: 2804 (Dinheiro)
      // Tx 3: 3610 (Cartão)
      // Tx 4: 1665 (Dinheiro)
      // Total Cartão = 999 + 3610 = 4609
      // Total Dinheiro = 2804 + 1665 = 4469
      // Total Geral = 9078
      expect(totalCartaoLancamentos).toBe(4609);
      expect(totalDinheiroLancamentos).toBe(4469);
      expect(totalLancamentosCentavos).toBe(9078);

      // 3. Global ledger reconciliation across ALL test transactions in this suite
      const allSuiteLancamentos = await prisma.lancamentoDiario.findMany({
        where: { id: { in: createdLancamentoIds } },
      });
      const allSuiteHistoricos = await prisma.historicoBaixa.findMany({
        where: { id: { in: createdHistoricoIds } },
      });
      const globalLancamentosTotal = allSuiteLancamentos.reduce((acc, l) => acc + l.totalDiarioCentavos, 0);
      const globalHistoricosTotal = allSuiteHistoricos.reduce((acc, h) => acc + h.totalCentavos, 0);
      expect(globalLancamentosTotal).toBe(globalHistoricosTotal);
    });
  });

  // =========================================================================
  // Challenge 5: Input Validation & Boundary Hardening
  // =========================================================================
  describe("Challenge 5: Input Validation & Boundary Hardening", () => {
    it("ADV-C5-01: rejects invalid payment method (e.g. PIX, BOLETO, injection)", async () => {
      await expect(
        executeDeductionTransaction({
          formaPagamento: "PIX" as any,
          dataLancamento: "2099-11-20",
          itens: [{ produtoId: "valid-id", quantidadeDebitar: 1 }],
        })
      ).rejects.toThrow(DeductionValidationError);
    });

    it("ADV-C5-02: rejects invalid ISO dates (format, invalid separators, empty)", async () => {
      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "20-11-2099", // DD-MM-YYYY
          itens: [{ produtoId: "valid-id", quantidadeDebitar: 1 }],
        })
      ).rejects.toThrow(DeductionValidationError);

      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "",
          itens: [{ produtoId: "valid-id", quantidadeDebitar: 1 }],
        })
      ).rejects.toThrow(DeductionValidationError);
    });

    it("ADV-C5-03: rejects non-positive or non-integer debit quantities (0, negative, floating point)", async () => {
      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-20",
          itens: [{ produtoId: "valid-id", quantidadeDebitar: 0 }],
        })
      ).rejects.toThrow(DeductionValidationError);

      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-20",
          itens: [{ produtoId: "valid-id", quantidadeDebitar: -5 }],
        })
      ).rejects.toThrow(DeductionValidationError);

      await expect(
        executeDeductionTransaction({
          formaPagamento: "CARTAO",
          dataLancamento: "2099-11-20",
          itens: [{ produtoId: "valid-id", quantidadeDebitar: 1.5 }],
        })
      ).rejects.toThrow(DeductionValidationError);
    });

    it("ADV-C5-04: rejects empty items array or blank product ID", async () => {
      await expect(
        executeDeductionTransaction({
          formaPagamento: "DINHEIRO",
          dataLancamento: "2099-11-20",
          itens: [],
        })
      ).rejects.toThrow(DeductionValidationError);

      await expect(
        executeDeductionTransaction({
          formaPagamento: "DINHEIRO",
          dataLancamento: "2099-11-20",
          itens: [{ produtoId: "   ", quantidadeDebitar: 1 }],
        })
      ).rejects.toThrow(DeductionValidationError);
    });
  });
});
