import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { brlToCentavos, centavosToBRL } from "@/modules/currency";
import { syncNotaFiscalToSupabase } from "@/lib/supabase-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const mesAno = searchParams.get("mesAno");

    if (mesAno) {
      if (!/^\d{4}-\d{2}$/.test(mesAno)) {
        return NextResponse.json(
          { success: false, error: "Formato de mesAno inválido. Esperado: YYYY-MM." },
          { status: 400 }
        );
      }
      const nf = await prisma.notaFiscalMensal.findUnique({
        where: { mesAno },
      });

      return NextResponse.json({
        success: true,
        notaFiscal: nf
          ? {
              ...nf,
              valorBRL: centavosToBRL(nf.valorCentavos),
            }
          : null,
      });
    }

    const nfs = await prisma.notaFiscalMensal.findMany({
      orderBy: { mesAno: "desc" },
    });

    return NextResponse.json({
      success: true,
      notasFiscais: nfs.map((n) => ({
        ...n,
        valorBRL: centavosToBRL(n.valorCentavos),
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao consultar notas fiscais mensais.", details: err?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { mesAno, valor, observacoes } = body;

    if (!mesAno || !/^\d{4}-\d{2}$/.test(mesAno)) {
      return NextResponse.json(
        { success: false, error: "Mês de referência inválido (YYYY-MM)." },
        { status: 400 }
      );
    }

    let centavos: number;
    if (typeof valor === "number") {
      centavos = Number.isInteger(valor) ? valor : Math.round(valor * 100);
    } else if (typeof valor === "string") {
      centavos = brlToCentavos(valor);
    } else {
      return NextResponse.json(
        { success: false, error: "Valor de nota fiscal inválido." },
        { status: 400 }
      );
    }

    const saved = await prisma.notaFiscalMensal.upsert({
      where: { mesAno },
      create: {
        mesAno,
        valorCentavos: centavos,
        observacoes: observacoes || `Nota Fiscal informada manualmente para ${mesAno}`,
      },
      update: {
        valorCentavos: centavos,
        observacoes: observacoes !== undefined ? observacoes : undefined,
      },
    });

    // Sincroniza em background com o Supabase online
    syncNotaFiscalToSupabase(saved).catch((e) =>
      console.error("[Supabase Sync] Falha ao sincronizar NF:", e)
    );

    return NextResponse.json({
      success: true,
      notaFiscal: {
        ...saved,
        valorBRL: centavosToBRL(saved.valorCentavos),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao registrar nota fiscal mensal.", details: err?.message },
      { status: 500 }
    );
  }
}
