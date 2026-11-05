# Milestone 1: Foundation Strategy & Tooling Blueprint
**Author**: M1 Foundation Explorer (`m1_explorer_1`)  
**Scope**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, Vitest Configuration, Path Aliases, Foundation Scripts, and Windows Installation Strategy.

---

## 1. Executive Summary & Environmental Context

### Environment Profile
- **OS**: Windows 11 / Windows Server x64
- **Node.js**: `v24.20.0`
- **pnpm**: `10.4.1` (installed and primary)
- **npm**: `11.19.0` (installed and fallback)
- **Workspace Root**: `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia`

The workspace is a greenfield project. To guarantee fast, deterministic setup without interactive CLI prompts (`create-next-app` prompts) or Windows file-locking issues, the recommended strategy is to **directly generate the configuration files** (`package.json`, `tsconfig.json`, `vitest.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, etc.) and invoke `pnpm install`.

---

## 2. Complete `package.json` Specification

### File: `package.json` (Workspace Root)
```json
{
  "name": "dashboard-mercearia",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.4.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.68.0",
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.0.1",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.13.4",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^26.0.0",
    "postcss": "^8.5.2",
    "prisma": "^6.4.1",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vite-tsconfig-paths": "^5.1.4",
    "vitest": "^3.0.5"
  }
}
```

### Dependency Rationale:
1. **Next.js 15 & React 19**: `next: ^15.2.0` paired with `react: ^19.0.0` provides the modern App Router foundation with server actions and streaming SSR.
2. **Prisma 6.4**: `@prisma/client` and `prisma` CLI provide type-safe SQLite database operations with WAL mode support (aligned with Explorer 2).
3. **Tailwind CSS 3.4 & PostCSS**: Rock-solid, zero breaking changes with shadcn/ui and Next.js 15. Includes `clsx` and `tailwind-merge` (`cn` helper function).
4. **Vitest 3.x + `vite-tsconfig-paths`**: Extremely fast test execution (<50ms for unit tests), natively resolving `@/*` aliases without complex mock configurations.
5. **Lucide React & XLSX**: Pre-bundled for POS UI icons (Milestone 4) and Model P7 spreadsheet parsing (Milestone 2).

---

## 3. Windows Non-Blocking Installation Strategy

Windows environments frequently suffer from:
1. **File Locking (EPERM)** during `node_modules` folder writes by antivirus or Windows search indexer.
2. **MAX_PATH (260 characters)** overflow when deeply nesting dependencies under `node_modules`.
3. **Interactive CLI Blocking**: Commands like `npx create-next-app` or `npm init` wait for TTY inputs that hang autonomous agents.

### Recommended Installation Procedure:
1. **Direct file writing**: The implementer creates `package.json` directly.
2. **Primary Package Manager (`pnpm`)**:
   - `pnpm` is already installed (`10.4.1`).
   - Uses hardlinks into a global content-addressable store (`~/.local/share/pnpm/store`), completely bypassing Windows MAX_PATH length limits and drastically reducing disk I/O.
   - Command to execute:
     ```powershell
     pnpm install
     ```
   - Timeout recommendation in `run_command`: `WaitMsBeforeAsync: 10000`. If pnpm finishes in 8-15 seconds, it either returns synchronously or notifies via completion event without blocking.
3. **Fallback Package Manager (`npm`)**:
   - If pnpm encounters any unexpected network or registry timeout:
     ```powershell
     npm install --no-audit --no-fund --legacy-peer-deps
     ```

---

## 4. TypeScript Configuration (`tsconfig.json`)

To satisfy the contract requirement (`@/*` -> `./src/*`) and ensure compatibility with Next.js 15 bundler resolution and Vitest:

### File: `tsconfig.json` (Workspace Root)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

---

## 5. Vitest Configuration (`vitest.config.ts`)

Vitest is configured with `vite-tsconfig-paths` so that `@/modules/...`, `@/lib/...`, and `@/components/...` work in tests without any path mapping duplication.

### File: `vitest.config.ts` (Workspace Root)
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: "node", // Default to node for sub-millisecond execution of core modules (currency, parser-p7, baixa-inteligente, transacoes)
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
```

*Note on test environments*: Pure TypeScript modules (`src/modules/currency`, `src/modules/parser-p7`, etc.) execute under the blazing fast `'node'` environment. When UI component tests in Milestone 4 require a DOM, they can annotate the top of their test file with:
```typescript
// @vitest-environment jsdom
```

---

## 6. Styling & Layout Configuration

### 6.1 Tailwind Configuration: `tailwind.config.ts`
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border, 214.3 31.8% 91.4%))",
        background: "hsl(var(--background, 0 0% 100%))",
        foreground: "hsl(var(--foreground, 222.2 84% 4.9%))",
        primary: {
          DEFAULT: "hsl(var(--primary, 221.2 83.2% 53.3%))",
          foreground: "hsl(var(--primary-foreground, 210 40% 98%))",
        },
      },
    },
  },
  plugins: [],
};
export default config;
```

### 6.2 PostCSS Configuration: `postcss.config.mjs`
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 6.3 Global Styles: `src/app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #f8fafc;
  --foreground: #0f172a;
}

body {
  color: var(--foreground);
  background: var(--background);
  font-feature-settings: "rlig" 1, "calt" 1;
}
```

### 6.4 Next.js Configuration: `next.config.ts`
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

### 6.5 Utility helper: `src/lib/utils.ts`
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 7. Foundation Application Shell (`src/app`)

### 7.1 Root Layout: `src/app/layout.tsx`
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard Mercearia",
  description: "Controle diário de vendas (Cartão vs. Dinheiro) e Baixa Inteligente Modelo P7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
        {children}
      </body>
    </html>
  );
}
```

### 7.2 Home Dashboard Shell: `src/app/page.tsx`
```tsx
import Link from "next/link";
import { ShoppingCart, Package, BarChart3, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Dashboard Mercearia
        </h1>
        <p className="mt-2 text-lg text-slate-600">
          Controle de Caixa Diário &bull; Baixa Inteligente de Estoque &bull; Inventário Modelo P7
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Frente de Caixa */}
        <Link
          href="/caixa"
          className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-blue-500"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Frente de Caixa</h2>
          <p className="mt-2 text-sm text-slate-500">
            Lançamento de vendas diárias e baixa inteligente automatizada por valor alvo (Cartão vs Dinheiro).
          </p>
          <div className="mt-4 flex items-center text-sm font-semibold text-blue-600">
            Acessar Frente de Caixa <ArrowRight className="ml-1 h-4 w-4" />
          </div>
        </Link>

        {/* Card Inventário */}
        <Link
          href="/inventario"
          className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-emerald-500"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Package className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Inventário Modelo P7</h2>
          <p className="mt-2 text-sm text-slate-500">
            Importação e processamento de planilhas (.xlsx, .csv), catálogo de produtos e auditoria de saldo.
          </p>
          <div className="mt-4 flex items-center text-sm font-semibold text-emerald-600">
            Acessar Inventário <ArrowRight className="ml-1 h-4 w-4" />
          </div>
        </Link>

        {/* Card Financeiro */}
        <Link
          href="/financeiro"
          className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-violet-500"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600 mb-4 group-hover:bg-violet-600 group-hover:text-white transition-colors">
            <BarChart3 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Painel Financeiro</h2>
          <p className="mt-2 text-sm text-slate-500">
            Fechamento de caixa diário, confronto mensal de entradas vs saídas e histórico consolidado.
          </p>
          <div className="mt-4 flex items-center text-sm font-semibold text-violet-600">
            Acessar Financeiro <ArrowRight className="ml-1 h-4 w-4" />
          </div>
        </Link>
      </div>
    </main>
  );
}
```

---

## 8. Concrete Implementation Steps for Implementer Agent

When the sub-orchestrator or implementer agent begins execution of Milestone 1, execute these steps sequentially:

1. **Step 1: Write Configuration Files**
   - Write `package.json` with scripts and dependencies.
   - Write `tsconfig.json` with `@/* -> ./src/*`.
   - Write `vitest.config.ts` with `vite-tsconfig-paths` and `node` environment.
   - Write `tailwind.config.ts` and `postcss.config.mjs`.
   - Write `next.config.ts`.

2. **Step 2: Create Base Project Directory Structure**
   - Create directories:
     ```powershell
     mkdir -p src/app src/components/ui src/lib src/modules/currency tests/unit tests/fixtures
     ```

3. **Step 3: Write Shell Files**
   - Write `src/app/globals.css`.
   - Write `src/app/layout.tsx`.
   - Write `src/app/page.tsx`.
   - Write `src/lib/utils.ts`.

4. **Step 4: Execute Dependency Installation**
   - Run:
     ```powershell
     pnpm install
     ```
   - If pnpm returns code 0, dependencies are linked into `node_modules` in ~10 seconds.
   - If fallback is needed: `npm install --no-audit --legacy-peer-deps`.

5. **Step 5: Verify Tooling**
   - Run Vitest:
     ```powershell
     pnpm test
     ```
   - Verify TypeScript compilation:
     ```powershell
     npx tsc --noEmit
     ```

This complete roadmap satisfies all M1 foundation objectives and guarantees seamless integration with M1 Database (Explorer 2) and M1 Currency Engine (Explorer 3).
