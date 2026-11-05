import prisma from "../src/lib/prisma";

async function main() {
  const pCount = await prisma.produtoEstoque.count();
  const lCount = await prisma.lancamentoDiario.count();
  const bCount = await prisma.historicoBaixa.count();
  const dCount = await prisma.despesaMensal.count();
  console.log("Current DB counts:", {
    produtos: pCount,
    lancamentos: lCount,
    baixas: bCount,
    despesas: dCount,
  });

  // Limpa lançamentos de vendas diárias, histórico de baixas e despesas de teste
  await prisma.historicoBaixa.deleteMany({});
  await prisma.lancamentoDiario.deleteMany({});
  await prisma.despesaMensal.deleteMany({});
  
  // Limpa produtos de teste (que possuem prefixos de teste como TEST-, CH4-, M3-, etc.)
  const deletedTestProds = await prisma.produtoEstoque.deleteMany({
    where: {
      OR: [
        { codigo: { startsWith: "TEST-" } },
        { codigo: { startsWith: "CH4-" } },
        { codigo: { startsWith: "ADV-" } },
        { codigo: { startsWith: "BENCH-" } },
        { codigo: { startsWith: "M3-" } },
      ],
    },
  });

  console.log("Test products deleted:", deletedTestProds.count);
  console.log("Remaining products:", await prisma.produtoEstoque.count());
  console.log("All test transactions, sales, and expenses successfully cleared!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
