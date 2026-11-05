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
    // Note: SQLite LIKE is case-insensitive for ASCII text without mode: 'insensitive'
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
      const esgotadoCondition = {
        OR: [{ quantidade: { lte: 0 } }, { ativo: false }],
      };
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          esgotadoCondition,
        ];
        delete where.OR;
      } else {
        where.OR = esgotadoCondition.OR;
      }
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
