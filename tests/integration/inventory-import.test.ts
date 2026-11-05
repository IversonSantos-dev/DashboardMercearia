import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import prisma from "../../src/lib/prisma";
import { POST } from "../../src/app/api/inventario/import/route";

const TEST_PREFIX = "TEST-IMP-";

/**
 * Utilitário para gerar um buffer XLSX sintético com preâmbulo e cabeçalho P7.
 */
function createSyntheticP7Xlsx(items: Array<{
  codigo: string;
  barras?: string;
  ncm?: string;
  discriminacao: string;
  unidade: string;
  qtd: number | string;
  unitario: number | string;
  total?: number | string;
}>): Buffer {
  const rows: any[][] = [
    ["Mercearia Teste Ltda", "", "", "CNPJ: 11.222.333/0001-44"],
    ["Livro Registro de Inventário Modelo P7", "", "", "Data: 31/12/2025"],
    ["", "", "", ""],
    ["Código", "Barras", "NCM", "Discriminação", "Unid", "Qtd", "Unitário", "Total"],
  ];

  for (const item of items) {
    rows.push([
      item.codigo,
      item.barras ?? "",
      item.ncm ?? "",
      item.discriminacao,
      item.unidade,
      item.qtd,
      item.unitario,
      item.total ?? "",
    ]);
  }

  // Rodapé de fechamento Modelo P7
  rows.push(["", "", "", "TOTAL GERAL DO INVENTÁRIO", "", "", "", "9999,99"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "InventarioP7");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/**
 * Utilitário para gerar um buffer CSV brasileiro delimitado por ponto e vírgula.
 */
function createSyntheticP7Csv(items: Array<{
  codigo: string;
  barras?: string;
  ncm?: string;
  discriminacao: string;
  unidade: string;
  qtd: number | string;
  unitario: number | string;
}>): Buffer {
  let content = "Razão Social: Mercearia Teste Ltda;CNPJ: 11.222.333/0001-44\n";
  content += "Código;Barras;NCM;Discriminação;Unid;Qtd;Unitário;Total\n";
  for (const it of items) {
    content += `${it.codigo};${it.barras ?? ""};${it.ncm ?? ""};"${it.discriminacao}";${it.unidade};${it.qtd};${it.unitario};0,00\n`;
  }
  content += ";;;TOTAL GERAL;;;;\n";
  return Buffer.from(content, "utf-8");
}

/**
 * Cria a requisição NextRequest com multipart/form-data.
 */
function createMultipartRequest(
  fileBuffer: Buffer | null,
  fileName = "inventario.xlsx",
  dryRun = false,
  omitContentType = false
): NextRequest {
  const url = new URL("http://localhost:3000/api/inventario/import");
  if (dryRun) {
    url.searchParams.set("dryRun", "true");
  }

  if (omitContentType || !fileBuffer) {
    return new NextRequest(url.toString(), {
      method: "POST",
      body: omitContentType ? "corpo-invalido" : new FormData(),
      headers: omitContentType ? { "content-type": "text/plain" } : undefined,
    });
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

describe("API /api/inventario/import Integration Tests", () => {
  const cleanTestRecords = async () => {
    try {
      await prisma.historicoBaixa.deleteMany({
        where: { codigoProduto: { startsWith: TEST_PREFIX } },
      });
      await prisma.produtoEstoque.deleteMany({
        where: { codigo: { startsWith: TEST_PREFIX } },
      });
    } catch (err) {
      console.warn("Cleanup warning:", err);
    }
  };

  beforeAll(async () => {
    await cleanTestRecords();
  });

  afterAll(async () => {
    await cleanTestRecords();
  });

  beforeEach(async () => {
    await cleanTestRecords();
  });

  describe("1. Request Validation and Security Gates", () => {
    it("should reject non-multipart/form-data requests with HTTP 400", async () => {
      const req = createMultipartRequest(null, "teste.xlsx", false, true);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("multipart/form-data");
    });

    it("should reject requests without a file field with HTTP 400", async () => {
      const req = createMultipartRequest(null, "teste.xlsx", false, false);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Nenhum arquivo enviado");
    });

    it("should reject unsupported file extensions (.pdf, .txt) with HTTP 400", async () => {
      const dummyBuffer = Buffer.from("conteudo pdf ficticio");
      const req = createMultipartRequest(dummyBuffer, "relatorio.pdf");
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Formato de arquivo inválido");
    });

    it("should reject corrupted file buffers with HTTP 422", async () => {
      const corruptedBuffer = Buffer.from("CORRUPTED_BYTES_NOT_ZIP_OR_CSV");
      const req = createMultipartRequest(corruptedBuffer, "inventario.xlsx");
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
    });
  });

  describe("2. Preview & Validation Quarantine Mode (?dryRun=true)", () => {
    it("should preview items and return quarantine report without modifying the database", async () => {
      // 1. Pre-seed um produto no banco para verificar diff
      await prisma.produtoEstoque.create({
        data: {
          codigo: `${TEST_PREFIX}001`,
          discriminacao: "Produto Existente Pré-cadastrado",
          unidade: "UN",
          quantidade: 10,
          unitarioCentavos: 500,
          totalCentavos: 5000,
          ativo: true,
        },
      });

      // 2. Cria planilha com 1 item existente e 1 item novo
      const buffer = createSyntheticP7Xlsx([
        {
          codigo: `${TEST_PREFIX}001`,
          discriminacao: "Produto Existente Atualizado",
          unidade: "UN",
          qtd: 50,
          unitario: "6,00",
        },
        {
          codigo: `${TEST_PREFIX}002`,
          discriminacao: "Produto Totalmente Novo",
          unidade: "CX",
          qtd: 20,
          unitario: "15,00",
        },
      ]);

      const req = createMultipartRequest(buffer, "inventario.xlsx", true);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.dryRun).toBe(true);
      expect(json.summary.totalItensValidos).toBe(2);
      expect(json.summary.novosProdutosEstimados).toBe(1);
      expect(json.summary.produtosAtualizadosEstimados).toBe(1);
      expect(json.itemsPreview.length).toBe(2);

      // Verificação de isolamento do Banco:
      // O item existente NÃO pode ter sido alterado
      const dbProd1 = await prisma.produtoEstoque.findUnique({
        where: { codigo: `${TEST_PREFIX}001` },
      });
      expect(dbProd1?.quantidade).toBe(10);
      expect(dbProd1?.unitarioCentavos).toBe(500);

      // O item novo NÃO pode ter sido criado
      const dbProd2 = await prisma.produtoEstoque.findUnique({
        where: { codigo: `${TEST_PREFIX}002` },
      });
      expect(dbProd2).toBeNull();
    });
  });

  describe("3. Commit Mode & Database Persistence", () => {
    it("should persist all valid items into produtos_estoque with exact integer cents and active=true", async () => {
      const buffer = createSyntheticP7Xlsx([
        {
          codigo: `${TEST_PREFIX}P01`,
          barras: "7891000100011",
          ncm: "1006.30.21",
          discriminacao: "Arroz Agulhinha Tipo 1 5kg",
          unidade: "PCT",
          qtd: 120,
          unitario: "28,90",
          total: "3468,00",
        },
        {
          codigo: `${TEST_PREFIX}P02`,
          barras: "7891000200022",
          ncm: "0713.33.19",
          discriminacao: "Feijão Carioca 1kg",
          unidade: "PCT",
          qtd: 80,
          unitario: "7,50",
          total: "600,00",
        },
      ]);

      const req = createMultipartRequest(buffer, "inventario.xlsx", false);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.dryRun).toBe(false);
      expect(json.summary.novosCadastrados).toBe(2);
      expect(json.summary.atualizados).toBe(0);
      expect(json.summary.totalItensImportados).toBe(2);

      // Verificação direta no banco de dados
      const p1 = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${TEST_PREFIX}P01` },
      });
      expect(p1.barras).toBe("7891000100011");
      expect(p1.ncm).toBe("1006.30.21");
      expect(p1.discriminacao).toBe("Arroz Agulhinha Tipo 1 5kg");
      expect(p1.unidade).toBe("PCT");
      expect(p1.quantidade).toBe(120);
      expect(p1.unitarioCentavos).toBe(2890); // R$ 28,90 = 2890 centavos
      expect(p1.totalCentavos).toBe(346800); // R$ 3.468,00 = 346800 centavos
      expect(p1.ativo).toBe(true);

      const p2 = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${TEST_PREFIX}P02` },
      });
      expect(p2.quantidade).toBe(80);
      expect(p2.unitarioCentavos).toBe(750);
      expect(p2.totalCentavos).toBe(60000);
      expect(p2.ativo).toBe(true);
    });

    it("should set ativo=false when imported item quantity is zero", async () => {
      const buffer = createSyntheticP7Xlsx([
        {
          codigo: `${TEST_PREFIX}ZERO`,
          discriminacao: "Produto Esgotado",
          unidade: "UN",
          qtd: 0,
          unitario: "10,00",
        },
      ]);

      const req = createMultipartRequest(buffer, "inventario.xlsx", false);
      const res = await POST(req);
      expect(res.status).toBe(200);

      const p = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${TEST_PREFIX}ZERO` },
      });
      expect(p.quantidade).toBe(0);
      expect(p.ativo).toBe(false);
    });
  });

  describe("4. Upsert Semantics: Physical Stock Balance Replacement & Reactivation", () => {
    it("should replace existing stock quantity and unit price rather than incrementing", async () => {
      // 1. Cria produto inicial com estoque 100
      await prisma.produtoEstoque.create({
        data: {
          codigo: `${TEST_PREFIX}REPLACE`,
          discriminacao: "Óleo de Soja 900ml",
          unidade: "UN",
          quantidade: 100,
          unitarioCentavos: 500,
          totalCentavos: 50000,
          ativo: true,
        },
      });

      // 2. Novo inventário informa que o estoque físico real é 45
      const buffer = createSyntheticP7Xlsx([
        {
          codigo: `${TEST_PREFIX}REPLACE`,
          discriminacao: "Óleo de Soja 900ml Refinado",
          unidade: "UN",
          qtd: 45,
          unitario: "5,80",
        },
      ]);

      const req = createMultipartRequest(buffer, "inventario.xlsx", false);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.summary.novosCadastrados).toBe(0);
      expect(json.summary.atualizados).toBe(1);

      // Verificação no banco: o estoque deve ser 45 (substituído), NUNCA 145!
      const p = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${TEST_PREFIX}REPLACE` },
      });
      expect(p.quantidade).toBe(45);
      expect(p.unitarioCentavos).toBe(580);
      expect(p.totalCentavos).toBe(26100); // 45 * 580 = 26100
      expect(p.ativo).toBe(true);
      expect(p.discriminacao).toBe("Óleo de Soja 900ml Refinado");

      // Garante que não criou duplicata
      const count = await prisma.produtoEstoque.count({
        where: { codigo: `${TEST_PREFIX}REPLACE` },
      });
      expect(count).toBe(1);
    });

    it("should reactivate an inactive product (ativo=false -> true) when new stock is imported", async () => {
      // Produto inativo com estoque zerado
      await prisma.produtoEstoque.create({
        data: {
          codigo: `${TEST_PREFIX}REACTIVATE`,
          discriminacao: "Açúcar Cristal",
          unidade: "PCT",
          quantidade: 0,
          unitarioCentavos: 400,
          totalCentavos: 0,
          ativo: false,
        },
      });

      const buffer = createSyntheticP7Xlsx([
        {
          codigo: `${TEST_PREFIX}REACTIVATE`,
          discriminacao: "Açúcar Cristal Branco",
          unidade: "PCT",
          qtd: 70,
          unitario: "4,20",
        },
      ]);

      const req = createMultipartRequest(buffer, "inventario.xlsx", false);
      await POST(req);

      const p = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${TEST_PREFIX}REACTIVATE` },
      });
      expect(p.quantidade).toBe(70);
      expect(p.ativo).toBe(true);
    });
  });

  describe("5. Partial Import with Quarantine (Dirty Rows Isolation)", () => {
    it("should persist valid rows while quarantining invalid rows", async () => {
      const buffer = createSyntheticP7Xlsx([
        {
          codigo: `${TEST_PREFIX}VALID1`,
          discriminacao: "Item Válido 1",
          unidade: "UN",
          qtd: 10,
          unitario: "10,00",
        },
        {
          codigo: `${TEST_PREFIX}INVALID_NEG`,
          discriminacao: "Item com Quantidade Negativa",
          unidade: "UN",
          qtd: -5,
          unitario: "10,00",
        },
        {
          codigo: "", // Código ausente
          discriminacao: "Item sem Código Interno",
          unidade: "UN",
          qtd: 15,
          unitario: "10,00",
        },
        {
          codigo: `${TEST_PREFIX}VALID2`,
          discriminacao: "Item Válido 2",
          unidade: "UN",
          qtd: 20,
          unitario: "12,00",
        },
      ]);

      const req = createMultipartRequest(buffer, "inventario.xlsx", false);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.summary.totalItensImportados).toBe(2);
      expect(json.summary.totalItensQuarentena).toBeGreaterThanOrEqual(2);

      // Validação no banco: apenas os 2 válidos foram persistidos
      const valid1 = await prisma.produtoEstoque.findUnique({
        where: { codigo: `${TEST_PREFIX}VALID1` },
      });
      const valid2 = await prisma.produtoEstoque.findUnique({
        where: { codigo: `${TEST_PREFIX}VALID2` },
      });
      const neg = await prisma.produtoEstoque.findUnique({
        where: { codigo: `${TEST_PREFIX}INVALID_NEG` },
      });

      expect(valid1).not.toBeNull();
      expect(valid2).not.toBeNull();
      expect(neg).toBeNull();
    });
  });

  describe("6. CSV Semicolon Delimited Format Parity", () => {
    it("should successfully import Model P7 CSV file with semicolon delimiter", async () => {
      const csvBuffer = createSyntheticP7Csv([
        {
          codigo: `${TEST_PREFIX}CSV1`,
          barras: "7891234567890",
          ncm: "2202.10.00",
          discriminacao: "Refrigerante Guaraná 2L",
          unidade: "UN",
          qtd: 50,
          unitario: "7,99",
        },
      ]);

      const req = createMultipartRequest(csvBuffer, "inventario.csv", false);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.summary.totalItensImportados).toBe(1);

      const p = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${TEST_PREFIX}CSV1` },
      });
      expect(p.quantidade).toBe(50);
      expect(p.unitarioCentavos).toBe(799); // R$ 7,99 = 799 centavos
      expect(p.discriminacao).toBe("Refrigerante Guaraná 2L");
    });
  });

  describe("7. In-File Duplicate Code Consolidation", () => {
    it("should consolidate quantities for duplicate codes in the same file and issue a warning", async () => {
      const buffer = createSyntheticP7Xlsx([
        {
          codigo: `${TEST_PREFIX}DUP`,
          discriminacao: "Produto Lote A",
          unidade: "UN",
          qtd: 30,
          unitario: "10,00",
        },
        {
          codigo: `${TEST_PREFIX}DUP`,
          discriminacao: "Produto Lote B",
          unidade: "UN",
          qtd: 25,
          unitario: "10,00",
        },
      ]);

      const req = createMultipartRequest(buffer, "inventario.xlsx", false);
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.summary.totalItensImportados).toBe(1);

      // Quantidade somada (30 + 25 = 55)
      const p = await prisma.produtoEstoque.findUniqueOrThrow({
        where: { codigo: `${TEST_PREFIX}DUP` },
      });
      expect(p.quantidade).toBe(55);
      expect(p.totalCentavos).toBe(55000);

      // Aviso em quarentena
      const dupWarning = json.quarantine.find(
        (q: any) => q.codigo === `${TEST_PREFIX}DUP`
      );
      expect(dupWarning).toBeDefined();
    });
  });
});
