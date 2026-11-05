import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import prisma from "../../src/lib/prisma";
import { POST } from "../../src/app/api/inventario/import/route";

const STRESS_PREFIX = "CHALLENGE-M2-";

/**
 * Helper to build an in-memory XLSX buffer conforming to Model P7 specification.
 */
function generateLargeP7Xlsx(
  count: number,
  prefix = STRESS_PREFIX,
  quantityTransform?: (index: number) => number
): Buffer {
  const rows: any[][] = [
    ["Supermercado Modelo P7 Stress Test Ltda", "", "", "CNPJ: 99.888.777/0001-11"],
    ["Livro Registro de Inventário Modelo P7 - Exercício 2026", "", "", "Data: 31/12/2025"],
    ["", "", "", ""],
    ["Código", "Barras", "NCM", "Discriminação", "Unid", "Qtd", "Unitário", "Total"],
  ];

  let calculatedGrandTotal = 0;

  for (let i = 1; i <= count; i++) {
    const code = `${prefix}${i.toString().padStart(6, "0")}`;
    const barcode = `789${i.toString().padStart(10, "0")}`;
    const ncm = "2106.90.90";
    const desc = `Produto Teste Stress Ingestao #${i}`;
    const unit = i % 5 === 0 ? "KG" : i % 3 === 0 ? "CX" : "UN";
    const qty = quantityTransform ? quantityTransform(i) : (i % 20) + 1;
    const unitPriceFloat = Number(((i % 100) * 0.5 + 1.99).toFixed(2));
    const totalFloat = Number((qty * unitPriceFloat).toFixed(2));
    calculatedGrandTotal += totalFloat;

    rows.push([
      code,
      barcode,
      ncm,
      desc,
      unit,
      qty,
      unitPriceFloat.toFixed(2).replace(".", ","),
      totalFloat.toFixed(2).replace(".", ","),
    ]);
  }

  // P7 Footer Row
  rows.push([
    "",
    "",
    "",
    "TOTAL GERAL DO INVENTÁRIO",
    "",
    "",
    "",
    calculatedGrandTotal.toFixed(2).replace(".", ","),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "InventarioP7_Stress");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/**
 * Helper to create a NextRequest with multipart/form-data.
 */
function createMultipartRequest(
  fileBuffer: Buffer,
  fileName = "stress_inventario.xlsx",
  dryRun = false
): NextRequest {
  const url = new URL("http://localhost:3000/api/inventario/import");
  if (dryRun) {
    url.searchParams.set("dryRun", "true");
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], {
    type: fileName.endsWith(".csv")
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  formData.append("file", blob, fileName);

  return new NextRequest(url.toString(), {
    method: "POST",
    body: formData,
  });
}

/**
 * Strict database cleaner for synthetic stress records.
 */
async function cleanStressRecords() {
  try {
    // 1. Delete dependent HistoricoBaixa
    await prisma.historicoBaixa.deleteMany({
      where: {
        OR: [
          { codigoProduto: { startsWith: STRESS_PREFIX } },
          { discriminacaoProduto: { contains: "Stress Ingestao" } },
        ],
      },
    });

    // 2. Delete ProdutoEstoque
    await prisma.produtoEstoque.deleteMany({
      where: {
        OR: [
          { codigo: { startsWith: STRESS_PREFIX } },
          { discriminacao: { contains: "Stress Ingestao" } },
        ],
      },
    });
  } catch (err) {
    console.error("[cleanStressRecords] Error cleaning test data:", err);
  }
}

describe("M2 Empirical Stress Challenge: Inventory Import & Transactional Upsert", () => {
  beforeAll(async () => {
    await cleanStressRecords();
  });

  afterAll(async () => {
    await cleanStressRecords();
  });

  beforeEach(async () => {
    await cleanStressRecords();
  });

  // =========================================================================
  // CHALLENGE 1: Large Spreadsheet Ingestion (600+ items)
  // =========================================================================
  describe("Challenge 1: Large Spreadsheet Ingestion (500+ items)", () => {
    it("should successfully ingest and commit 600 items in a single file within performance bounds", async () => {
      const ITEM_COUNT = 600;
      const startTime = performance.now();

      const buffer = generateLargeP7Xlsx(ITEM_COUNT);
      const generationTimeMs = performance.now() - startTime;
      console.log(`[Stress Test] Generated 600 items XLSX in ${generationTimeMs.toFixed(1)}ms`);

      const req = createMultipartRequest(buffer, "stress_600_items.xlsx", false);

      const importStartTime = performance.now();
      const res = await POST(req);
      const importDurationMs = performance.now() - importStartTime;
      console.log(`[Stress Test] Ingested and upserted 600 items in ${importDurationMs.toFixed(1)}ms`);

      const json = await res.json();

      // Assert HTTP response
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.summary.totalItensImportados).toBe(ITEM_COUNT);
      expect(json.summary.novosCadastrados).toBe(ITEM_COUNT);
      expect(json.summary.atualizados).toBe(0);
      expect(json.summary.totalItensQuarentena).toBe(0);

      // Verify throughput: 600 items should complete well within 15 seconds
      expect(importDurationMs).toBeLessThan(15000);

      // Verify Database records directly
      const totalInDb = await prisma.produtoEstoque.count({
        where: { codigo: { startsWith: STRESS_PREFIX } },
      });
      expect(totalInDb).toBe(ITEM_COUNT);

      // Spot check first, middle, and last item
      const firstItem = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${STRESS_PREFIX}000001` },
      });
      expect(firstItem.discriminacao).toBe("Produto Teste Stress Ingestao #1");
      expect(firstItem.ativo).toBe(true);
      expect(firstItem.quantidade).toBeGreaterThan(0);
      expect(firstItem.unitarioCentavos).toBeGreaterThan(0);
      expect(firstItem.totalCentavos).toBe(firstItem.quantidade * firstItem.unitarioCentavos);

      const midItem = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${STRESS_PREFIX}000300` },
      });
      expect(midItem.discriminacao).toBe("Produto Teste Stress Ingestao #300");
      expect(midItem.ativo).toBe(true);

      const lastItem = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${STRESS_PREFIX}000600` },
      });
      expect(lastItem.discriminacao).toBe("Produto Teste Stress Ingestao #600");
      expect(lastItem.ativo).toBe(true);
    });

    it("should handle boundary stress: 1,200 items without SQLite parameter limit exhaustion", async () => {
      const ITEM_COUNT = 1200;
      const buffer = generateLargeP7Xlsx(ITEM_COUNT);
      const req = createMultipartRequest(buffer, "stress_1200_items.xlsx", false);

      const importStartTime = performance.now();
      const res = await POST(req);
      const importDurationMs = performance.now() - importStartTime;
      console.log(`[Stress Test] Ingested 1200 items in ${importDurationMs.toFixed(1)}ms`);

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.summary.totalItensImportados).toBe(ITEM_COUNT);
      expect(json.summary.novosCadastrados).toBe(ITEM_COUNT);

      const totalInDb = await prisma.produtoEstoque.count({
        where: { codigo: { startsWith: STRESS_PREFIX } },
      });
      expect(totalInDb).toBe(ITEM_COUNT);
    });
  });

  // =========================================================================
  // CHALLENGE 2: Idempotency & Re-import
  // =========================================================================
  describe("Challenge 2: Idempotency & Re-import Guarantees", () => {
    it("should maintain identical counts and zero duplicate errors when importing the exact same file twice", async () => {
      const ITEM_COUNT = 250;
      const buffer = generateLargeP7Xlsx(ITEM_COUNT);

      // RUN 1: Initial Ingestion
      const req1 = createMultipartRequest(buffer, "idempotency_run1.xlsx", false);
      const res1 = await POST(req1);
      const json1 = await res1.json();

      expect(res1.status).toBe(200);
      expect(json1.success).toBe(true);
      expect(json1.summary.novosCadastrados).toBe(ITEM_COUNT);
      expect(json1.summary.atualizados).toBe(0);

      const countAfterRun1 = await prisma.produtoEstoque.count({
        where: { codigo: { startsWith: STRESS_PREFIX } },
      });
      expect(countAfterRun1).toBe(ITEM_COUNT);

      // RUN 2: Re-import identical file
      const req2 = createMultipartRequest(buffer, "idempotency_run2.xlsx", false);
      const res2 = await POST(req2);
      const json2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(json2.success).toBe(true);
      expect(json2.summary.novosCadastrados).toBe(0);
      expect(json2.summary.atualizados).toBe(ITEM_COUNT);
      expect(json2.summary.totalItensImportados).toBe(ITEM_COUNT);

      // CRITICAL ASSERTION: Total DB record count MUST remain exactly ITEM_COUNT
      const countAfterRun2 = await prisma.produtoEstoque.count({
        where: { codigo: { startsWith: STRESS_PREFIX } },
      });
      expect(countAfterRun2).toBe(ITEM_COUNT);
    });

    it("should cleanly replace stock balance and update active state upon re-importing updated quantities", async () => {
      const ITEM_COUNT = 100;

      // File 1: Initial quantities (all > 0)
      const buffer1 = generateLargeP7Xlsx(ITEM_COUNT, STRESS_PREFIX, () => 50);
      const req1 = createMultipartRequest(buffer1, "batch1.xlsx", false);
      const res1 = await POST(req1);
      expect(res1.status).toBe(200);

      const initialProd = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${STRESS_PREFIX}000010` },
      });
      expect(initialProd.quantidade).toBe(50);
      expect(initialProd.ativo).toBe(true);

      // File 2: Updated quantities — item 10 has qty 0 (out of stock), item 20 has qty 125
      const buffer2 = generateLargeP7Xlsx(ITEM_COUNT, STRESS_PREFIX, (idx) => {
        if (idx === 10) return 0;
        if (idx === 20) return 125;
        return 30;
      });

      const req2 = createMultipartRequest(buffer2, "batch2_updated.xlsx", false);
      const res2 = await POST(req2);
      const json2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(json2.summary.atualizados).toBe(ITEM_COUNT);
      expect(json2.summary.novosCadastrados).toBe(0);

      // Assert Item 10 was deactivated (saldo físico zerado)
      const prod10 = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${STRESS_PREFIX}000010` },
      });
      expect(prod10.quantidade).toBe(0);
      expect(prod10.ativo).toBe(false);

      // Assert Item 20 replaced balance with 125 (NOT 50 + 125 = 175)
      const prod20 = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${STRESS_PREFIX}000020` },
      });
      expect(prod20.quantidade).toBe(125);
      expect(prod20.ativo).toBe(true);
    });
  });

  // =========================================================================
  // CHALLENGE 3: Atomic Rollback on Mid-Transaction Database Error
  // =========================================================================
  describe("Challenge 3: Atomic Rollback on Mid-Transaction Database Error", () => {
    it("should rollback all previously processed chunks if an abort occurs midway through the transaction", async () => {
      // We will create a spreadsheet with 120 items.
      // Chunk size is 50, so this spans 3 chunks:
      // Chunk 1: items 1..50
      // Chunk 2: items 51..100
      // Chunk 3: items 101..120
      const ITEM_COUNT = 120;
      const buffer = generateLargeP7Xlsx(ITEM_COUNT);

      // We install a native SQLite trigger that aborts insertion when encountering item #75
      const ABORT_CODE = `${STRESS_PREFIX}000075`;
      const TRIGGER_NAME = "trg_adversarial_abort_test";

      // 1. Install SQLite trigger
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER IF NOT EXISTS ${TRIGGER_NAME}
        BEFORE INSERT ON produtos_estoque
        FOR EACH ROW
        WHEN NEW.codigo = '${ABORT_CODE}'
        BEGIN
          SELECT RAISE(ABORT, 'ADVERSARIAL_SQLITE_FAILURE_MID_TRANSACTION');
        END;
      `);

      try {
        const req = createMultipartRequest(buffer, "adversarial_rollback.xlsx", false);

        // Execute import — this MUST fail and throw inside the transaction
        const res = await POST(req);
        const json = await res.json();

        // The endpoint should catch the error and return HTTP 500
        expect(res.status).toBe(500);
        expect(json.success).toBe(false);
        expect(json.error).toContain("Erro interno no servidor");

        // CRITICAL EMPIRICAL VERIFICATION:
        // Even though Chunk 1 (items 1..50) and part of Chunk 2 (items 51..74) were executed,
        // the atomic rollback MUST ensure that ZERO items were committed to the database!
        const leftoverCount = await prisma.produtoEstoque.count({
          where: { codigo: { startsWith: STRESS_PREFIX } },
        });

        console.log(`[Atomic Rollback Test] Remaining items in DB after rollback: ${leftoverCount}`);
        expect(leftoverCount).toBe(0);
      } finally {
        // Clean up the test trigger
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME};`);
      }
    });

    it("should rollback updates atomically if a failure occurs during re-import, preserving original values", async () => {
      // 1. Seed 60 initial items with quantity = 10
      const SEED_COUNT = 60;
      const initialBuffer = generateLargeP7Xlsx(SEED_COUNT, `${STRESS_PREFIX}ROLL-UPD-`, () => 10);
      const reqSeed = createMultipartRequest(initialBuffer, "seed_for_rollback.xlsx", false);
      const resSeed = await POST(reqSeed);
      expect(resSeed.status).toBe(200);

      // Verify initial state
      const sampleItemBefore = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${STRESS_PREFIX}ROLL-UPD-000005` },
      });
      expect(sampleItemBefore.quantidade).toBe(10);

      // 2. Install SQLite abort trigger on UPDATE for item #40
      const ABORT_CODE = `${STRESS_PREFIX}ROLL-UPD-000040`;
      const TRIGGER_NAME = "trg_update_abort_test";

      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER IF NOT EXISTS ${TRIGGER_NAME}
        BEFORE UPDATE ON produtos_estoque
        FOR EACH ROW
        WHEN NEW.codigo = '${ABORT_CODE}'
        BEGIN
          SELECT RAISE(ABORT, 'ADVERSARIAL_SQLITE_UPDATE_FAILURE');
        END;
      `);

      try {
        // 3. Attempt re-import that tries to update all 60 items to quantity = 999
        const updateBuffer = generateLargeP7Xlsx(SEED_COUNT, `${STRESS_PREFIX}ROLL-UPD-`, () => 999);
        const reqUpdate = createMultipartRequest(updateBuffer, "update_with_abort.xlsx", false);

        const resUpdate = await POST(reqUpdate);
        expect(resUpdate.status).toBe(500);

        // 4. CRITICAL VERIFICATION:
        // Even though items 1..39 were processed in Chunk 1 and part of Chunk 2,
        // the rollback must ensure that ALL 60 items still have their original quantity = 10!
        const sample1 = await prisma.produtoEstoque.findUniqueOrThrow({
          where: { codigo: `${STRESS_PREFIX}ROLL-UPD-000005` },
        });
        const sample2 = await prisma.produtoEstoque.findUniqueOrThrow({
          where: { codigo: `${STRESS_PREFIX}ROLL-UPD-000030` },
        });
        const sample3 = await prisma.produtoEstoque.findUniqueOrThrow({
          where: { codigo: `${STRESS_PREFIX}ROLL-UPD-000055` },
        });

        expect(sample1.quantidade).toBe(10);
        expect(sample2.quantidade).toBe(10);
        expect(sample3.quantidade).toBe(10);

        console.log("[Atomic Update Rollback] All items preserved original state of qty=10.");
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME};`);
        await prisma.produtoEstoque.deleteMany({
          where: { codigo: { startsWith: `${STRESS_PREFIX}ROLL-UPD-` } },
        });
      }
    });
  });

  // =========================================================================
  // CHALLENGE 4: Concurrency & Lock Stress Under WAL Mode
  // =========================================================================
  describe("Challenge 4: Concurrency & Lock Contention", () => {
    it("should handle concurrent import requests without database lock corruption", async () => {
      const BATCH_SIZE = 100;
      const bufferA = generateLargeP7Xlsx(BATCH_SIZE, `${STRESS_PREFIX}CONC-A-`);
      const bufferB = generateLargeP7Xlsx(BATCH_SIZE, `${STRESS_PREFIX}CONC-B-`);

      const reqA = createMultipartRequest(bufferA, "concurrent_a.xlsx", false);
      const reqB = createMultipartRequest(bufferB, "concurrent_b.xlsx", false);

      // Fire both imports concurrently
      const startTime = performance.now();
      const [resA, resB] = await Promise.all([POST(reqA), POST(reqB)]);
      const durationMs = performance.now() - startTime;
      console.log(`[Stress Test] 2 Concurrent 100-item imports completed in ${durationMs.toFixed(1)}ms`);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const jsonA = await resA.json();
      const jsonB = await resB.json();

      expect(jsonA.success).toBe(true);
      expect(jsonB.success).toBe(true);

      const countA = await prisma.produtoEstoque.count({
        where: { codigo: { startsWith: `${STRESS_PREFIX}CONC-A-` } },
      });
      const countB = await prisma.produtoEstoque.count({
        where: { codigo: { startsWith: `${STRESS_PREFIX}CONC-B-` } },
      });

      expect(countA).toBe(BATCH_SIZE);
      expect(countB).toBe(BATCH_SIZE);

      // Cleanup concurrent batches
      await prisma.produtoEstoque.deleteMany({
        where: { codigo: { startsWith: STRESS_PREFIX } },
      });
    });
  });
});
