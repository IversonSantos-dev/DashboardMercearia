import { prisma } from '../src/lib/prisma';
import { syncLancamentoDiarioToSupabase } from '../src/lib/supabase-sync';

async function main() {
  const data = '2026-11-05';
  const valorCartaoCentavos = 20940; // R$ 209,40
  const valorDinheiroCentavos = 51280; // R$ 512,80
  const totalDiarioCentavos = valorCartaoCentavos + valorDinheiroCentavos; // R$ 722,20

  console.log('Inserindo lançamento localmente no SQLite...');
  const lancamento = await prisma.lancamentoDiario.create({
    data: {
      data,
      valorCartaoCentavos,
      valorDinheiroCentavos,
      totalDiarioCentavos,
      observacoes: 'Lançamento de fechamento diário',
    },
  });

  console.log('Criado no SQLite com ID:', lancamento.id);

  console.log('Sincronizando com Supabase...');
  await syncLancamentoDiarioToSupabase(lancamento);
  console.log('Sucesso na sincronização!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
