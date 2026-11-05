import prisma from "@/lib/prisma";

export interface TestProductData {
  codigo: string;
  barras?: string | null;
  ncm?: string | null;
  discriminacao: string;
  unidade?: string;
  quantidade: number;
  unitarioCentavos: number;
  totalCentavos?: number;
  ativo?: boolean;
}

export interface TestLancamentoData {
  data: string; // YYYY-MM-DD
  valorCartaoCentavos: number;
  valorDinheiroCentavos: number;
  totalDiarioCentavos?: number;
  observacoes?: string;
}

export interface TestDespesaData {
  mesAno: string; // YYYY-MM
  descricao: string;
  categoria: string;
  valorCentavos: number;
  dataPagamento?: string;
}

/**
 * Removes all records created during E2E tests based on specific key prefixes.
 */
export async function cleanTestData(prefix = "E2E-"): Promise<void> {
  // Order of deletion respects foreign key constraints:
  // 1. Delete HistoricoBaixa referencing test products or test lancamentos
  await prisma.historicoBaixa.deleteMany({
    where: {
      OR: [
        { codigoProduto: { startsWith: prefix } },
        { discriminacaoProduto: { contains: "[TEST-E2E]" } },
        { lancamentoDiario: { data: { startsWith: "2099-" } } },
      ],
    },
  });

  // 2. Delete LancamentoDiario
  await prisma.lancamentoDiario.deleteMany({
    where: {
      OR: [
        { data: { startsWith: "2099-" } },
        { observacoes: { contains: "[TEST-E2E]" } },
      ],
    },
  });

  // 3. Delete DespesaMensal
  await prisma.despesaMensal.deleteMany({
    where: {
      OR: [
        { mesAno: { startsWith: "2099-" } },
        { descricao: { contains: "[TEST-E2E]" } },
      ],
    },
  });

  // 4. Delete ProdutoEstoque
  await prisma.produtoEstoque.deleteMany({
    where: {
      OR: [
        { codigo: { startsWith: prefix } },
        { discriminacao: { contains: "[TEST-E2E]" } },
      ],
    },
  });
}

/**
 * Inserts or updates a test product in the database.
 */
export async function seedTestProduct(item: TestProductData) {
  const total = item.totalCentavos ?? item.quantidade * item.unitarioCentavos;
  return prisma.produtoEstoque.upsert({
    where: { codigo: item.codigo },
    create: {
      codigo: item.codigo,
      barras: item.barras ?? null,
      ncm: item.ncm ?? null,
      discriminacao: item.discriminacao,
      unidade: item.unidade ?? "UN",
      quantidade: item.quantidade,
      unitarioCentavos: item.unitarioCentavos,
      totalCentavos: total,
      ativo: item.ativo ?? item.quantidade > 0,
    },
    update: {
      quantidade: item.quantidade,
      unitarioCentavos: item.unitarioCentavos,
      totalCentavos: total,
      ativo: item.ativo ?? item.quantidade > 0,
    },
  });
}

/**
 * Creates a test daily sales entry.
 */
export async function createTestLancamento(data: TestLancamentoData) {
  const total =
    data.totalDiarioCentavos ??
    data.valorCartaoCentavos + data.valorDinheiroCentavos;

  return prisma.lancamentoDiario.create({
    data: {
      data: data.data,
      valorCartaoCentavos: data.valorCartaoCentavos,
      valorDinheiroCentavos: data.valorDinheiroCentavos,
      totalDiarioCentavos: total,
      observacoes: data.observacoes ?? "[TEST-E2E] Lançamento de teste",
    },
  });
}

/**
 * Creates a test monthly expense entry.
 */
export async function createTestDespesa(data: TestDespesaData) {
  return prisma.despesaMensal.create({
    data: {
      mesAno: data.mesAno,
      descricao: data.descricao,
      categoria: data.categoria,
      valorCentavos: data.valorCentavos,
      dataPagamento: data.dataPagamento ?? null,
    },
  });
}

export { prisma };
