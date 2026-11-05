import type { Metadata, Viewport } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard Mercearia",
  description:
    "Controle diário de vendas (Cartão vs. Dinheiro) e Baixa Inteligente Modelo P7",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900 flex flex-col pb-24 md:pb-6">
        <Navbar />
        <main className="flex-1">{children}</main>
        <MobileBottomNav />
      </body>
    </html>
  );
}
