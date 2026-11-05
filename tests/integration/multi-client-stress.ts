import { PrismaClient } from "@prisma/client";

async function runMultiClientStress() {
  const CLIENT_COUNT = 10;
  const OPS_PER_CLIENT = 10;
  console.log(`Starting multi-client stress test: ${CLIENT_COUNT} distinct PrismaClients, ${OPS_PER_CLIENT} transactions each (${CLIENT_COUNT * OPS_PER_CLIENT} total transactions)...`);

  const clients = Array.from({ length: CLIENT_COUNT }).map(
    () => new PrismaClient({ log: ["error"] })
  );

  // Apply pragmas cleanly via queryRawUnsafe on each client
  await Promise.all(
    clients.map(async (c) => {
      await c.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
      await c.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
      await c.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
      await c.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
    })
  );

  // Create a shared product for contention
  const adminClient = clients[0];
  const prod = await adminClient.produtoEstoque.create({
    data: {
      codigo: `MULTI-STRESS-${Date.now()}`,
      discriminacao: "Produto Multi-Client Contention",
      unidade: "UN",
      quantidade: 10000,
      unitarioCentavos: 100,
      totalCentavos: 1000000,
      ativo: true,
    },
  });

  const startTime = Date.now();
  const errors: Error[] = [];
  const historicoIds: string[] = [];

  const promises: Promise<void>[] = [];

  for (let cIdx = 0; cIdx < CLIENT_COUNT; cIdx++) {
    const client = clients[cIdx];
    const clientTask = async () => {
      for (let op = 0; op < OPS_PER_CLIENT; op++) {
        try {
          const res = await client.$transaction(async (tx) => {
            const item = await tx.produtoEstoque.findUniqueOrThrow({
              where: { id: prod.id },
            });
            const updated = await tx.produtoEstoque.update({
              where: { id: prod.id },
              data: {
                quantidade: item.quantidade - 1,
                totalCentavos: (item.quantidade - 1) * item.unitarioCentavos,
              },
            });
            const hist = await tx.historicoBaixa.create({
              data: {
                produtoId: prod.id,
                codigoProduto: prod.codigo,
                discriminacaoProduto: prod.discriminacao,
                quantidadeBaixada: 1,
                unitarioCentavos: item.unitarioCentavos,
                totalCentavos: item.unitarioCentavos,
                formaPagamento: op % 2 === 0 ? "CARTAO" : "DINHEIRO",
              },
            });
            return hist.id;
          });
          historicoIds.push(res);
        } catch (err: any) {
          errors.push(err);
        }
      }
    };
    promises.push(clientTask());
  }

  await Promise.all(promises);
  const duration = Date.now() - startTime;

  console.log(`Stress finished in ${duration}ms.`);
  console.log(`Total transactions executed: ${historicoIds.length}`);
  console.log(`Errors encountered: ${errors.length}`);

  const busyErrors = errors.filter(
    (e) => e.message?.includes("SQLITE_BUSY") || e.message?.includes("database is locked")
  );
  console.log(`SQLITE_BUSY errors: ${busyErrors.length}`);

  // Verification of final quantity
  const finalProd = await adminClient.produtoEstoque.findUniqueOrThrow({
    where: { id: prod.id },
  });
  console.log(`Initial stock: 10000, Expected stock: ${10000 - historicoIds.length}, Actual stock: ${finalProd.quantidade}`);

  // Clean up
  console.log("Cleaning up synthetic test data...");
  await adminClient.historicoBaixa.deleteMany({
    where: { id: { in: historicoIds } },
  });
  await adminClient.produtoEstoque.delete({
    where: { id: prod.id },
  });
  console.log("Cleanup complete.");

  await Promise.all(clients.map((c) => c.$disconnect()));

  if (errors.length > 0) {
    process.exit(1);
  }
}

runMultiClientStress().catch((err) => {
  console.error("Fatal stress error:", err);
  process.exit(1);
});
