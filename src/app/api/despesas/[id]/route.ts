import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { deleteDespesaFromSupabase } from "@/lib/supabase-sync";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID inválido." },
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

    // Dual-Write: Excluir no Supabase online
    deleteDespesaFromSupabase(id).catch((e) =>
      console.error("[Supabase Sync] Falha ao deletar despesa no Supabase:", e)
    );

    return NextResponse.json(
      { success: true, message: "Despesa excluída com sucesso.", idExcluido: id },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao excluir despesa.", details: err?.message },
      { status: 500 }
    );
  }
}
