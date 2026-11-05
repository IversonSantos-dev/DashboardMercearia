import { NextRequest, NextResponse } from "next/server";
import { getDetailedMonthlyConsolidation } from "@/modules/financeiro";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const mesAnoParam = searchParams.get("mesAno");

    // Padrão para o mês atual caso não seja fornecido
    const mesAno = mesAnoParam || new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(mesAno)) {
      return NextResponse.json(
        {
          success: false,
          error: `Mês de referência inválido: "${mesAno}". Formato esperado: YYYY-MM.`,
        },
        { status: 400 }
      );
    }

    const data = await getDetailedMonthlyConsolidation(mesAno);

    return NextResponse.json(
      {
        success: true,
        ...data,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao consolidar dados financeiros mensais.",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
