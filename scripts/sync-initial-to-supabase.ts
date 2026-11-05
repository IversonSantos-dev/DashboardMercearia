import { prisma } from '../src/lib/prisma';
import { supabase } from '../src/lib/supabase';

async function migrateAllToSupabase() {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Check .env variables.');
  }

  console.log('🔄 Iniciando carga inicial do banco local para o Supabase...');

  // 1. Produtos Estoque
  const produtos = await prisma.produtoEstoque.findMany();
  console.log(`📦 Sincronizando ${produtos.length} produtos de estoque...`);
  const prodBatches = [];
  const batchSize = 100;
  for (let i = 0; i < produtos.length; i += batchSize) {
    const chunk = produtos.slice(i, i + batchSize).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      barras: p.barras,
      ncm: p.ncm,
      discriminacao: p.discriminacao,
      unidade: p.unidade,
      quantidade: p.quantidade,
      unitario_centavos: p.unitarioCentavos,
      total_centavos: p.totalCentavos,
      ativo: p.ativo,
      criado_em: p.criadoEm.toISOString(),
      atualizado_em: p.atualizadoEm.toISOString(),
    }));
    prodBatches.push(chunk);
  }
  for (const chunk of prodBatches) {
    const { error } = await supabase.from('produtos_estoque').upsert(chunk);
    if (error) console.error('Erro ao subir lote de produtos:', error);
  }
  console.log('✅ Produtos sincronizados!');

  // 2. Lancamentos Diarios
  const lancamentos = await prisma.lancamentoDiario.findMany();
  console.log(`📅 Sincronizando ${lancamentos.length} lançamentos diários...`);
  for (let i = 0; i < lancamentos.length; i += batchSize) {
    const chunk = lancamentos.slice(i, i + batchSize).map((l) => ({
      id: l.id,
      data: l.data,
      valor_cartao_centavos: l.valorCartaoCentavos,
      valor_dinheiro_centavos: l.valorDinheiroCentavos,
      total_diario_centavos: l.totalDiarioCentavos,
      observacoes: l.observacoes,
      criado_em: l.criadoEm.toISOString(),
    }));
    const { error } = await supabase.from('lancamentos_diarios').upsert(chunk);
    if (error) console.error('Erro ao subir lote de lançamentos:', error);
  }
  console.log('✅ Lançamentos sincronizados!');

  // 3. Notas Fiscais Mensais
  const notas = await prisma.notaFiscalMensal.findMany();
  console.log(`📑 Sincronizando ${notas.length} notas fiscais mensais...`);
  if (notas.length > 0) {
    const chunk = notas.map((n) => ({
      id: n.id,
      mes_ano: n.mesAno,
      valor_centavos: n.valorCentavos,
      observacoes: n.observacoes,
      criado_em: n.criadoEm.toISOString(),
      atualizado_em: n.atualizadoEm.toISOString(),
    }));
    const { error } = await supabase.from('notas_fiscais_mensais').upsert(chunk);
    if (error) console.error('Erro ao subir notas fiscais:', error);
  }
  console.log('✅ Notas fiscais sincronizadas!');

  // 4. Despesas Mensais
  const despesas = await prisma.despesaMensal.findMany();
  if (despesas.length > 0) {
    console.log(`💸 Sincronizando ${despesas.length} despesas mensais...`);
    const chunk = despesas.map((d) => ({
      id: d.id,
      mes_ano: d.mesAno,
      descricao: d.descricao,
      categoria: d.categoria,
      valor_centavos: d.valorCentavos,
      data_pagamento: d.dataPagamento,
      criado_em: d.criadoEm.toISOString(),
    }));
    const { error } = await supabase.from('despesas_mensais').upsert(chunk);
    if (error) console.error('Erro ao subir despesas:', error);
  }

  // 5. Historico Baixas
  const baixas = await prisma.historicoBaixa.findMany();
  if (baixas.length > 0) {
    console.log(`📉 Sincronizando ${baixas.length} registros de histórico de baixas...`);
    for (let i = 0; i < baixas.length; i += batchSize) {
      const chunk = baixas.slice(i, i + batchSize).map((b) => ({
        id: b.id,
        lancamento_diario_id: b.lancamentoDiarioId,
        produto_id: b.produtoId,
        codigo_produto: b.codigoProduto,
        discriminacao_produto: b.discriminacaoProduto,
        quantidade_baixada: b.quantidadeBaixada,
        unitario_centavos: b.unitarioCentavos,
        total_centavos: b.totalCentavos,
        forma_pagamento: b.formaPagamento,
        data_hora: b.dataHora.toISOString(),
      }));
      const { error } = await supabase.from('historico_baixas').upsert(chunk);
      if (error) console.error('Erro ao subir baixas:', error);
    }
  }

  console.log('🎉 Migração concluída com sucesso!');
}

migrateAllToSupabase()
  .catch((e) => {
    console.error('Falha na migração:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
