import { supabase } from '@/lib/supabase';

/**
 * Utilitário de sincronização redundante (Nuvem Supabase + SQLite Local).
 * Qualquer lançamento é gravado localmente primeiro (garantindo que o sistema NUNCA trave
 * mesmo sem internet) e replicado em background para o Supabase online.
 */

export async function syncLancamentoDiarioToSupabase(lancamento: {
  id: string;
  data: string;
  valorCartaoCentavos: number;
  valorDinheiroCentavos: number;
  totalDiarioCentavos: number;
  observacoes?: string | null;
  criadoEm?: Date | string;
}) {
  if (!supabase) return;
  try {
    await supabase.from('lancamentos_diarios').upsert({
      id: lancamento.id,
      data: lancamento.data,
      valor_cartao_centavos: lancamento.valorCartaoCentavos,
      valor_dinheiro_centavos: lancamento.valorDinheiroCentavos,
      total_diario_centavos: lancamento.totalDiarioCentavos,
      observacoes: lancamento.observacoes,
      criado_em: lancamento.criadoEm ? new Date(lancamento.criadoEm).toISOString() : new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Supabase Sync] Falha ao sincronizar lancamento_diario:', err);
  }
}

export async function syncProdutoEstoqueToSupabase(produto: {
  id: string;
  codigo: string;
  barras?: string | null;
  ncm?: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitarioCentavos: number;
  totalCentavos: number;
  ativo: boolean;
  criadoEm?: Date | string;
  atualizadoEm?: Date | string;
}) {
  if (!supabase) return;
  try {
    await supabase.from('produtos_estoque').upsert({
      id: produto.id,
      codigo: produto.codigo,
      barras: produto.barras,
      ncm: produto.ncm,
      discriminacao: produto.discriminacao,
      unidade: produto.unidade,
      quantidade: produto.quantidade,
      unitario_centavos: produto.unitarioCentavos,
      total_centavos: produto.totalCentavos,
      ativo: produto.ativo,
      criado_em: produto.criadoEm ? new Date(produto.criadoEm).toISOString() : new Date().toISOString(),
      atualizado_em: produto.atualizadoEm ? new Date(produto.atualizadoEm).toISOString() : new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Supabase Sync] Falha ao sincronizar produto_estoque:', err);
  }
}

export async function syncHistoricoBaixaToSupabase(baixa: {
  id: string;
  lancamentoDiarioId?: string | null;
  produtoId: string;
  codigoProduto: string;
  discriminacaoProduto: string;
  quantidadeBaixada: number;
  unitarioCentavos: number;
  totalCentavos: number;
  formaPagamento: string;
  dataHora?: Date | string;
}) {
  if (!supabase) return;
  try {
    await supabase.from('historico_baixas').upsert({
      id: baixa.id,
      lancamento_diario_id: baixa.lancamentoDiarioId,
      produto_id: baixa.produtoId,
      codigo_produto: baixa.codigoProduto,
      discriminacao_produto: baixa.discriminacaoProduto,
      quantidade_baixada: baixa.quantidadeBaixada,
      unitario_centavos: baixa.unitarioCentavos,
      total_centavos: baixa.totalCentavos,
      forma_pagamento: baixa.formaPagamento,
      data_hora: baixa.dataHora ? new Date(baixa.dataHora).toISOString() : new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Supabase Sync] Falha ao sincronizar historico_baixa:', err);
  }
}

export async function syncNotaFiscalToSupabase(nota: {
  id: string;
  mesAno: string;
  valorCentavos: number;
  observacoes?: string | null;
  criadoEm?: Date | string;
  atualizadoEm?: Date | string;
}) {
  if (!supabase) return;
  try {
    await supabase.from('notas_fiscais_mensais').upsert({
      id: nota.id,
      mes_ano: nota.mesAno,
      valor_centavos: nota.valorCentavos,
      observacoes: nota.observacoes,
      criado_em: nota.criadoEm ? new Date(nota.criadoEm).toISOString() : new Date().toISOString(),
      atualizado_em: nota.atualizadoEm ? new Date(nota.atualizadoEm).toISOString() : new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Supabase Sync] Falha ao sincronizar nota_fiscal:', err);
  }
}

export async function syncDespesaToSupabase(despesa: {
  id: string;
  mesAno: string;
  descricao: string;
  categoria: string;
  valorCentavos: number;
  dataPagamento?: string | null;
  criadoEm?: Date | string;
}) {
  if (!supabase) return;
  try {
    await supabase.from('despesas_mensais').upsert({
      id: despesa.id,
      mes_ano: despesa.mesAno,
      descricao: despesa.descricao,
      categoria: despesa.categoria,
      valor_centavos: despesa.valorCentavos,
      data_pagamento: despesa.dataPagamento,
      criado_em: despesa.criadoEm ? new Date(despesa.criadoEm).toISOString() : new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Supabase Sync] Falha ao sincronizar despesa:', err);
  }
}

export async function deleteDespesaFromSupabase(id: string) {
  if (!supabase) return;
  try {
    await supabase.from('despesas_mensais').delete().eq('id', id);
  } catch (err) {
    console.error('[Supabase Sync] Falha ao deletar despesa no Supabase:', err);
  }
}
