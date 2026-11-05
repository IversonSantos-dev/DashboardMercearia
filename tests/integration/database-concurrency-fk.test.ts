import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../../src/lib/prisma";

describe("SQLite Pragmas, Concurrency, and Foreign Key Constraints", () => {
  const SYNTH_PRODUCT_PREFIX = "STRESS-CHALLENGE-";
  const createdProductIds: string[] = [];
  const createdLancamentoIds: string[] = [];
  const createdHistoricoIds: string[] = [];

  afterAll(async () => {
    // Guaranteed cleanup of any synthetic records
    try {
      if (createdHistoricoIds.length > 0) {
        await prisma.historicoBaixa.deleteMany({
          where: { id: { in: createdHistoricoIds } },
        });
      }
      // Also delete any historico matching prefix by product code
      await prisma.historicoBaixa.deleteMany({
        where: { codigoProduto: { startsWith: SYNTH_PRODUCT_PREFIX } },
      });

      if (createdProductIds.length > 0) {
        await prisma.produtoEstoque.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      await prisma.produtoEstoque.deleteMany({
        where: { codigo: { startsWith: SYNTH_PRODUCT_PREFIX } },
      });

      if (createdLancamentoIds.length > 0) {
        await prisma.lancamentoDiario.deleteMany({
          where: { id: { in: createdLancamentoIds } },
        });
      }
      await prisma.lancamentoDiario.deleteMany({
        where: { observacoes: { startsWith: SYNTH_PRODUCT_PREFIX } },
      });
    } catch (cleanupErr) {
      console.error("Cleanup error in afterAll:", cleanupErr);
    }
  });

  describe("PRAGMA Configuration Inspection", () => {
    it("should inspect journal_mode, busy_timeout, synchronous, and foreign_keys", async () => {
      const journalMode = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>(
        "PRAGMA journal_mode;"
      );
      const busyTimeout = await prisma.$queryRawUnsafe<Array<{ timeout: bigint | number }>>(
        "PRAGMA busy_timeout;"
      );
      const foreignKeys = await prisma.$queryRawUnsafe<Array<{ foreign_keys: bigint | number }>>(
        "PRAGMA foreign_keys;"
      );
      const synchronous = await prisma.$queryRawUnsafe<Array<{ synchronous: bigint | number }>>(
        "PRAGMA synchronous;"
      );

      console.log("Current Pragmas:", {
        journal_mode: journalMode[0]?.journal_mode,
        busy_timeout: busyTimeout[0]?.timeout?.toString(),
        foreign_keys: foreignKeys[0]?.foreign_keys?.toString(),
        synchronous: synchronous[0]?.synchronous?.toString(),
      });

      // Verification checks
      expect(foreignKeys[0]?.foreign_keys?.toString()).toBe("1");
      // WAL mode check
      expect(journalMode[0]?.journal_mode.toLowerCase()).toBe("wal");
      // busy_timeout check
      expect(Number(busyTimeout[0]?.timeout)).toBeGreaterThanOrEqual(5000);
    });
  });

  describe("Foreign Key Integrity (onDelete: Restrict)", () => {
    it("must prevent deletion of a product referenced in historico_baixas", async () => {
      // 1. Create synthetic product
      const product = await prisma.produtoEstoque.create({
        data: {
          codigo: `${SYNTH_PRODUCT_PREFIX}FK-PROD`,
          discriminacao: "Produto Teste FK Restrict",
          unidade: "UN",
          quantidade: 50,
          unitarioCentavos: 1000,
          totalCentavos: 50000,
          ativo: true,
        },
      });
      createdProductIds.push(product.id);

      // 2. Create synthetic lancamento
      const lancamento = await prisma.lancamentoDiario.create({
        data: {
          data: "2099-12-31",
          valorCartaoCentavos: 1000,
          valorDinheiroCentavos: 0,
          totalDiarioCentavos: 1000,
          observacoes: `${SYNTH_PRODUCT_PREFIX}Lancamento FK`,
        },
      });
      createdLancamentoIds.push(lancamento.id);

      // 3. Create synthetic historico referencing product
      const historico = await prisma.historicoBaixa.create({
        data: {
          produtoId: product.id,
          lancamentoDiarioId: lancamento.id,
          codigoProduto: product.codigo,
          discriminacaoProduto: product.discriminacao,
          quantidadeBaixada: 1,
          unitarioCentavos: 1000,
          totalCentavos: 1000,
          formaPagamento: "CARTAO",
        },
      });
      createdHistoricoIds.push(historico.id);

      // 4. Attempt to delete product via Prisma client - MUST FAIL with P2003 (Foreign Key Constraint)
      let prismaDeleteFailed = false;
      let errorCode = "";
      try {
        await prisma.produtoEstoque.delete({
          where: { id: product.id },
        });
      } catch (err: any) {
        prismaDeleteFailed = true;
        errorCode = err.code || "";
        console.log("Prisma delete rejected as expected:", err.code, err.message);
      }

      expect(prismaDeleteFailed).toBe(true);
      expect(errorCode).toBe("P2003");

      // 5. Attempt raw SQL delete - SQLite FK engine MUST also reject it
      let rawSqlDeleteFailed = false;
      try {
        await prisma.$executeRawUnsafe(
          "DELETE FROM produtos_estoque WHERE id = ?",
          product.id
        );
      } catch (err: any) {
        rawSqlDeleteFailed = true;
        console.log("Raw SQL delete rejected as expected:", err.message);
      }
      expect(rawSqlDeleteFailed).toBe(true);

      // 6. Test onDelete: SetNull on LancamentoDiario
      // Deleting lancamentoDiario should succeed and set lancamentoDiarioId to null in historico
      await prisma.lancamentoDiario.delete({
        where: { id: lancamento.id },
      });
      const updatedHistorico = await prisma.historicoBaixa.findUnique({
        where: { id: historico.id },
      });
      expect(updatedHistorico).not.toBeNull();
      expect(updatedHistorico?.lancamentoDiarioId).toBeNull();

      // Clean up historico and product
      await prisma.historicoBaixa.delete({ where: { id: historico.id } });
      await prisma.produtoEstoque.delete({ where: { id: product.id } });
    });
  });

  describe("Concurrent Read and Write Stress Test", () => {
    it("should handle 50 concurrent mixed read/write transactions without SQLITE_BUSY", async () => {
      // Create a pool of 5 products for concurrent contention
      const products = await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          prisma.produtoEstoque.create({
            data: {
              codigo: `${SYNTH_PRODUCT_PREFIX}CONC-${i}-${Date.now()}`,
              discriminacao: `Produto Concorrente ${i}`,
              unidade: "UN",
              quantidade: 1000,
              unitarioCentavos: 500,
              totalCentavos: 500000,
              ativo: true,
            },
          })
        )
      );

      for (const p of products) {
        createdProductIds.push(p.id);
      }

      const CONCURRENCY_LEVEL = 50;
      const tasks: Promise<any>[] = [];
      const errors: Error[] = [];

      // Launch 50 concurrent operations:
      // Half writes (transactions updating product & inserting history), half reads
      for (let i = 0; i < CONCURRENCY_LEVEL; i++) {
        const productIndex = i % products.length;
        const targetProduct = products[productIndex];

        if (i % 2 === 0) {
          // Write task: atomic transaction simulating deduction
          const writeTask = prisma
            .$transaction(async (tx) => {
              const current = await tx.produtoEstoque.findUniqueOrThrow({
                where: { id: targetProduct.id },
              });
              const newQtd = current.quantidade - 1;
              const updated = await tx.produtoEstoque.update({
                where: { id: targetProduct.id },
                data: {
                  quantidade: newQtd,
                  totalCentavos: newQtd * current.unitarioCentavos,
                },
              });

              const hist = await tx.historicoBaixa.create({
                data: {
                  produtoId: targetProduct.id,
                  codigoProduto: targetProduct.codigo,
                  discriminacaoProduto: targetProduct.discriminacao,
                  quantidadeBaixada: 1,
                  unitarioCentavos: current.unitarioCentavos,
                  totalCentavos: current.unitarioCentavos,
                  formaPagamento: "DINHEIRO",
                },
              });

              return { updated, hist };
            })
            .then((res) => {
              createdHistoricoIds.push(res.hist.id);
            })
            .catch((err) => {
              errors.push(err);
            });

          tasks.push(writeTask);
        } else {
          // Read task: query stock and history
          const readTask = Promise.all([
            prisma.produtoEstoque.findMany({
              where: { codigo: { startsWith: SYNTH_PRODUCT_PREFIX } },
            }),
            prisma.historicoBaixa.findMany({
              take: 10,
              orderBy: { dataHora: "desc" },
            }),
          ]).catch((err) => {
            errors.push(err);
          });

          tasks.push(readTask);
        }
      }

      await Promise.all(tasks);

      // Check if any SQLITE_BUSY or database locked error occurred
      const busyErrors = errors.filter(
        (err) =>
          err.message?.includes("SQLITE_BUSY") ||
          err.message?.includes("database is locked")
      );

      console.log(`Stress test completed: ${CONCURRENCY_LEVEL} concurrent tasks.`);
      console.log(`Total errors: ${errors.length}, SQLITE_BUSY errors: ${busyErrors.length}`);

      if (errors.length > 0) {
        console.error("Errors encountered:", errors.map((e) => e.message));
      }

      expect(busyErrors.length).toBe(0);
      expect(errors.length).toBe(0);

      // Verify data integrity: 25 writes should have decremented stock by exactly 25 in total
      const finalProducts = await prisma.produtoEstoque.findMany({
        where: { id: { in: products.map((p) => p.id) } },
      });
      const totalRemaining = finalProducts.reduce((acc, p) => acc + p.quantidade, 0);
      expect(totalRemaining).toBe(5000 - 25);
    });
  });
});
