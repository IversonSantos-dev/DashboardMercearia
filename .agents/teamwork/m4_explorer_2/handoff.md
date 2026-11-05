# Handoff Report — M4 Explorer 2: Inventory Management UI & Products API

## 1. Observation

### 1.1 Existing Import Route Analysis (`src/app/api/inventario/import/route.ts`)
- **File size and extensions**:
  ```typescript
  // src/app/api/inventario/import/route.ts:6-8
  const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
  const SUPPORTED_EXTENSIONS = [".xlsx", ".csv", ".xls"];
  const CHUNK_SIZE = 50;
  ```
- **Dry-run vs. Commit switch**:
  ```typescript
  // src/app/api/inventario/import/route.ts:141-144
  const { searchParams } = new URL(req.url);
  const isDryRun = searchParams.get("dryRun") === "true" || searchParams.get("dryRun") === "1";
  ```
- **Dry-run response contract** (lines 158-179):
  Returns status `200` with payload:
  ```json
  {
    "success": true,
    "dryRun": true,
    "fileName": "inventario.xlsx",
    "administrativeHeader": { "razaoSocial": "...", "cnpj": "...", "dataInventario": "..." },
    "summary": {
      "totalItensLidos": 105,
      "totalItensValidos": 100,
      "totalItensQuarentena": 5,
      "novosProdutosEstimados": 80,
      "produtosAtualizadosEstimados": 20,
      "valorTotalGeralCentavos": 15423000
    },
    "quarantine": [
      {
        "rowNumber": 14,
        "codigo": "PROD-X",
        "discriminacao": "...",
        "reason": "...",
        "severity": "WARNING" | "ERROR",
        "rawContent": "..."
      }
    ],
    "itemsPreview": [
      {
        "codigo": "001",
        "barras": "7891234567890",
        "ncm": "19059090",
        "discriminacao": "...",
        "unidade": "UN",
        "quantidade": 150,
        "unitarioCentavos": 450,
        "totalCentavos": 67500
      }
    ]
  }
  ```
- **Commit response contract** (`dryRun=false`, lines 249-266):
  ```json
  {
    "success": true,
    "dryRun": false,
    "fileName": "inventario.xlsx",
    "administrativeHeader": { ... },
    "summary": {
      "totalItensLidos": 105,
      "totalItensImportados": 100,
      "totalItensQuarentena": 5,
      "novosCadastrados": 80,
      "atualizados": 20,
      "valorTotalEstoqueCentavos": 15423000
    },
    "quarantine": [ ... ]
  }
  ```
- **Error status codes returned**:
  - `400`: Invalid Content-Type, missing/empty file, unsupported file extension.
  - `413`: File exceeds 15MB.
  - `422`: P7 parse failure or zero valid items extracted.
  - `500`: Unhandled server/database error.

### 1.2 Relational Model (`prisma/schema.prisma:18-40`)
```prisma
model ProdutoEstoque {
  id                String            @id @default(cuid())
  codigo            String            @unique // Código interno P7
  barras            String?           // EAN-13 / GTIN
  ncm               String?           // NCM fiscal
  discriminacao     String            // Descrição do produto
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

### 1.3 Codebase Health & Test Baseline
- Vitest execution (`vitest run`): **15 test files passed, 264 tests passed, 0 failures** in 28.07s.
- Existing routes in `src/app/api`:
  - `api/baixa/executar/route.ts`
  - `api/baixa/historico/route.ts`
  - `api/baixa/sugestao/route.ts`
  - `api/inventario/import/route.ts`
- Missing routes/pages:
  - `src/app/api/inventario/produtos/route.ts` does NOT exist yet.
  - `src/app/inventario/page.tsx` does NOT exist yet.
  - `src/components/inventario/` does NOT exist yet.

---

## 2. Logic Chain

### Step 1: UX Flow Separation & Lifecycle
An operator interacting with the Inventory module has two core activities:
1. **Auditing & Searching Active Stock**: Viewing what is currently stored in `produtos_estoque`, checking quantities, prices, and seeing if products are depleted.
2. **Importing a Model P7 Spreadsheet**: Uploading a new or periodic inventory count file, reviewing parsed contents safely via Dry Run, inspecting warnings, and committing.

Therefore, `src/app/inventario/page.tsx` must be composed of three modular layers:
- **Header & Metric Banner**: Displaying high-level stock statistics (Total SKUs, Total em Estoque, Esgotados, Valor Total Avaliado em R$).
- **Uploader & Dry Run Workflow Area**: Card containing `FileUploader` with transition to `DryRunPreview`.
- **Live Stock Catalog Table**: Interactive component `StockTable` backed by `GET /api/inventario/produtos`.

### Step 2: Drag & Drop File Uploader (`FileUploader.tsx`)
- Drag & Drop state management:
  - Tracks `isDragging` boolean to update border styling (`border-dashed border-emerald-500 bg-emerald-50/50`).
  - Native file input hidden with `ref`, triggered either by clicking the drop zone or dropping files.
  - Immediate client validation:
    - Checks file extension against `.xlsx`, `.xls`, `.csv`.
    - Checks file size `<= 15 * 1024 * 1024` (15MB).
    - If validation fails, sets client-side error without network round-trip.
  - When a valid file is loaded, sets `file` state, shows file details (name, size in KB/MB, format badge), and immediately triggers Dry Run Preview (`POST /api/inventario/import?dryRun=true`).

### Step 3: Dry Run Preview Integration (`DryRunPreview.tsx`)
- When file is uploaded with `?dryRun=true`, the server processes the buffer without writing to the database.
- Displays:
  1. **Administrative Header**: Razão Social, CNPJ, Data do Inventário.
  2. **6 Summary Metric Cards**: Total Lidos, Válidos, Quarentena, Novos Estimados, A Atualizar Estimados, Valor Total do Inventário (formatado em BRL via `centavosToBRL`).
  3. **Quarantine Warnings Accordion**: Collapsible list of issues with row numbers, codes, severity tags (`WARNING` / `ERROR`), and explanations.
  4. **Item Table Preview**: First 50 items displayed with Código, Barras, Discriminação, Unidade, Quantidade, Unitário (BRL), and Total (BRL).
  5. **Actions**:
     - "Confirmar e Atualizar Estoque" (calls `POST /api/inventario/import` with `dryRun=false`).
     - "Descartar / Cancelar" (resets back to upload state).

### Step 4: Transactional Commit Execution
- Clicking "Confirmar e Atualizar Estoque" sends the file to `POST /api/inventario/import` (without `dryRun=true`).
- Button changes to disabled loading state with spinner: "Gravando lote transacional no SQLite...".
- On completion:
  - Displays green success alert: "{novosCadastrados} novos produtos cadastrados, {atualizados} produtos atualizados no estoque."
  - Fires callback `onImportSuccess()` which immediately signals `StockTable` to re-fetch latest data, updating catalog view in real time without a full browser reload.

### Step 5: Live Stock Catalog Table (`StockTable.tsx`)
- Queries `GET /api/inventario/produtos`.
- Search Bar with debounced text input (300ms) matching `codigo`, `barras`, and `discriminacao`.
- Status Filters:
  - "Todos" (all items)
  - "Em Estoque" (`ativo = true` and `quantidade > 0`)
  - "Esgotado" (`quantidade <= 0` or `ativo = false`)
- Columns: Código (monospace), Barras (monospace or `—`), Discriminação (bold), NCM, Unid, Quantidade (bold, red if 0), Unitário (BRL), Total (BRL), Status Badge (`Em Estoque` green vs `Esgotado` rose).
- Pagination: Page buttons, Next/Prev, limit selector (10, 20, 50, 100).
- Loading skeleton / empty state when no items match filter.

### Step 6: Search & Listing API Endpoint (`GET /api/inventario/produtos`)
- New endpoint `src/app/api/inventario/produtos/route.ts`.
- Handles search, filter, sorting, and pagination.
- Generates aggregate catalog statistics in parallel for summary badges.

---

## 3. Detailed Component & API Blueprints

### Blueprint 1: `src/app/api/inventario/produtos/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    // 1. Query parameters extraction & sanitization
    const q = (searchParams.get("q") || "").trim();
    const status = searchParams.get("status") || "todos"; // 'todos' | 'em_estoque' | 'esgotado'
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const sortBy = searchParams.get("sortBy") || "codigo";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

    // Validate sortBy field
    const allowedSortFields = [
      "codigo",
      "discriminacao",
      "quantidade",
      "unitarioCentavos",
      "totalCentavos",
      "atualizadoEm",
    ];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : "codigo";

    // 2. Build where filter
    const where: any = {};

    // Search term (Code, Barcode, Description)
    // Note: SQLite LIKE is case-insensitive for ASCII text without requiring mode: 'insensitive'
    if (q) {
      where.OR = [
        { codigo: { contains: q } },
        { barras: { contains: q } },
        { discriminacao: { contains: q } },
      ];
    }

    // Status filter
    if (status === "em_estoque") {
      where.ativo = true;
      where.quantidade = { gt: 0 };
    } else if (status === "esgotado") {
      where.OR = [
        ...(where.OR ? [{ AND: [where.OR, { OR: [{ quantidade: { lte: 0 } }, { ativo: false }] }] }] : []),
        { quantidade: { lte: 0 } },
        { ativo: false },
      ];
    }

    // 3. Parallel execution: Paginated Query, Filtered Count, and Overall Statistics
    const [totalFiltered, produtos, totalAll, inStockCount, totalCentavosAgg] = await Promise.all([
      prisma.produtoEstoque.count({ where }),
      prisma.produtoEstoque.findMany({
        where,
        orderBy: { [orderField]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.produtoEstoque.count(),
      prisma.produtoEstoque.count({ where: { ativo: true, quantidade: { gt: 0 } } }),
      prisma.produtoEstoque.aggregate({
        _sum: { totalCentavos: true },
      }),
    ]);

    const totalPages = Math.ceil(totalFiltered / limit) || 1;

    return NextResponse.json(
      {
        success: true,
        produtos,
        pagination: {
          page,
          limit,
          totalCount: totalFiltered,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        stats: {
          totalProdutos: totalAll,
          totalItensEmEstoque: inStockCount,
          totalItensEsgotados: Math.max(0, totalAll - inStockCount),
          valorTotalEstoqueCentavos: totalCentavosAgg._sum.totalCentavos || 0,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API /api/inventario/produtos] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao listar produtos do estoque.",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
```

---

### Blueprint 2: `src/components/inventario/FileUploader.tsx`
```tsx
"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, X, AlertCircle, Loader2 } from "lucide-react";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export function FileUploader({ onFileSelect, isLoading, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndHandleFile = (file: File) => {
    setClientError(null);

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setClientError(`Formato inválido (${ext}). Por favor, envie um arquivo .xlsx, .xls ou .csv.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setClientError(`O arquivo excede o limite máximo permitido de 15MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
      return;
    }

    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled || isLoading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isLoading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndHandleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndHandleFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setClientError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={disabled || isLoading}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && !disabled && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
          isDragging
            ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
            : "border-slate-300 hover:border-emerald-400 bg-white hover:bg-slate-50/50"
        } ${disabled || isLoading ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {isLoading ? (
          <div className="flex flex-col items-center py-4">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-700">Lendo e validando estrutura do Modelo P7...</p>
            <p className="text-xs text-slate-500 mt-1">Calculando estimativa de novos produtos e quarentena</p>
          </div>
        ) : selectedFile ? (
          <div className="flex items-center justify-between w-full max-w-md p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-3 truncate">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="truncate text-left">
                <p className="text-sm font-semibold text-slate-800 truncate">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="p-3 mb-3 rounded-full bg-emerald-50 text-emerald-600">
              <UploadCloud className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Arraste a planilha do Inventário Modelo P7 aqui ou{" "}
              <span className="text-emerald-600 underline">clique para selecionar</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Suporta formatos <strong>.xlsx</strong>, <strong>.xls</strong> e <strong>.csv</strong> (até 15MB)
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Ignora preâmbulo administrativo automaticamente (Razão Social, CNPJ, Data)
            </p>
          </div>
        )}
      </div>

      {clientError && (
        <div className="flex items-center gap-2 p-3 mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{clientError}</span>
        </div>
      )}
    </div>
  );
}
```

---

### Blueprint 3: `src/components/inventario/DryRunPreview.tsx`
```tsx
"use client";

import React, { useState } from "react";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  RefreshCw,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  X,
  Loader2,
  Building2,
} from "lucide-react";
import { centavosToBRL } from "@/modules/currency";

export interface DryRunData {
  success: boolean;
  dryRun: boolean;
  fileName: string;
  administrativeHeader: {
    razaoSocial?: string;
    cnpj?: string;
    dataInventario?: string;
  };
  summary: {
    totalItensLidos: number;
    totalItensValidos: number;
    totalItensQuarentena: number;
    novosProdutosEstimados: number;
    produtosAtualizadosEstimados: number;
    valorTotalGeralCentavos: number;
  };
  quarantine: Array<{
    rowNumber: number;
    codigo?: string;
    discriminacao?: string;
    reason: string;
    severity: "WARNING" | "ERROR";
    rawContent?: string;
  }>;
  itemsPreview: Array<{
    codigo: string;
    barras: string | null;
    ncm: string | null;
    discriminacao: string;
    unidade: string;
    quantidade: number;
    unitarioCentavos: number;
    totalCentavos: number;
  }>;
}

interface DryRunPreviewProps {
  data: DryRunData;
  onConfirm: () => void;
  onCancel: () => void;
  isCommitting: boolean;
}

export function DryRunPreview({ data, onConfirm, onCancel, isCommitting }: DryRunPreviewProps) {
  const [isQuarantineOpen, setIsQuarantineOpen] = useState(data.quarantine.length > 0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { administrativeHeader, summary, quarantine, itemsPreview } = data;

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      {/* Header & Meta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Modo Pré-visualização (Dry Run)
            </span>
            <span className="text-xs text-slate-500 font-mono">{data.fileName}</span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            Resumo do Processamento Modelo P7
          </h3>
        </div>

        {/* Administrative Header Info */}
        {(administrativeHeader.razaoSocial || administrativeHeader.cnpj) && (
          <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <Building2 className="w-4 h-4 text-slate-400" />
            <div>
              {administrativeHeader.razaoSocial && (
                <p className="font-semibold">{administrativeHeader.razaoSocial}</p>
              )}
              <p className="text-slate-500">
                CNPJ: {administrativeHeader.cnpj || "Não identificado"} &bull; Data:{" "}
                {administrativeHeader.dataInventario || "Não informada"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 6 Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            Lidos
          </div>
          <p className="mt-1 text-xl font-extrabold text-slate-800">{summary.totalItensLidos}</p>
        </div>

        <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Válidos
          </div>
          <p className="mt-1 text-xl font-extrabold text-emerald-800">{summary.totalItensValidos}</p>
        </div>

        <div className={`p-3.5 rounded-xl border ${quarantine.length > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${quarantine.length > 0 ? "text-amber-700" : "text-slate-500"}`}>
            <AlertTriangle className={`w-4 h-4 ${quarantine.length > 0 ? "text-amber-600" : "text-slate-400"}`} />
            Quarentena
          </div>
          <p className={`mt-1 text-xl font-extrabold ${quarantine.length > 0 ? "text-amber-800" : "text-slate-800"}`}>
            {summary.totalItensQuarentena}
          </p>
        </div>

        <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
            <PlusCircle className="w-4 h-4 text-blue-600" />
            Novos
          </div>
          <p className="mt-1 text-xl font-extrabold text-blue-800">{summary.novosProdutosEstimados}</p>
        </div>

        <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700">
            <RefreshCw className="w-4 h-4 text-indigo-600" />
            Atualizações
          </div>
          <p className="mt-1 text-xl font-extrabold text-indigo-800">{summary.produtosAtualizadosEstimados}</p>
        </div>

        <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Total Geral
          </div>
          <p className="mt-1 text-lg font-black text-emerald-900 truncate">
            {centavosToBRL(summary.valorTotalGeralCentavos)}
          </p>
        </div>
      </div>

      {/* Quarantine Warnings Accordion */}
      {quarantine.length > 0 ? (
        <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/30">
          <button
            type="button"
            onClick={() => setIsQuarantineOpen(!isQuarantineOpen)}
            className="flex items-center justify-between w-full px-4 py-3 bg-amber-100/60 text-amber-900 font-semibold text-sm hover:bg-amber-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              Ocorrências em Quarentena ({quarantine.length} itens com alertas ou ignorados)
            </span>
            {isQuarantineOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isQuarantineOpen && (
            <div className="max-h-60 overflow-y-auto p-4 divide-y divide-amber-100 bg-white">
              {quarantine.map((item, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 last:pb-0 text-xs flex items-start gap-3">
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      item.severity === "ERROR"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {item.severity}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      Linha #{item.rowNumber > 0 ? item.rowNumber : "N/A"}{" "}
                      {item.codigo && <span className="font-mono text-slate-500">[{item.codigo}]</span>}{" "}
                      {item.discriminacao && <span>- {item.discriminacao}</span>}
                    </p>
                    <p className="text-slate-600 mt-0.5">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 bg-emerald-50 rounded-xl border border-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Nenhuma inconformidade encontrada! Todas as linhas da planilha foram validadas com sucesso.</span>
        </div>
      )}

      {/* Preview Table Collapsible */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsPreviewOpen(!isPreviewOpen)}
          className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors"
        >
          <span>Visualizar Itens Válidos ({itemsPreview.length} primeiros registros)</span>
          {isPreviewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isPreviewOpen && (
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3">Barras</th>
                  <th className="py-2.5 px-3">Discriminação</th>
                  <th className="py-2.5 px-3">Unid</th>
                  <th className="py-2.5 px-3 text-right">Qtd</th>
                  <th className="py-2.5 px-3 text-right">Unitário</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsPreview.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-semibold text-slate-800">{item.codigo}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{item.barras || "—"}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{item.discriminacao}</td>
                    <td className="py-2 px-3 text-slate-500 uppercase">{item.unidade}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-800">{item.quantidade}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">{centavosToBRL(item.unitarioCentavos)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">{centavosToBRL(item.totalCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commit & Cancel Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCommitting}
          className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition"
        >
          Descartar / Cancelar
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={isCommitting}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow transition disabled:opacity-50"
        >
          {isCommitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Gravando no Banco de Dados...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Importação de Estoque</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

---

### Blueprint 4: `src/components/inventario/StockTable.tsx`
```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ArrowUpDown,
} from "lucide-react";
import { centavosToBRL } from "@/modules/currency";

interface Produto {
  id: string;
  codigo: string;
  barras: string | null;
  ncm: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitarioCentavos: number;
  totalCentavos: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

interface StockTableProps {
  refreshTrigger?: number;
}

export function StockTable({ refreshTrigger }: StockTableProps) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "em_estoque" | "esgotado">("todos");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState("codigo");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Pagination & Stats from API
  const [pagination, setPagination] = useState({
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [stats, setStats] = useState({
    totalProdutos: 0,
    totalItensEmEstoque: 0,
    totalItensEsgotados: 0,
    valorTotalEstoqueCentavos: 0,
  });

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1); // Reset to page 1 on query change
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchProdutos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: debouncedQuery,
        status: statusFilter,
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
      });

      const res = await fetch(`/api/inventario/produtos?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao consultar produtos");
      }

      setProdutos(data.produtos);
      setPagination(data.pagination);
      setStats(data.stats);
    } catch (err: any) {
      setError(err.message || "Erro na conexão");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, statusFilter, page, limit, sortBy, sortOrder]);

  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos, refreshTrigger]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      {/* Top Section: Title & High-level Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Catálogo de Estoque Atual</h2>
          <p className="text-sm text-slate-500">
            Produtos persistidos no banco de dados e disponíveis para baixa de caixa
          </p>
        </div>

        {/* Global Stock Stats Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-500">Total: </span>
            <span className="font-bold text-slate-800">{stats.totalProdutos} SKUs</span>
          </div>
          <div className="px-3 py-1 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
            <span className="text-emerald-700">Em Estoque: </span>
            <span className="font-bold text-emerald-900">{stats.totalItensEmEstoque}</span>
          </div>
          <div className="px-3 py-1 bg-rose-50 rounded-xl border border-rose-200 text-xs">
            <span className="text-rose-700">Esgotados: </span>
            <span className="font-bold text-rose-900">{stats.totalItensEsgotados}</span>
          </div>
          <div className="px-3 py-1 bg-slate-100 rounded-xl border border-slate-300 text-xs">
            <span className="text-slate-600">Patrimônio: </span>
            <span className="font-extrabold text-slate-900">{centavosToBRL(stats.valorTotalEstoqueCentavos)}</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código, barras ou descrição..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
          />
        </div>

        {/* Status Filter Tabs & Limit & Refresh */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setStatusFilter("todos"); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === "todos" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("em_estoque"); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === "em_estoque" ? "bg-white shadow-sm text-emerald-800 font-bold" : "text-slate-600 hover:text-slate-900"}`}
            >
              Em Estoque
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("esgotado"); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === "esgotado" ? "bg-white shadow-sm text-rose-800 font-bold" : "text-slate-600 hover:text-slate-900"}`}
            >
              Esgotados
            </button>
          </div>

          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="text-xs py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="10">10 / pág</option>
            <option value="20">20 / pág</option>
            <option value="50">50 / pág</option>
            <option value="100">100 / pág</option>
          </select>

          <button
            type="button"
            onClick={() => fetchProdutos()}
            disabled={isLoading}
            title="Atualizar lista"
            className="p-2 text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      {error ? (
        <div className="flex items-center gap-2 p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
          <p className="text-sm">Carregando catálogo de produtos...</p>
        </div>
      ) : produtos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <Package className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-base font-semibold text-slate-800">Nenhum produto encontrado</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchQuery
              ? `Nenhum item corresponde ao termo "${searchQuery}". Tente outro código ou descrição.`
              : "Não há produtos cadastrados. Realize o upload de uma planilha Modelo P7 acima."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold select-none">
              <tr>
                <th
                  onClick={() => handleSort("codigo")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Código</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3">Barras</th>
                <th
                  onClick={() => handleSort("discriminacao")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Discriminação</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-2">Unid</th>
                <th
                  onClick={() => handleSort("quantidade")}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Estoque</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("unitarioCentavos")}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Unitário</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("totalCentavos")}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {produtos.map((p) => {
                const isDisponivel = p.ativo && p.quantidade > 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{p.codigo}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{p.barras || "—"}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{p.discriminacao}</td>
                    <td className="py-2.5 px-2 text-slate-500 uppercase">{p.unidade}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`font-extrabold ${
                          p.quantidade > 0 ? "text-slate-900" : "text-rose-600 bg-rose-50 px-2 py-0.5 rounded"
                        }`}
                      >
                        {p.quantidade}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {centavosToBRL(p.unitarioCentavos)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                      {centavosToBRL(p.totalCentavos)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isDisponivel ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Em Estoque
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" /> Esgotado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && produtos.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3 pt-2">
          <p>
            Página <span className="font-bold text-slate-800">{pagination.page}</span> de{" "}
            <span className="font-bold text-slate-800">{pagination.totalPages}</span> (
            {pagination.totalCount} produtos encontrados)
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={!pagination.hasPrevPage}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>

            <button
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!pagination.hasNextPage}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Blueprint 5: `src/app/inventario/page.tsx`
```tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { FileUploader } from "@/components/inventario/FileUploader";
import { DryRunPreview, DryRunData } from "@/components/inventario/DryRunPreview";
import { StockTable } from "@/components/inventario/StockTable";

export default function InventarioPage() {
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [dryRunData, setDryRunData] = useState<DryRunData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitSuccessMessage, setCommitSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 1. Operator selects file -> Execute Dry Run
  const handleFileSelect = async (file: File) => {
    setActiveFile(file);
    setCommitSuccessMessage(null);
    setErrorMessage(null);
    setIsLoadingPreview(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/inventario/import?dryRun=true", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao processar prévia do arquivo P7");
      }

      setDryRunData(data);
    } catch (err: any) {
      setErrorMessage(err.message || "Falha na comunicação com o servidor.");
      setDryRunData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // 2. Operator confirms commit -> Execute Real Batch Ingestion
  const handleConfirmImport = async () => {
    if (!activeFile) return;

    setIsCommitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", activeFile);

      const res = await fetch("/api/inventario/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao importar dados no banco.");
      }

      const { novosCadastrados, atualizados } = data.summary;
      setCommitSuccessMessage(
        `Importação finalizada com sucesso! ${novosCadastrados} novos itens cadastrados e ${atualizados} itens atualizados no estoque.`
      );

      // Reset upload workflow and trigger live stock refresh
      setDryRunData(null);
      setActiveFile(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao persistir importação no banco.");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCancelPreview = () => {
    setDryRunData(null);
    setActiveFile(null);
    setErrorMessage(null);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/" className="hover:text-emerald-600 flex items-center gap-1 transition">
              <ArrowLeft className="w-4 h-4" /> Início
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Inventário Modelo P7</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            <Package className="w-8 h-8 text-emerald-600" />
            Gestão de Estoque & Inventário Modelo P7
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Importação automatizada de planilhas (.xlsx, .csv), auditoria de integridade e catálogo em tempo real.
          </p>
        </div>
      </div>

      {/* Global Notifications */}
      {commitSuccessMessage && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{commitSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setCommitSuccessMessage(null)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline"
          >
            Fechar
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold text-rose-700 hover:text-rose-900 underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Section 1: Ingestion Workflow (File Uploader or Dry Run Preview) */}
      <section className="space-y-4">
        {!dryRunData ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Importar Nova Planilha de Inventário</h2>
            <p className="text-sm text-slate-500 mb-4">
              Envie o arquivo exportado da contabilidade. O sistema processará em modo prévio (Dry Run) para
              sua conferência antes de gravar qualquer alteração.
            </p>
            <FileUploader
              onFileSelect={handleFileSelect}
              isLoading={isLoadingPreview}
            />
          </div>
        ) : (
          <DryRunPreview
            data={dryRunData}
            onConfirm={handleConfirmImport}
            onCancel={handleCancelPreview}
            isCommitting={isCommitting}
          />
        )}
      </section>

      {/* Section 2: Live Stock Catalog Table */}
      <section>
        <StockTable refreshTrigger={refreshTrigger} />
      </section>
    </main>
  );
}
```

---

## 4. Caveats
1. **Prisma with SQLite Case-Insensitivity**:
   SQLite's default `LIKE` operator is case-insensitive for standard ASCII characters, but Prisma disables `mode: 'insensitive'` when the datasource provider is SQLite. Therefore, Prisma queries in `GET /api/inventario/produtos` MUST use `contains: q` without passing `mode: 'insensitive'` to prevent runtime validation exceptions.
2. **File Size Boundaries**:
   The file size limit is strictly enforced at 15MB on both the client (in `FileUploader.tsx`) and the server (`src/app/api/inventario/import/route.ts`).
3. **Client-Side Currency Module Safety**:
   `src/modules/currency/index.ts` is purely algebraic and math-based with zero Node-only libraries (`fs`, `crypto`, etc.). It can be imported safely in `"use client"` React components without bundling issues.
4. **Duplicate Codes in File**:
   As tested in M2, when the same internal code appears multiple times in a single P7 file, the parser consolidates quantities and logs a `WARNING` severity item in quarantine. The UI displays this warning clearly in the quarantine accordion.

---

## 5. Conclusion
- The Inventory Management UI architecture (`F22`) cleanly fulfills all requirements of `R2`.
- The user flow guarantees zero risk of inadvertent database pollution: the file is automatically analyzed via `POST /api/inventario/import?dryRun=true`, presenting an exhaustive summary card, quarantined alerts, and a 50-row preview before any commit takes place.
- The new `GET /api/inventario/produtos` endpoint provides paginated, sorted, and filtered access to the live stock table with integrated aggregate metrics.
- All code blueprints are fully typed, adhere to React 19 / Next.js 15 App Router standards, and are ready for implementation.

---

## 6. Verification Method

### 6.1 Automated Verification Commands
```powershell
# 1. Run full test suite to guarantee zero regression
npx vitest run

# 2. Integration test for the new products endpoint
npx vitest run tests/integration/inventario-produtos-api.test.ts
```

### 6.2 Manual Verification Checklist
1. Open `/inventario`:
   - Verify header, file upload dropzone, and live stock catalog table load without errors.
2. Drag & drop synthetic fixture `tests/fixtures/p7_padrao_completo.xlsx`:
   - Verify Dry Run mode triggers automatically.
   - Verify Summary Cards show total items, valid items, and inventory value in BRL format.
   - Verify quarantine warnings accordion opens/closes properly.
3. Click "Confirmar Importação de Estoque":
   - Verify commit request succeeds.
   - Verify success notification displays.
   - Verify the Stock Catalog Table below auto-refreshes with the newly ingested SKUs.
4. Live Catalog Interactive Search:
   - Type SKU or name into search input: verify debounced filtering.
   - Click "Em Estoque" and "Esgotados" filter tabs: verify filtering and badge updates.
   - Change pagination limit and navigate pages: verify correct offset and count.
