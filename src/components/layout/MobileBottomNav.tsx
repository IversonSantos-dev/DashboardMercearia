"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  BarChart3,
  Package,
  LayoutDashboard,
} from "lucide-react";

export function MobileBottomNav() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Caixa",
      href: "/caixa",
      icon: ShoppingCart,
      active: pathname.startsWith("/caixa"),
      badge: "POS",
    },
    {
      name: "Financeiro",
      href: "/financeiro",
      icon: BarChart3,
      active: pathname.startsWith("/financeiro"),
    },
    {
      name: "Inventário",
      href: "/inventario",
      icon: Package,
      active: pathname.startsWith("/inventario"),
    },
    {
      name: "Início",
      href: "/",
      icon: LayoutDashboard,
      active: pathname === "/",
    },
  ];

  return (
    <nav
      aria-label="Navegação Principal Mobile"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="grid grid-cols-4 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all select-none relative ${
                item.active
                  ? "text-blue-600 font-bold"
                  : "text-slate-500 hover:text-slate-900 active:scale-95"
              }`}
            >
              <div
                className={`flex items-center justify-center p-1 rounded-xl transition-colors ${
                  item.active ? "bg-blue-50" : ""
                }`}
              >
                <Icon className={`h-5 w-5 ${item.active ? "text-blue-600" : "text-slate-500"}`} />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight leading-none">
                {item.name}
              </span>
              {item.badge && !item.active && (
                <span className="absolute top-1 right-2 text-[8px] font-black bg-blue-100 text-blue-700 px-1 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
