import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { username, password } = await req.json();

    if (username === "Admin" && password === "Admin123") {
      const response = NextResponse.json({ success: true });
      // Cookie de autenticação simples e seguro (sessão de 30 dias)
      response.cookies.set("admin_session", "authenticated", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 dias
      });
      return response;
    }

    return NextResponse.json(
      { success: false, error: "Usuário ou senha inválidos." },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Erro ao processar login." },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  response.cookies.set("admin_session", "", {
    path: "/",
    maxAge: 0,
  });
  return response;
}
