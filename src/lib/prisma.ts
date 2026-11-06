import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

/**
 * Cria e configura uma instância do Prisma Client com otimizações para SQLite.
 * Suporta ambientes Serverless (Netlify / Vercel / AWS Lambda) copiando o banco
 * para /tmp se o diretório atual for somente leitura.
 */
function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL;

  // Se já estiver explicitamente configurado como outro banco (ex: postgresql://)
  if (envUrl && !envUrl.startsWith("file:")) {
    return envUrl;
  }

  // Se estivermos em ambiente serverless Linux (Netlify ou AWS Lambda ou Vercel)
  const isServerless = Boolean(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL
  );

  if (isServerless) {
    const tmpDbPath = "/tmp/dev.db";
    try {
      // Localiza o banco original no repositório
      const possibleSourcePaths = [
        path.join(process.cwd(), "prisma", "dev.db"),
        path.join(__dirname, "dev.db"),
        path.resolve("prisma/dev.db"),
      ];

      const sourcePath = possibleSourcePaths.find((p) => fs.existsSync(p));

      if (sourcePath && !fs.existsSync(tmpDbPath)) {
        fs.copyFileSync(sourcePath, tmpDbPath);
        console.log(`[Prisma] Banco copiado com sucesso para ${tmpDbPath}`);
      }
      return `file:${tmpDbPath}`;
    } catch (err) {
      console.warn("[Prisma] Falha ao copiar banco para /tmp, usando fallback:", err);
    }
  }

  return envUrl || "file:./dev.db";
}

const prismaClientSingleton = () => {
  const activeDbUrl = resolveDatabaseUrl();
  const isSqlite = activeDbUrl.startsWith("file:");

  const client = new PrismaClient({
    datasources: {
      db: {
        url: activeDbUrl,
      },
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  if (isSqlite) {
    client
      .$queryRawUnsafe(`PRAGMA journal_mode = WAL;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA journal_mode=WAL:", err)
      );

    client
      .$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA busy_timeout=5000:", err)
      );

    client
      .$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA synchronous=NORMAL:", err)
      );

    client
      .$queryRawUnsafe(`PRAGMA foreign_keys = ON;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA foreign_keys=ON:", err)
      );
  }

  return client;
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined;
} & typeof global;

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
