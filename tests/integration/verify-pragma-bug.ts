import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

async function verifyPragmaBug() {
  const tempDbPath = path.resolve("./prisma/temp_challenger_test.db");
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  // Initialize client pointing to fresh temp SQLite DB
  const client = new PrismaClient({
    datasources: {
      db: {
        url: `file:${tempDbPath}`,
      },
    },
    log: ["error"],
  });

  console.log("=== EMPIRICAL PROOF: TESTING src/lib/prisma.ts PRAGMA INITIALIZATION ===");

  // 1. Check default journal_mode and busy_timeout
  const defaultMode = await client.$queryRawUnsafe<any[]>("PRAGMA journal_mode;");
  const defaultTimeout = await client.$queryRawUnsafe<any[]>("PRAGMA busy_timeout;");
  console.log("1. Default SQLite state:", {
    journal_mode: defaultMode[0]?.journal_mode,
    busy_timeout: defaultTimeout[0]?.timeout?.toString(),
  });

  // 2. Simulate EXACT logic from src/lib/prisma.ts:
  // client.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`)
  let journalError: any = null;
  try {
    await client.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`);
  } catch (err) {
    journalError = err;
  }
  console.log("2. Result of $executeRawUnsafe('PRAGMA journal_mode = WAL;'):", {
    failed: !!journalError,
    errorCode: journalError?.code,
    errorMessage: journalError?.message,
  });

  // 3. Simulate EXACT logic from src/lib/prisma.ts:
  // client.$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`)
  let timeoutError: any = null;
  try {
    await client.$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`);
  } catch (err) {
    timeoutError = err;
  }
  console.log("3. Result of $executeRawUnsafe('PRAGMA busy_timeout = 5000;'):", {
    failed: !!timeoutError,
    errorCode: timeoutError?.code,
    errorMessage: timeoutError?.message,
  });

  // 4. Inspect if pragmas changed
  const afterMode = await client.$queryRawUnsafe<any[]>("PRAGMA journal_mode;");
  const afterTimeout = await client.$queryRawUnsafe<any[]>("PRAGMA busy_timeout;");
  console.log("4. Pragmas after src/lib/prisma.ts initialization logic:", {
    journal_mode: afterMode[0]?.journal_mode,
    busy_timeout: afterTimeout[0]?.timeout?.toString(),
  });

  // 5. Demonstrate the CORRECT method: $queryRawUnsafe
  console.log("5. Applying pragmas via $queryRawUnsafe:");
  const correctJournal = await client.$queryRawUnsafe<any[]>("PRAGMA journal_mode = WAL;");
  const correctTimeout = await client.$queryRawUnsafe<any[]>("PRAGMA busy_timeout = 5000;");
  const verifiedMode = await client.$queryRawUnsafe<any[]>("PRAGMA journal_mode;");
  const verifiedTimeout = await client.$queryRawUnsafe<any[]>("PRAGMA busy_timeout;");
  console.log("   Result after $queryRawUnsafe:", {
    journal_mode: verifiedMode[0]?.journal_mode,
    busy_timeout: verifiedTimeout[0]?.timeout?.toString(),
  });

  await client.$disconnect();
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  const walFile = `${tempDbPath}-wal`;
  if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
  const shmFile = `${tempDbPath}-shm`;
  if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
}

verifyPragmaBug().catch(console.error);
