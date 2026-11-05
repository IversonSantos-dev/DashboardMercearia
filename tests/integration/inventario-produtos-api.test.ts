import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "../../src/lib/prisma";
import { GET as getProdutos } from "../../src/app/api/inventario/produtos/route";

describe("API Route /api/inventario/produtos Integration Tests", () => {
  const PREFIX = "TEST-API-PROD-";
  const createdProductIds: string[] = [];

  const cleanup = async () => {
    try {
      if (createdProductIds.length > 0) {
        await prisma.produtoEstoque.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      await prisma.produtoEstoque.deleteMany({
        where: { codigo: { startsWith: PREFIX } },
      });
    } catch (err) {
      console.warn("Cleanup warning in inventario-produtos-api.test.ts:", err);
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
    barras?: string;
    discriminacao: string;
    quantidade: number;
    unitarioCentavos: number;
    ativo?: boolean;
  }) {
    const p = await prisma.produtoEstoque.create({
      data: {
        codigo: `${PREFIX}${data.codigo}`,
        barras: data.barras ?? null,
        discriminacao: data.discriminacao,
        quantidade: data.quantidade,
        unitarioCentavos: data.unitarioCentavos,
        totalCentavos: data.quantidade * data.unitarioCentavos,
        ativo: data.ativo ?? true,
      },
    });
    createdProductIds.push(p.id);
    return p;
  }

  function makeRequest(url: string): NextRequest {
    return new NextRequest(url, { method: "GET" });
  }

  it("lists products with pagination metadata and global stats", async () => {
    const p1 = await createProduct({
      codigo: "P1",
      discriminacao: "Arroz Tio João 5kg",
      quantidade: 10,
      unitarioCentavos: 3500,
    });
    const p2 = await createProduct({
      codigo: "P2",
      discriminacao: "Feijão Carioca 1kg",
      quantidade: 0,
      unitarioCentavos: 900,
      ativo: false,
    });

    const req = makeRequest("http://localhost:3000/api/inventario/produtos?limit=10");
    const res = await getProdutos(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.produtos).toBeInstanceOf(Array);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.limit).toBe(10);
    expect(data.stats).toBeDefined();
    expect(data.stats.totalProdutos).toBeGreaterThanOrEqual(2);
  });

  it("filters products by search query q across code, barcode, or description", async () => {
    const targetCode = "SEARCHME";
    const targetDesc = "Sabonete Líquido Especial Teste";
    const targetEan = "7899999999991";

    await createProduct({
      codigo: targetCode,
      barras: targetEan,
      discriminacao: targetDesc,
      quantidade: 5,
      unitarioCentavos: 1200,
    });

    // 1. Search by description substring
    const req1 = makeRequest(`http://localhost:3000/api/inventario/produtos?q=Líquido Especial`);
    const res1 = await getProdutos(req1);
    const data1 = await res1.json();
    expect(data1.produtos.some((p: any) => p.codigo.includes(targetCode))).toBe(true);

    // 2. Search by barcode
    const req2 = makeRequest(`http://localhost:3000/api/inventario/produtos?q=${targetEan}`);
    const res2 = await getProdutos(req2);
    const data2 = await res2.json();
    expect(data2.produtos.some((p: any) => p.barras === targetEan)).toBe(true);
  });

  it("filters products by status: 'em_estoque' vs 'esgotado'", async () => {
    const inStock = await createProduct({
      codigo: "INSTOCK",
      discriminacao: "Item Em Estoque",
      quantidade: 20,
      unitarioCentavos: 1500,
      ativo: true,
    });
    const outOfStock = await createProduct({
      codigo: "OUTOFSTOCK",
      discriminacao: "Item Esgotado",
      quantidade: 0,
      unitarioCentavos: 1500,
      ativo: false,
    });

    // Filter: em_estoque
    const reqIn = makeRequest(`http://localhost:3000/api/inventario/produtos?q=${PREFIX}&status=em_estoque&limit=100`);
    const resIn = await getProdutos(reqIn);
    const dataIn = await resIn.json();
    expect(dataIn.produtos.some((p: any) => p.id === inStock.id)).toBe(true);
    expect(dataIn.produtos.some((p: any) => p.id === outOfStock.id)).toBe(false);

    // Filter: esgotado
    const reqOut = makeRequest(`http://localhost:3000/api/inventario/produtos?q=${PREFIX}&status=esgotado&limit=100`);
    const resOut = await getProdutos(reqOut);
    const dataOut = await resOut.json();
    expect(dataOut.produtos.some((p: any) => p.id === outOfStock.id)).toBe(true);
    expect(dataOut.produtos.some((p: any) => p.id === inStock.id)).toBe(false);
  });

  it("sorts products by specified field and order", async () => {
    const req = makeRequest("http://localhost:3000/api/inventario/produtos?sortBy=quantidade&sortOrder=desc&limit=5");
    const res = await getProdutos(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.produtos.length).toBeGreaterThan(0);
    for (let i = 0; i < data.produtos.length - 1; i++) {
      expect(data.produtos[i].quantidade).toBeGreaterThanOrEqual(data.produtos[i + 1].quantidade);
    }
  });
});
