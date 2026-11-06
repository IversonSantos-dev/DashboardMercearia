import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas protegidas do sistema interno
  const protectedRoutes = ["/caixa", "/inventario", "/financeiro"];
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected) {
    const session = request.cookies.get("admin_session");
    if (!session || session.value !== "authenticated") {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/caixa/:path*", "/inventario/:path*", "/financeiro/:path*"],
};
