import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "../../src/lib/prisma";
import {
  getDailySales,
  getDailySalesRange,
  getMonthlyConsolidation,
  getDetailedMonthlyConsolidation,
  CANONICAL_EXPENSE_CATEGORIES,
} from "../../src/modules/financeiro";
import { centavosToBRL, addMoney, multiplyMoney } from "../../src/modules/currency";
import { GET as getConsolidado } from "../../src/app/api/financeiro/consolidado/route";
import { GET as getDiario } from "../../src/app/api/financeiro/diario/route";
import { GET as getDespesas, POST as postDespesas, DELETE as deleteDespesas } from "../../src/app/api/despesas/route";
import { DELETE as deleteDespesaById } from "../../src/app/api/despesas/[id]/route";
import { GET as getProdutos } from "../../src/app/api/inventario/produtos/route";

describe("Milestone 4 Adversarial Empirical Suite (Challenger 2): Financial Consolidation, Expenses & Inventory API", () => {
  const PREFIX = "ADV-CH2-";
  const createdProductIds: string[] = [];
  const createdLancamentoIds: string[] = [];
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
      console.warn("Cleanup warning in m4-challenger2 test:", err);
    }
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();

    // Verify DB cleanliness: 0 lingering test fixtures
    const remainingProducts = await prisma.produtoEstoque.count({
      where: { codigo: { startsWith: PREFIX } },
    });
    const remainingSales = await prisma.lancamentoDiario.count({
      where: { observacoes: { startsWith: PREFIX } },
    });
    const remainingExpenses = await prisma.despesaMensal.count({
      where: { descricao: { startsWith: PREFIX } },
    });

    expect(remainingProducts).toBe(0);
    expect(remainingSales).toBe(0);
    expect(remainingExpenses).toBe(0);
  });

  function makeReq(url: string, method: string = "GET", body?: any): NextRequest {
    if (body !== undefined) {
      return new NextRequest(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    return new NextRequest(url, { method });
  }

  // =========================================================================
  // Challenge 1: Financial Aggregation & Boundary Logic
  // =========================================================================
  describe("Challenge 1: Financial Aggregation & Boundary Logic", () => {
    it("ADV-F1-01: getDailySales('2099-01-01') returns exact zeroes without throwing", async () => {
      const futureDate = "2099-01-01";
      const res = await getDailySales(futureDate);

      expect(res).toEqual({
        data: futureDate,
        totalCartaoCentavos: 0,
        totalDinheiroCentavos: 0,
        totalGeralCentavos: 0,
        quantidadeLancamentos: 0,
      });
    });

    it("ADV-F1-02: getDailySales on leap day '2096-02-29' returns exact zeroes without throwing", async () => {
      const leapDay = "2096-02-29";
      const res = await getDailySales(leapDay);
      expect(res.data).toBe(leapDay);
      expect(res.totalGeralCentavos).toBe(0);
      expect(res.quantidadeLancamentos).toBe(0);
    });

    it("ADV-F1-03: getDailySales rejects malformed date strings and injection attempts", async () => {
      const invalidInputs = [
        "2026/01/01",
        "01-01-2026",
        "",
        "   ",
        "2026-1",
        "2026-01-01; DROP TABLE produtos_estoque;",
        "invalid-date",
      ];

      for (const input of invalidInputs) {
        await expect(getDailySales(input)).rejects.toThrow(/Data inválida/);
      }
    });

    it("ADV-F1-04: getDailySalesRange rejects invalid date range formats", async () => {
      await expect(getDailySalesRange("invalid", "2099-01-01")).rejects.toThrow(
        /Intervalo de datas inválido/
      );
      await expect(getDailySalesRange("2099-01-01", "invalid")).rejects.toThrow(
        /Intervalo de datas inválido/
      );
    });

    it("ADV-F1-05: getDailySalesRange with inverted range [endDate, startDate] returns empty array cleanly", async () => {
      const res = await getDailySalesRange("2099-12-31", "2099-01-01");
      expect(res).toEqual([]);
    });

    it("ADV-F1-06: getMonthlyConsolidation on empty month returns zeroes without throwing", async () => {
      const emptyMonth = "2099-11";
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

    it("ADV-F1-07: Monthly consolidation with deficit produces negative saldoLiquidoCentavos and formatted '-R$ ...' (T2-B23)", async () => {
      const testMonth = "2098-08";

      // 1. Sales: R$ 150,00 (Card: 100,00, Cash: 50,00)
      const l = await prisma.lancamentoDiario.create({
        data: {
          data: `${testMonth}-05`,
          valorCartaoCentavos: 10000,
          valorDinheiroCentavos: 5000,
          totalDiarioCentavos: 15000,
          observacoes: `${PREFIX}venda-deficit`,
        },
      });
      createdLancamentoIds.push(l.id);

      // 2. Expenses: R$ 450,00 (Deficit of R$ 300,00)
      const d = await prisma.despesaMensal.create({
        data: {
          mesAno: testMonth,
          descricao: `${PREFIX}Aluguel Comercial`,
          categoria: "CONTAS_FIXAS",
          valorCentavos: 45000,
          dataPagamento: `${testMonth}-10`,
        },
      });
      createdDespesaIds.push(d.id);

      const res = await getMonthlyConsolidation(testMonth);
      expect(res.totalEntradasCentavos).toBe(15000);
      expect(res.totalSaidasCentavos).toBe(45000);
      expect(res.saldoLiquidoCentavos).toBe(-30000); // Negative integer cents

      const detailed = await getDetailedMonthlyConsolidation(testMonth);
      expect(detailed.totalEntradasBRL).toBe("R$ 150,00");
      expect(detailed.totalSaidasBRL).toBe("R$ 450,00");
      expect(detailed.saldoLiquidoBRL).toBe("-R$ 300,00"); // Formatted negative BRL
      expect(detailed.saldoLiquidoCentavos).toBe(-30000);
      expect(detailed.margemLiquidaPercentual).toBe(-200); // (-30000 / 15000) * 100
    });

    it("ADV-F1-08: Zero-revenue month with expenses produces deficit without division by zero NaN", async () => {
      const testMonth = "2098-09";

      // Only expenses, no sales
      const d = await prisma.despesaMensal.create({
        data: {
          mesAno: testMonth,
          descricao: `${PREFIX}Taxas Bancárias`,
          categoria: "OPERACIONAL",
          valorCentavos: 12500, // R$ 125,00
          dataPagamento: `${testMonth}-01`,
        },
      });
      createdDespesaIds.push(d.id);

      const detailed = await getDetailedMonthlyConsolidation(testMonth);
      expect(detailed.totalEntradasCentavos).toBe(0);
      expect(detailed.totalSaidasCentavos).toBe(12500);
      expect(detailed.saldoLiquidoCentavos).toBe(-12500);
      expect(detailed.saldoLiquidoBRL).toBe("-R$ 125,00");
      expect(detailed.margemLiquidaPercentual).toBe(0); // Safe fallback (no NaN or -Infinity)
    });

    it("ADV-F1-09: Detailed consolidation breaks down across all 6 canonical categories with accurate percentages", async () => {
      const testMonth = "2098-10";

      const amounts: Record<string, number> = {
        OPERACIONAL: 10000, // R$ 100,00
        MERCADORIA: 20000, // R$ 200,00
        CONTAS_FIXAS: 30000, // R$ 300,00
        PESSOAL: 15000, // R$ 150,00
        IMPOSTOS: 15000, // R$ 150,00
        OUTROS: 10000, // R$ 100,00
      };
      // Total expenses = 100.000 centavos = R$ 1.000,00

      for (const [cat, val] of Object.entries(amounts)) {
        const d = await prisma.despesaMensal.create({
          data: {
            mesAno: testMonth,
            descricao: `${PREFIX}Despesa ${cat}`,
            categoria: cat,
            valorCentavos: val,
            dataPagamento: `${testMonth}-05`,
          },
        });
        createdDespesaIds.push(d.id);
      }

      const detailed = await getDetailedMonthlyConsolidation(testMonth);
      expect(detailed.totalSaidasCentavos).toBe(100000);
      expect(detailed.totalSaidasBRL).toBe("R$ 1.000,00");
      expect(detailed.despesasPorCategoria.length).toBe(6);

      // Verify category ordering: highest amount first
      expect(detailed.despesasPorCategoria[0].categoria).toBe("CONTAS_FIXAS");
      expect(detailed.despesasPorCategoria[0].totalCentavos).toBe(30000);
      expect(detailed.despesasPorCategoria[0].percentual).toBe(30);

      expect(detailed.despesasPorCategoria[1].categoria).toBe("MERCADORIA");
      expect(detailed.despesasPorCategoria[1].percentual).toBe(20);

      // Check sum of percentages equals 100%
      const totalPct = detailed.despesasPorCategoria.reduce((acc: number, c: { percentual: number }) => acc + c.percentual, 0);
      expect(Math.round(totalPct)).toBe(100);
    });
  });

  // =========================================================================
  // Challenge 2: Expense Validation & API Subsystem
  // =========================================================================
  describe("Challenge 2: Expense Validation & API Subsystem", () => {
    it("ADV-EXP-01: Successfully creates expense for each of the 6 canonical categories", async () => {
      const testMonth = "2095-01";

      for (const cat of CANONICAL_EXPENSE_CATEGORIES) {
        const req = makeReq("http://localhost:3000/api/despesas", "POST", {
          descricao: `${PREFIX}Despesa Valida ${cat}`,
          categoria: cat,
          valorCentavos: 5000,
          mesAno: testMonth,
        });

        const res = await postDespesas(req);
        const data = await res.json();

        expect(res.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.despesa.categoria).toBe(cat);
        expect(data.despesa.valorCentavos).toBe(5000);
        expect(data.despesa.valorBRL).toBe("R$ 50,00");

        createdDespesaIds.push(data.despesa.id);
      }
    });

    it("ADV-EXP-02: Normalizes lowercase canonical category to uppercase", async () => {
      const req = makeReq("http://localhost:3000/api/despesas", "POST", {
        descricao: `${PREFIX}Despesa Lowercase`,
        categoria: "operacional",
        valorCentavos: 3500,
        mesAno: "2095-02",
      });

      const res = await postDespesas(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.despesa.categoria).toBe("OPERACIONAL");

      createdDespesaIds.push(data.despesa.id);
    });

    it("ADV-EXP-03: Rejects invalid or arbitrary non-canonical categories with 400 status", async () => {
      const invalidCategories = [
        "MARKETING",
        "INVESTIMENTO",
        "LOGISTICA",
        "ALEATORIA",
        "123",
        "",
      ];

      for (const cat of invalidCategories) {
        const req = makeReq("http://localhost:3000/api/despesas", "POST", {
          descricao: `${PREFIX}Despesa Invalida`,
          categoria: cat,
          valorCentavos: 1000,
          mesAno: "2095-03",
        });

        const res = await postDespesas(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toContain("Categoria inválida");
      }
    });

    it("ADV-EXP-04: Rejects non-positive, zero, or negative monetary amounts with 400 status", async () => {
      const invalidAmounts = [
        { valorCentavos: 0 },
        { valorCentavos: -100 },
        { valorCentavos: -1 },
        { valor: "R$ 0,00" },
        { valor: "0,00" },
        { valor: "-R$ 50,00" },
        { valorCentavos: 12.34 }, // Non-integer
        {}, // Missing valor
      ];

      for (const amountPayload of invalidAmounts) {
        const req = makeReq("http://localhost:3000/api/despesas", "POST", {
          descricao: `${PREFIX}Teste Valor`,
          categoria: "OPERACIONAL",
          mesAno: "2095-04",
          ...amountPayload,
        });

        const res = await postDespesas(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
      }
    });

    it("ADV-EXP-05: Rejects missing, empty, or whitespace-only descriptions with 400 status", async () => {
      const invalidDescriptions = ["", "   ", "\t\n", null, undefined];

      for (const desc of invalidDescriptions) {
        const req = makeReq("http://localhost:3000/api/despesas", "POST", {
          descricao: desc,
          categoria: "OPERACIONAL",
          valorCentavos: 1000,
          mesAno: "2095-05",
        });

        const res = await postDespesas(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
      }
    });

    it("ADV-EXP-06: Rejects malformed payment date or month with 400 status", async () => {
      const invalidDates = [
        { dataPagamento: "2026/12/31" },
        { dataPagamento: "31-12-2026" },
        { dataPagamento: "invalid-date" },
        { mesAno: "2026-1" },
        { mesAno: "invalid-month" },
      ];

      for (const datePayload of invalidDates) {
        const req = makeReq("http://localhost:3000/api/despesas", "POST", {
          descricao: `${PREFIX}Teste Data`,
          categoria: "OPERACIONAL",
          valorCentavos: 1000,
          ...datePayload,
        });

        const res = await postDespesas(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
      }
    });

    it("ADV-EXP-07: Deletes expense via DELETE /api/despesas?id= and handles 404 for non-existent ID", async () => {
      // 1. Create expense
      const d = await prisma.despesaMensal.create({
        data: {
          mesAno: "2095-06",
          descricao: `${PREFIX}Para Exclusao`,
          categoria: "OUTROS",
          valorCentavos: 2500,
        },
      });

      // 2. Delete existing
      const deleteReq = makeReq(`http://localhost:3000/api/despesas?id=${d.id}`, "DELETE");
      const deleteRes = await deleteDespesas(deleteReq);
      const deleteData = await deleteRes.json();

      expect(deleteRes.status).toBe(200);
      expect(deleteData.success).toBe(true);
      expect(deleteData.idExcluido).toBe(d.id);

      // Verify deletion from DB
      const check = await prisma.despesaMensal.findUnique({ where: { id: d.id } });
      expect(check).toBeNull();

      // 3. Delete non-existent ID returns 404
      const notFoundReq = makeReq("http://localhost:3000/api/despesas?id=id-fantasma-9999", "DELETE");
      const notFoundRes = await deleteDespesas(notFoundReq);
      expect(notFoundRes.status).toBe(404);
    });

    it("ADV-EXP-08: Deletes expense via dynamic route DELETE /api/despesas/[id]", async () => {
      const d = await prisma.despesaMensal.create({
        data: {
          mesAno: "2095-07",
          descricao: `${PREFIX}Para Exclusao Dinamica`,
          categoria: "MERCADORIA",
          valorCentavos: 4200,
        },
      });

      const req = makeReq(`http://localhost:3000/api/despesas/${d.id}`, "DELETE");
      const res = await deleteDespesaById(req, { params: Promise.resolve({ id: d.id }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.idExcluido).toBe(d.id);

      const check = await prisma.despesaMensal.findUnique({ where: { id: d.id } });
      expect(check).toBeNull();
    });
  });

  // =========================================================================
  // Challenge 3: Inventory Products API (`GET /api/inventario/produtos`)
  // =========================================================================
  describe("Challenge 3: Inventory Products API (`GET /api/inventario/produtos`)", () => {
    beforeAll(async () => {
      // Seed dedicated test products
      const productsData = [
        {
          codigo: `${PREFIX}SKU-101`,
          barras: "7891000000101",
          discriminacao: "Arroz Agulhinha Tipo 1 5kg Especial",
          quantidade: 50,
          unitarioCentavos: 2890, // R$ 28,90
          totalCentavos: 50 * 2890,
          ativo: true,
        },
        {
          codigo: `${PREFIX}SKU-102`,
          barras: "7891000000102",
          discriminacao: "Feijão Preto Nobre 1kg",
          quantidade: 30,
          unitarioCentavos: 850, // R$ 8,50
          totalCentavos: 30 * 850,
          ativo: true,
        },
        {
          codigo: `${PREFIX}SKU-103`,
          barras: "7891000000103",
          discriminacao: "Óleo de Soja Refinado 900ml",
          quantidade: 0,
          unitarioCentavos: 620, // R$ 6,20
          totalCentavos: 0,
          ativo: false, // Out of stock
        },
        {
          codigo: `${PREFIX}SKU-104`,
          barras: "7891000000104",
          discriminacao: "Açúcar Cristal Branco 1kg",
          quantidade: 100,
          unitarioCentavos: 430, // R$ 4,30
          totalCentavos: 100 * 430,
          ativo: true,
        },
        {
          codigo: `${PREFIX}SKU-105`,
          barras: "7891000000105",
          discriminacao: "Café Torrado e Moído 500g",
          quantidade: 5,
          unitarioCentavos: 1890, // R$ 18,90
          totalCentavos: 5 * 1890,
          ativo: true,
        },
      ];

      for (const p of productsData) {
        const created = await prisma.produtoEstoque.create({ data: p });
        createdProductIds.push(created.id);
      }
    });

    it("ADV-INV-01: Multi-attribute search filter across code, barcode, and description with Portuguese accents", async () => {
      // 1. Search by partial code
      const reqCode = makeReq(`http://localhost:3000/api/inventario/produtos?q=SKU-101`);
      const resCode = await getProdutos(reqCode);
      const dataCode = await resCode.json();
      expect(resCode.status).toBe(200);
      expect(dataCode.produtos.some((p: any) => p.codigo === `${PREFIX}SKU-101`)).toBe(true);

      // 2. Search by exact barcode EAN
      const reqBar = makeReq(`http://localhost:3000/api/inventario/produtos?q=7891000000102`);
      const resBar = await getProdutos(reqBar);
      const dataBar = await resBar.json();
      expect(dataBar.produtos.some((p: any) => p.barras === "7891000000102")).toBe(true);

      // 3. Search with Portuguese accents
      const reqAccent = makeReq(`http://localhost:3000/api/inventario/produtos?q=Feijão Preto`);
      const resAccent = await getProdutos(reqAccent);
      const dataAccent = await resAccent.json();
      expect(dataAccent.produtos.some((p: any) => p.codigo === `${PREFIX}SKU-102`)).toBe(true);
    });

    it("ADV-INV-02: Status filtering distinguishes 'em_estoque' vs 'esgotado'", async () => {
      // In-stock items
      const reqIn = makeReq(`http://localhost:3000/api/inventario/produtos?q=${PREFIX}&status=em_estoque&limit=100`);
      const resIn = await getProdutos(reqIn);
      const dataIn = await resIn.json();

      expect(dataIn.produtos.some((p: any) => p.codigo === `${PREFIX}SKU-101`)).toBe(true);
      expect(dataIn.produtos.some((p: any) => p.codigo === `${PREFIX}SKU-103`)).toBe(false); // Out of stock
      // Every in-stock item must have quantidade > 0 and ativo === true
      for (const p of dataIn.produtos) {
        expect(p.quantidade).toBeGreaterThan(0);
        expect(p.ativo).toBe(true);
      }

      // Out-of-stock items
      const reqOut = makeReq(`http://localhost:3000/api/inventario/produtos?q=${PREFIX}&status=esgotado&limit=100`);
      const resOut = await getProdutos(reqOut);
      const dataOut = await resOut.json();

      expect(dataOut.produtos.some((p: any) => p.codigo === `${PREFIX}SKU-103`)).toBe(true);
      expect(dataOut.produtos.some((p: any) => p.codigo === `${PREFIX}SKU-101`)).toBe(false);
      // Every out-of-stock item must have quantidade <= 0 OR ativo === false
      for (const p of dataOut.produtos) {
        expect(p.quantidade <= 0 || p.ativo === false).toBe(true);
      }
    });

    it("ADV-INV-03: Sorting works in ascending and descending orders across multiple fields", async () => {
      // 1. Sort by quantidade descending
      const reqDesc = makeReq("http://localhost:3000/api/inventario/produtos?sortBy=quantidade&sortOrder=desc&limit=50");
      const resDesc = await getProdutos(reqDesc);
      const dataDesc = await resDesc.json();

      expect(resDesc.status).toBe(200);
      for (let i = 0; i < dataDesc.produtos.length - 1; i++) {
        expect(dataDesc.produtos[i].quantidade).toBeGreaterThanOrEqual(dataDesc.produtos[i + 1].quantidade);
      }

      // 2. Sort by unitarioCentavos ascending
      const reqAsc = makeReq("http://localhost:3000/api/inventario/produtos?sortBy=unitarioCentavos&sortOrder=asc&limit=50");
      const resAsc = await getProdutos(reqAsc);
      const dataAsc = await resAsc.json();

      for (let i = 0; i < dataAsc.produtos.length - 1; i++) {
        expect(dataAsc.produtos[i].unitarioCentavos).toBeLessThanOrEqual(dataAsc.produtos[i + 1].unitarioCentavos);
      }

      // 3. Unknown sortBy field falls back to 'codigo' without error
      const reqFallback = makeReq("http://localhost:3000/api/inventario/produtos?sortBy=hacker_field&limit=5");
      const resFallback = await getProdutos(reqFallback);
      expect(resFallback.status).toBe(200);
    });

    it("ADV-INV-04: Pagination controls and boundary clamping (limit clamped [1, 100], page clamped >= 1)", async () => {
      // 1. Pagination slice
      const reqP1 = makeReq("http://localhost:3000/api/inventario/produtos?page=1&limit=2");
      const resP1 = await getProdutos(reqP1);
      const dataP1 = await resP1.json();

      expect(dataP1.pagination.page).toBe(1);
      expect(dataP1.pagination.limit).toBe(2);
      expect(dataP1.produtos.length).toBe(2);
      expect(dataP1.pagination.hasNextPage).toBe(true);
      expect(dataP1.pagination.hasPrevPage).toBe(false);

      // 2. Page 2
      const reqP2 = makeReq("http://localhost:3000/api/inventario/produtos?page=2&limit=2");
      const resP2 = await getProdutos(reqP2);
      const dataP2 = await resP2.json();
      expect(dataP2.pagination.page).toBe(2);
      expect(dataP2.pagination.hasPrevPage).toBe(true);

      // Verify no overlap between page 1 and page 2
      const idsP1 = dataP1.produtos.map((p: any) => p.id);
      const idsP2 = dataP2.produtos.map((p: any) => p.id);
      const overlap = idsP1.some((id: string) => idsP2.includes(id));
      expect(overlap).toBe(false);

      // 3. Clamping: limit=500 clamped to 100
      const reqHighLimit = makeReq("http://localhost:3000/api/inventario/produtos?limit=500");
      const resHighLimit = await getProdutos(reqHighLimit);
      const dataHighLimit = await resHighLimit.json();
      expect(dataHighLimit.pagination.limit).toBe(100);

      // 4. Clamping: negative page clamped to 1
      const reqNegPage = makeReq("http://localhost:3000/api/inventario/produtos?page=-5");
      const resNegPage = await getProdutos(reqNegPage);
      const dataNegPage = await resNegPage.json();
      expect(dataNegPage.pagination.page).toBe(1);
    });

    it("ADV-INV-05: Aggregate portfolio valuation and statistics invariants", async () => {
      const req = makeReq("http://localhost:3000/api/inventario/produtos?limit=1");
      const res = await getProdutos(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.stats).toBeDefined();

      const { totalProdutos, totalItensEmEstoque, totalItensEsgotados, valorTotalEstoqueCentavos } = data.stats;

      // Invariants
      expect(totalProdutos).toBe(totalItensEmEstoque + totalItensEsgotados);
      expect(totalProdutos).toBeGreaterThanOrEqual(5); // At least our 5 seeded items
      expect(valorTotalEstoqueCentavos).toBeGreaterThan(0);

      // Verify against direct DB aggregate
      const directAgg = await prisma.produtoEstoque.aggregate({
        _sum: { totalCentavos: true },
      });
      expect(valorTotalEstoqueCentavos).toBe(directAgg._sum.totalCentavos);
    });
  });

  // =========================================================================
  // Challenge 4: Financial API Routes Integration
  // =========================================================================
  describe("Challenge 4: Financial API Routes Integration", () => {
    it("ADV-API-FIN-01: GET /api/financeiro/consolidado returns 400 on invalid mesAno", async () => {
      const req = makeReq("http://localhost:3000/api/financeiro/consolidado?mesAno=2026-999");
      const res = await getConsolidado(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Mês de referência inválido");
    });

    it("ADV-API-FIN-02: GET /api/financeiro/diario returns 400 on invalid single date or date range", async () => {
      const reqDate = makeReq("http://localhost:3000/api/financeiro/diario?data=invalid-date");
      const resDate = await getDiario(reqDate);
      expect(resDate.status).toBe(400);

      const reqRange = makeReq("http://localhost:3000/api/financeiro/diario?dataInicio=invalid&dataFim=2026-01-01");
      const resRange = await getDiario(reqRange);
      expect(resRange.status).toBe(400);
    });

    it("ADV-API-FIN-03: GET /api/financeiro/diario accepts mesAno query parameter and aggregates month days", async () => {
      const testMonth = "2094-05";
      const l1 = await prisma.lancamentoDiario.create({
        data: {
          data: `${testMonth}-01`,
          valorCartaoCentavos: 12000,
          valorDinheiroCentavos: 8000,
          totalDiarioCentavos: 20000,
          observacoes: `${PREFIX}mesAno-venda-1`,
        },
      });
      const l2 = await prisma.lancamentoDiario.create({
        data: {
          data: `${testMonth}-15`,
          valorCartaoCentavos: 5000,
          valorDinheiroCentavos: 5000,
          totalDiarioCentavos: 10000,
          observacoes: `${PREFIX}mesAno-venda-2`,
        },
      });
      createdLancamentoIds.push(l1.id, l2.id);

      const req = makeReq(`http://localhost:3000/api/financeiro/diario?mesAno=${testMonth}`);
      const res = await getDiario(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.totaisPeriodo.totalGeralCentavos).toBe(30000);
      expect(data.totaisPeriodo.totalCartaoCentavos).toBe(17000);
      expect(data.totaisPeriodo.totalDinheiroCentavos).toBe(13000);
      expect(data.totaisPeriodo.diasComVendas).toBe(2);
      expect(data.dias.length).toBe(2);
    });
  });
});
