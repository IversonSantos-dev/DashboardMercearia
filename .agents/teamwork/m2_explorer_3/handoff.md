# Handoff Report: Model P7 Inventory Import API & Integration Test Architecture

**Author:** M2 Import API & Ingestion Explorer (`m2_explorer_3`)  
**Parent Agent:** `909b2f8c-83c6-47de-829a-608c7e57ee1e`  
**Milestone:** M2 — Model P7 Inventory Parser, Importer & Synthetic Fixtures  
**Target Files:**
- `src/app/api/inventario/import/route.ts` (API Route Handler)
- `tests/integration/inventory-import.test.ts` (Integration Test Suite)

---

## 1. Observation

### 1.1 Requirements and Constraints Traced
- **`ORIGINAL_REQUEST.md` (lines 17-20, 27, 39-42)**:
  - *"R2. Parser e Importação de Inventário Modelo P7: Parser/importador de arquivos (`.xls`, `.xlsx`, `.csv`) reconhecendo a estrutura do Livro de Inventário Modelo P7 com as colunas: Código, Barras, NCM, Discriminação, Unid, Qtd, Unitário e Total."*
  - *"O leitor deve localizar a linha que contém o cabeçalho Código | Barras | Discriminação | Qtd | Unitário, ignorando linhas administrativas prévias..."*
  - *"Validações impedem importação de linhas corrompidas ou tipos de dados inválidos, reportando feedback claro ao usuário."*
  - *"R4. Atomicidade, Débito e Histórico de Auditoria: Se a quantidade resultante for 0, marca o produto como sem estoque para impedir novas baixas."*
- **`PROJECT.md` (lines 75-111, 215, 249)**:
  - Feature F12: *"Inventory Import API & Bulk Ingestion: API endpoint and service for transactional batch upsert of parsed items into DB"*
  - Parser contract: `parseModelP7File(buffer: Buffer, fileName: string): Promise<P7ParseResult>` returning `items: P7ProductItem[]`, `quarantine: P7RowIssue[]`, `administrativeHeader`, `totalItensValidos`, `valorTotalGeralCentavos`.
  - Target path: `src/app/api/inventario/import/route.ts`.
  - Integration test path: `tests/integration/inventory-import.test.ts`.
- **`prisma/schema.prisma` (lines 18-40)**:
  - `model ProdutoEstoque`:
    ```prisma
    model ProdutoEstoque {
      id                String            @id @default(cuid())
      codigo            String            @unique
      barras            String?
      ncm               String?
      discriminacao     String
      unidade           String            @default("UN")
      quantidade        Int               @default(0)
      unitarioCentavos  Int               @map("unitario_centavos")
      totalCentavos     Int               @map("total_centavos")
      ativo             Boolean           @default(true)
      criadoEm          DateTime          @default(now()) @map("criado_em")
      atualizadoEm      DateTime          @updatedAt @map("atualizado_em")
      baixas            HistoricoBaixa[]
      @@index([ativo, quantidade])
      @@index([barras])
      @@index([unitarioCentavos])
      @@map("produtos_estoque")
    }
    ```
- **Dispatch Instructions**:
  - *"Validates file presence and extension (.xlsx, .csv)."*
  - *"Calls parseModelP7File(buffer, fileName)."*
  - *"Returns preview and validation report if query param ?dryRun=true."*
  - *"Executes transactional upsert into produtos_estoque via Prisma (prisma.$transaction) on confirmation: Upsert by codigo: update existing stock quantity (quantidade = quantidade_importada), unit price, total, or insert new record."*
  - *"Sets ativo = true when quantity > 0."*
  - *"Design integration tests (tests/integration/inventory-import.test.ts) validating the API route and database persistence."*

---

## 2. Logic Chain

### 2.1 Request Lifecycle & Validation Gateways
1. **HTTP Method & Content-Type**: The endpoint must listen on `POST /api/inventario/import`. The incoming request must have `Content-Type: multipart/form-data`. Non-multipart requests are rejected immediately with `400 Bad Request`.
2. **File Extraction & Size Limits**:
   - `const formData = await req.formData()`
   - `const file = formData.get("file") as File | null`
   - If `!file` or `file.size === 0`, return `400 Bad Request`.
   - To guard against memory exhaustion from oversized files, apply a 15MB ceiling (`15 * 1024 * 1024` bytes). Exceeding this returns `413 Payload Too Large`.
3. **File Format Whitelist**:
   - Supported extensions: `.xlsx`, `.csv`, `.xls` (case-insensitive check on `file.name`).
   - If unsupported, return `400 Bad Request` with an explanatory error message.
4. **Buffer Ingestion & Parser Delegation**:
   - Buffer is extracted via `Buffer.from(await file.arrayBuffer())`.
   - `parseModelP7File(buffer, file.name)` is executed.
   - Any fatal parser errors (e.g., corrupt zip archive, no header matching score >= 4) return `422 Unprocessable Entity`.
   - If `parseResult.items.length === 0`, return `422 Unprocessable Entity` with the quarantine report.

### 2.2 In-File Deduplication & Consolidation
In physical inventory exports, the same SKU code may occasionally appear multiple times (e.g., items stored across different physical shelves or separate batches).
- If multiple rows share the same `codigo`:
  - Quantities are summed (`acc.quantidade += item.quantidade`).
  - The latest non-null metadata (`barras`, `ncm`, `discriminacao`, `unidade`, `unitarioCentavos`) is preserved.
  - `totalCentavos = multiplyMoney(unitarioCentavos, quantidade)` is recalculated.
  - A `WARNING` item is appended to `quarantine` alerting the operator.
  - This prevents key collision deadlocks or undefined overwrite order inside SQLite transactions.

### 2.3 Preview Mode (`?dryRun=true`)
When `dryRun=true` or `dryRun=1`:
- **Database Modification**: Zero writes. The database is strictly read-only.
- **Diff Estimation**: The endpoint queries `prisma.produtoEstoque.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true } })`.
- By comparing existing codes in DB vs parsed codes, it accurately computes:
  - `novosProdutosEstimados` (items not yet in DB)
  - `produtosAtualizadosEstimados` (items already in DB that will have stock updated)
- **Response**: Returns HTTP 200 with metadata, administrative preamble, quarantine report, summary counts, and the first 50 items preview.

### 2.4 Transactional Upsert Execution (`dryRun=false`)
When confirmed (`dryRun=false` or omitted):
1. **Inventory Replacement Semantics**:
   - Physical inventory represents an actual stock count at a specific date. Therefore:
     `quantidade = quantidade_importada` (overwrites previous system balance, does NOT add to it).
2. **Stock Active Flag**:
   - `ativo = quantidade > 0` (if quantity is 0, item is deactivated to prevent sales deductions per R4; if previously 0 and new stock arrived, item is reactivated to `ativo = true`).
3. **Monetary Precision**:
   - `totalCentavos = multiplyMoney(unitarioCentavos, quantidade)` ensures zero floating-point imprecision.
4. **Batch Chunking in `prisma.$transaction`**:
   - SQLite uses file-level write locking. Executing 1,000 unchunked parallel promises inside `$transaction` can saturate Prisma's connection queue and trigger lock contention.
   - Processing items in chunks of 50 via `Promise.all` inside `prisma.$transaction(async (tx) => { ... }, { timeout: 30000, maxWait: 10000 })` provides deterministic throughput and guarantees all-or-nothing rollback on any unexpected failure.

### 2.5 Integration Test Strategy
The integration test suite (`tests/integration/inventory-import.test.ts`) interacts directly with `POST(req: NextRequest)` and the SQLite database:
- Uses in-memory XLSX workbooks (via `xlsx`) and CSV buffers for reproducible test fixtures.
- Uses `TEST-IMP-` prefix for all test data with automated cleanup in `beforeEach` and `afterAll`.
- Covers 8 verification groups: payload validation, extension checking, dryRun isolation, new product creation, stock balance replacement, inactive/active toggling, partial quarantine of dirty rows, and CSV format parity.

---

## 3. Caveats

1. **Integer vs Fractional Quantities in Schema**:
   - `prisma/schema.prisma` defines `quantidade Int @default(0)`.
   - In retail grocery inventories, certain bulk items (e.g. `Banana Prata KG`) might appear as decimals (e.g. `45.500 KG`).
   - Because `ProdutoEstoque.quantidade` is an `Int`, passing a floating-point number directly to Prisma causes runtime validation errors (`Expected Int, provided Float`).
   - **Resolution applied**: The import route applies `Math.max(0, Math.round(item.quantidade))` to guarantee integer compatibility. For future fractional unit support, `quantidade` in `schema.prisma` should be migrated to `Decimal` or `Float` or stored as grams (`gramas: Int`).
2. **SQLite Transaction Timeout & Busy Wait**:
   - When importing thousands of items on low-resource environments, transactions may take longer than the default 5-second Prisma interactive transaction timeout.
   - **Resolution applied**: Explicit configuration of `{ timeout: 30000, maxWait: 10000 }` on `prisma.$transaction`.
3. **Next.js 15 Native `formData()` in Vitest**:
   - In Node.js 20+ with Vitest, `NextRequest` and `FormData` work natively with `Blob` objects. The test helper constructs native `FormData` instances without requiring mock libraries.

---

## 4. Conclusion & Proposed Implementation Blueprint

### 4.1 Production Code: `src/app/api/inventario/import/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseModelP7File, P7ParseResult, P7ProductItem, P7RowIssue } from "@/modules/parser-p7";
import { multiplyMoney } from "@/modules/currency";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const SUPPORTED_EXTENSIONS = [".xlsx", ".csv", ".xls"];
const CHUNK_SIZE = 50;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Validate Content-Type
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "Requisição inválida. O corpo da requisição deve ser multipart/form-data.",
        },
        { status: 400 }
      );
    }

    // 2. Parse FormData
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (formErr: any) {
      return NextResponse.json(
        {
          success: false,
          error: "Falha ao processar os dados do formulário multipart.",
          details: formErr?.message,
        },
        { status: 400 }
      );
    }

    const file = formData.get("file");

    // 3. Validate file presence
    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum arquivo enviado ou arquivo vazio.",
        },
        { status: 400 }
      );
    }

    // 4. Validate file size limit
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `O arquivo excede o limite máximo permitido de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
        },
        { status: 413 }
      );
    }

    // 5. Validate file extension
    const fileName = file.name.trim();
    const hasValidExtension = SUPPORTED_EXTENSIONS.some((ext) =>
      fileName.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return NextResponse.json(
        {
          success: false,
          error: `Formato de arquivo inválido (${fileName}). Envie um arquivo com extensão .xlsx ou .csv.`,
        },
        { status: 400 }
      );
    }

    // 6. Ingest buffer and call parseModelP7File
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parseResult: P7ParseResult;
    try {
      parseResult = await parseModelP7File(buffer, fileName);
    } catch (parseErr: any) {
      return NextResponse.json(
        {
          success: false,
          error: parseErr?.message || "Erro ao processar a planilha Modelo P7.",
        },
        { status: 422 }
      );
    }

    // If no valid items were found
    if (!parseResult.items || parseResult.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum item válido foi encontrado no arquivo de inventário.",
          administrativeHeader: parseResult.administrativeHeader,
          quarantine: parseResult.quarantine,
        },
        { status: 422 }
      );
    }

    // 7. Consolidate items sharing the same internal code within the file
    const consolidatedMap = new Map<string, P7ProductItem>();
    const extraQuarantine: P7RowIssue[] = [];

    for (const item of parseResult.items) {
      const codeKey = item.codigo.trim();
      if (!consolidatedMap.has(codeKey)) {
        consolidatedMap.set(codeKey, { ...item, codigo: codeKey });
      } else {
        const existing = consolidatedMap.get(codeKey)!;
        existing.quantidade += item.quantidade;
        if (item.barras) existing.barras = item.barras;
        if (item.ncm) existing.ncm = item.ncm;
        if (item.discriminacao) existing.discriminacao = item.discriminacao;
        if (item.unidade) existing.unidade = item.unidade;
        existing.unitarioCentavos = item.unitarioCentavos;
        existing.totalCentavos = multiplyMoney(existing.unitarioCentavos, existing.quantidade);

        extraQuarantine.push({
          rowNumber: 0,
          codigo: codeKey,
          discriminacao: item.discriminacao,
          reason: `Código duplicado no arquivo: quantidades somadas para total de ${existing.quantidade}`,
          severity: "WARNING",
        });
      }
    }

    const consolidatedItems = Array.from(consolidatedMap.values());
    const fullQuarantine = [...parseResult.quarantine, ...extraQuarantine];

    // 8. Handle ?dryRun=true mode
    const { searchParams } = new URL(req.url);
    const isDryRun =
      searchParams.get("dryRun") === "true" || searchParams.get("dryRun") === "1";

    const allCodes = consolidatedItems.map((it) => it.codigo);

    if (isDryRun) {
      const existingInDb = await prisma.produtoEstoque.findMany({
        where: { codigo: { in: allCodes } },
        select: { codigo: true },
      });
      const existingCodeSet = new Set(existingInDb.map((p) => p.codigo));
      const estimatedNew = consolidatedItems.filter(
        (it) => !existingCodeSet.has(it.codigo)
      ).length;
      const estimatedUpdate = consolidatedItems.length - estimatedNew;

      return NextResponse.json(
        {
          success: true,
          dryRun: true,
          fileName,
          administrativeHeader: parseResult.administrativeHeader,
          summary: {
            totalItensLidos: parseResult.items.length + parseResult.quarantine.length,
            totalItensValidos: consolidatedItems.length,
            totalItensQuarentena: fullQuarantine.length,
            novosProdutosEstimados: estimatedNew,
            produtosAtualizadosEstimados: estimatedUpdate,
            valorTotalGeralCentavos: consolidatedItems.reduce(
              (acc, it) => acc + it.totalCentavos,
              0
            ),
          },
          quarantine: fullQuarantine,
          itemsPreview: consolidatedItems.slice(0, 50),
        },
        { status: 200 }
      );
    }

    // 9. Commit Mode: Transactional Upsert into produtos_estoque
    let countCreated = 0;
    let countUpdated = 0;

    await prisma.$transaction(
      async (tx) => {
        const existingInDb = await tx.produtoEstoque.findMany({
          where: { codigo: { in: allCodes } },
          select: { codigo: true },
        });
        const existingCodeSet = new Set(existingInDb.map((p) => p.codigo));

        for (let i = 0; i < consolidatedItems.length; i += CHUNK_SIZE) {
          const chunk = consolidatedItems.slice(i, i + CHUNK_SIZE);

          await Promise.all(
            chunk.map(async (item) => {
              const qtyInt = Math.max(0, Math.round(item.quantidade));
              const isAtivo = qtyInt > 0;
              const totalCentavos = multiplyMoney(item.unitarioCentavos, qtyInt);

              await tx.produtoEstoque.upsert({
                where: { codigo: item.codigo },
                create: {
                  codigo: item.codigo,
                  barras: item.barras || null,
                  ncm: item.ncm || null,
                  discriminacao: item.discriminacao,
                  unidade: item.unidade || "UN",
                  quantidade: qtyInt,
                  unitarioCentavos: item.unitarioCentavos,
                  totalCentavos,
                  ativo: isAtivo,
                },
                update: {
                  barras: item.barras || null,
                  ncm: item.ncm || null,
                  discriminacao: item.discriminacao,
                  unidade: item.unidade || "UN",
                  quantidade: qtyInt, // Substitui o saldo anterior pelo inventariado
                  unitarioCentavos: item.unitarioCentavos,
                  totalCentavos,
                  ativo: isAtivo,
                },
              });

              if (existingCodeSet.has(item.codigo)) {
                countUpdated++;
              } else {
                countCreated++;
              }
            })
          );
        }
      },
      {
        timeout: 30000,
        maxWait: 10000,
      }
    );

    // 10. Success Response
    const totalEstoqueCentavos = consolidatedItems.reduce(
      (acc, it) => acc + multiplyMoney(it.unitarioCentavos, Math.max(0, Math.round(it.quantidade))),
      0
    );

    return NextResponse.json(
      {
        success: true,
        dryRun: false,
        fileName,
        administrativeHeader: parseResult.administrativeHeader,
        summary: {
          totalItensLidos: parseResult.items.length + parseResult.quarantine.length,
          totalItensImportados: consolidatedItems.length,
          totalItensQuarentena: fullQuarantine.length,
          novosCadastrados: countCreated,
          atualizados: countUpdated,
          valorTotalEstoqueCentavos: totalEstoqueCentavos,
        },
        quarantine: fullQuarantine,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API /api/inventario/import] Erro interno:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno no servidor ao processar importação de inventário.",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
```

---

### 4.2 Test Suite Code: `tests/integration/inventory-import.test.ts`

```typescript
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
  const blob = new Blob([fileBuffer], {
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
```

---

## 5. Verification Method

### 5.1 Independent Test Verification
Once the implementation is delivered by the implementer agent:

1. **Run Integration Suite**:
   ```powershell
   npx vitest run tests/integration/inventory-import.test.ts
   ```
   **Expected Outcome**: All tests pass cleanly with 0 failures, verifying validation gates, dry-run database isolation, persistence fidelity, stock replacement, and dirty row isolation.

2. **Verify SQLite Database Invariants**:
   ```powershell
   npx tsx -e "
     import prisma from './src/lib/prisma';
     async function check() {
       const prods = await prisma.produtoEstoque.findMany({ take: 5 });
       console.log('Sample products:', prods);
       await prisma.\$disconnect();
     }
     check();
   "
   ```

3. **HTTP Dry-Run and Import Smoke Test via PowerShell**:
   ```powershell
   # In a running development server (npm run dev):
   $Form = @{
     file = Get-Item -Path "tests/fixtures/p7_padrao_completo.xlsx"
   }
   # Dry-Run:
   Invoke-RestMethod -Uri "http://localhost:3000/api/inventario/import?dryRun=true" -Method Post -Form $Form
   # Real Import:
   Invoke-RestMethod -Uri "http://localhost:3000/api/inventario/import" -Method Post -Form $Form
   ```
