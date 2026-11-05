import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { brlToCentavos, centavosToBRL, addMoney } from "@/modules/currency";
import { CATEGORIAS_DESPESA_LABELS, CANONICAL_EXPENSE_CATEGORIES } from "@/modules/financeiro";
import { syncDespesaToSupabase, deleteDespesaFromSupabase } from "@/lib/supabase-sync";

export const dynamic = "force-dynamic";

const CATEGORIAS_VALIDAS = new Set<string>(CANONICAL_EXPENSE_CATEGORIES);

/**
 * GET /api/despesas
 * Lista despesas filtradas opcionalmente por mesAno ("YYYY-MM") e categoria.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const mesAno = searchParams.get("mesAno");
    const categoria = searchParams.get("categoria");

    const where: any = {};
    if (mesAno) {
      if (!/^\d{4}-\d{2}$/.test(mesAno)) {
        return NextResponse.json(
          { success: false, error: "Formato de mesAno inválido. Esperado YYYY-MM." },
          { status: 400 }
        );
      }
      where.mesAno = mesAno;
    }
    if (categoria) {
      where.categoria = categoria;
    }

    const despesas = await prisma.despesaMensal.findMany({
      where,
      orderBy: [{ dataPagamento: "desc" }, { criadoEm: "desc" }],
    });

    const totalCentavos = despesas.reduce(
      (acc, curr) => addMoney(acc, curr.valorCentavos),
      0
    );

    return NextResponse.json(
      {
        success: true,
        despesas: despesas.map((d) => ({
          ...d,
          valorBRL: centavosToBRL(d.valorCentavos),
          categoriaLabel: CATEGORIAS_DESPESA_LABELS[d.categoria] || d.categoria,
        })),
        totalCentavos,
        totalBRL: centavosToBRL(totalCentavos),
        contagem: despesas.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao consultar despesas.", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/despesas
 * Registra uma nova despesa com validação estrita de categoria e centavos.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "JSON inválido no corpo da requisição." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Corpo da requisição não pode ser vazio." },
        { status: 400 }
      );
    }

    // 1. Descrição
    const descricao = String(body.descricao || "").trim();
    if (!descricao) {
      return NextResponse.json(
        { success: false, error: "O campo 'descricao' é obrigatório." },
        { status: 400 }
      );
    }

    // 2. Categoria
    const categoria = String(body.categoria || "").trim().toUpperCase();
    if (!CATEGORIAS_VALIDAS.has(categoria)) {
      return NextResponse.json(
        {
          success: false,
          error: `Categoria inválida: "${body.categoria}". Categorias permitidas: ${Array.from(
            CATEGORIAS_VALIDAS
          ).join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // 3. Valor (aceita valorCentavos ou valor string/número BRL)
    let valorCentavos: number;
    try {
      if (typeof body.valorCentavos === "number") {
        if (!Number.isSafeInteger(body.valorCentavos) || body.valorCentavos <= 0) {
          throw new RangeError("O valor em centavos deve ser um inteiro positivo maior que zero.");
        }
        valorCentavos = body.valorCentavos;
      } else if (body.valor !== undefined && body.valor !== null) {
        valorCentavos = brlToCentavos(body.valor);
        if (valorCentavos <= 0) {
          throw new RangeError("O valor da despesa deve ser maior que zero.");
        }
      } else {
        return NextResponse.json(
          { success: false, error: "É obrigatório fornecer 'valor' ou 'valorCentavos'." },
          { status: 400 }
        );
      }
    } catch (valErr: any) {
      return NextResponse.json(
        { success: false, error: valErr?.message || "Valor financeiro inválido." },
        { status: 400 }
      );
    }

    // 4. Data de Pagamento e Competência (mesAno)
    const dataPagamento = body.dataPagamento ? String(body.dataPagamento).trim() : null;
    if (dataPagamento && !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
      return NextResponse.json(
        {
          success: false,
          error: `Data de pagamento inválida: "${dataPagamento}". Formato: YYYY-MM-DD.`,
        },
        { status: 400 }
      );
    }

    let mesAno = body.mesAno ? String(body.mesAno).trim() : null;
    if (!mesAno) {
      if (dataPagamento) {
        mesAno = dataPagamento.slice(0, 7);
      } else {
        mesAno = new Date().toISOString().slice(0, 7);
      }
    }

    if (!/^\d{4}-\d{2}$/.test(mesAno)) {
      return NextResponse.json(
        {
          success: false,
          error: `Mês de competência inválido: "${mesAno}". Formato: YYYY-MM.`,
        },
        { status: 400 }
      );
    }

    // 5. Inserção no Banco
    const despesa = await prisma.despesaMensal.create({
      data: {
        descricao,
        categoria,
        valorCentavos,
        mesAno,
        dataPagamento,
      },
    });

    // Dual-Write: Replicar para o Supabase online
    syncDespesaToSupabase(despesa).catch((e) =>
      console.error("[Supabase Sync] Falha ao sincronizar despesa:", e)
    );

    return NextResponse.json(
      {
        success: true,
        despesa: {
          ...despesa,
          valorBRL: centavosToBRL(despesa.valorCentavos),
          categoriaLabel: CATEGORIAS_DESPESA_LABELS[despesa.categoria] || despesa.categoria,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao cadastrar despesa.", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/despesas?id=... (Query param or JSON body support)
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {
        // Ignora caso não haja body
      }
    }

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, error: "O parâmetro 'id' da despesa é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.despesaMensal.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Despesa com ID "${id}" não encontrada.` },
        { status: 404 }
      );
    }

    await prisma.despesaMensal.delete({
      where: { id },
    });

    // Dual-Write: Excluir no Supabase
    deleteDespesaFromSupabase(id).catch((e) =>
      console.error("[Supabase Sync] Falha ao deletar despesa no Supabase:", e)
    );

    return NextResponse.json(
      {
        success: true,
        message: "Despesa excluída com sucesso.",
        idExcluido: id,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao excluir despesa.", details: err?.message },
      { status: 500 }
    );
  }
}
