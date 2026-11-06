"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Store,
  ShoppingCart,
  Package,
  BarChart3,
  LayoutDashboard,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Visão Geral",
      href: "/",
      icon: LayoutDashboard,
      active: pathname === "/",
    },
    {
      name: "Frente de Caixa",
      href: "/caixa",
      icon: ShoppingCart,
      active: pathname.startsWith("/caixa"),
    },
    {
      name: "Inventário P7",
      href: "/inventario",
      icon: Package,
      active: pathname.startsWith("/inventario"),
    },
    {
      name: "Painel Financeiro",
      href: "/financeiro",
      icon: BarChart3,
      active: pathname.startsWith("/financeiro"),
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm hidden md:block">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Store className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-slate-900 tracking-tight text-lg leading-tight">
              Mercearia
            </span>
            <span className="text-xs font-medium text-slate-500 leading-tight">
              Controle &amp; Caixa
            </span>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  item.active
                    ? "bg-blue-50 text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon className={`h-4 w-4 ${item.active ? "text-blue-600" : "text-slate-400"}`} />
                <span className="hidden md:inline">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Operational Status */}
        <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-slate-200">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-slate-600">
            SQLite WAL Ativo
          </span>
        </div>
      </div>
    </header>
  );
}
