import { PrismaClient } from "@prisma/client";

/**
 * Cria e configura uma instância do Prisma Client com otimizações para SQLite.
 */
const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  // Detecta se a conexão ativa é SQLite local
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isSqlite = databaseUrl.startsWith("file:") || !databaseUrl;

  if (isSqlite) {
    // Aplica pragmas de alta concorrência e integridade para SQLite
    // Pragmas que retornam linhas tabulares (journal_mode, busy_timeout) exigem $queryRawUnsafe
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
      .$executeRawUnsafe(`PRAGMA synchronous = NORMAL;`)
      .catch((err) =>
        console.warn("[Prisma] Falha ao definir PRAGMA synchronous=NORMAL:", err)
      );

    client
      .$executeRawUnsafe(`PRAGMA foreign_keys = ON;`)
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
