// ====================================================================
// Module: transacoes
// Subsystem: Atomic Transaction Coordinator & Audit Logging Engine
// Features: F17 (Stock Decrement & Deactivation), F18 (Daily Sales Book),
//           F19 (Immutable Audit Trail)
// ====================================================================

import prisma from "@/lib/prisma";
import {
  syncLancamentoDiarioToSupabase,
  syncHistoricoBaixaToSupabase,
  syncProdutoEstoqueToSupabase,
} from "@/lib/supabase-sync";

// --------------------------------------------------------------------
// Type Definitions
// --------------------------------------------------------------------

export type FormaPagamento = "CARTAO" | "DINHEIRO";

export interface DeductionItemInput {
  produtoId: string;
  quantidadeDebitar: number;
}

export interface ExecuteDeductionParams {
  valorAlvoCentavos?: number;
  formaPagamento: FormaPagamento;
  dataLancamento: string; // ISO Date YYYY-MM-DD
  itens: DeductionItemInput[];
  operadorObservacao?: string;
}

export interface ExecuteDeductionResult {
  sucesso: boolean;
  lancamentoDiarioId: string;
  historicoIds: string[];
  totalDebitadoCentavos: number;
}

export interface AuditRecordDetail {
  id: string;
  lancamentoDiarioId: string | null;
  produtoId: string;
  codigoProduto: string;
  discriminacaoProduto: string;
  quantidadeBaixada: number;
  unitarioCentavos: number;
  totalCentavos: number;
  formaPagamento: string;
  dataHora: Date;
}

// --------------------------------------------------------------------
// Custom Domain Error Classes
// --------------------------------------------------------------------

export class DeductionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeductionValidationError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(produtoId: string) {
    super(`Produto não encontrado no estoque: ID "${produtoId}"`);
    this.name = "ProductNotFoundError";
  }
}

export class ProductInactiveError extends Error {
  constructor(codigo: string, discriminacao: string) {
    super(`Produto "${discriminacao}" (${codigo}) está inativo e não pode ser baixado.`);
    this.name = "ProductInactiveError";
  }
}

export class InsufficientStockError extends Error {
  constructor(codigo: string, discriminacao: string, disponivel: number, solicitado: number) {
    super(
      `Saldo de estoque insuficiente para baixa do produto "${discriminacao}" (${codigo}). ` +
      `Disponível: ${disponivel}, Solicitado: ${solicitado}.`
    );
    this.name = "InsufficientStockError";
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(codigo: string, discriminacao: string) {
    super(
      `Conflito de concorrência: o saldo do produto "${discriminacao}" (${codigo}) foi ` +
      `modificado por outra transação simultânea. A operação foi cancelada.`
    );
    this.name = "ConcurrencyConflictError";
  }
}

// --------------------------------------------------------------------
// Primary Function: executeDeductionTransaction
// --------------------------------------------------------------------

/**
 * Executes an atomic stock deduction transaction coordinating:
 * 1. Strict validation of payment method, ISO date, and items array.
 * 2. Atomic stock decrement with zero-balance deactivation (`ativo = false`).
 * 3. Conditional concurrency protection preventing negative stock.
 * 4. Immediate entry in daily sales book (`lancamentos_diarios`).
 * 5. Immutable snapshot creation in audit trail (`historico_baixas`).
 *
 * Full ACID rollback is guaranteed on any step failure.
 */
export async function executeDeductionTransaction(
  params: ExecuteDeductionParams
): Promise<ExecuteDeductionResult> {
  // 1. Validate Input Parameters
  if (!params) {
    throw new DeductionValidationError("Parâmetros de baixa não fornecidos.");
  }

  if (params.formaPagamento !== "CARTAO" && params.formaPagamento !== "DINHEIRO") {
    throw new DeductionValidationError(
      `Forma de pagamento inválida: "${params.formaPagamento}". Permitidos: CARTAO, DINHEIRO.`
    );
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!params.dataLancamento || !isoDateRegex.test(params.dataLancamento)) {
    throw new DeductionValidationError(
      `Data de lançamento inválida: "${params.dataLancamento}". Formato obrigatório: YYYY-MM-DD.`
    );
  }

  if (!Array.isArray(params.itens) || params.itens.length === 0) {
    throw new DeductionValidationError("A lista de itens para baixa não pode ser vazia.");
  }

  for (const item of params.itens) {
    if (!item.produtoId || typeof item.produtoId !== "string" || item.produtoId.trim() === "") {
      throw new DeductionValidationError("ID de produto inválido ou vazio na lista de itens.");
    }
    if (
      typeof item.quantidadeDebitar !== "number" ||
      !Number.isInteger(item.quantidadeDebitar) ||
      item.quantidadeDebitar <= 0
    ) {
      throw new DeductionValidationError(
        `Quantidade a debitar inválida para produto ${item.produtoId}: ${item.quantidadeDebitar}. Deve ser um inteiro positivo.`
      );
    }
  }

  // 2. Pre-aggregate debit quantities by product ID (handles duplicate item entries safely)
  const aggregatedDebitMap = new Map<string, number>();
  for (const item of params.itens) {
    const existing = aggregatedDebitMap.get(item.produtoId) ?? 0;
    aggregatedDebitMap.set(item.produtoId, existing + item.quantidadeDebitar);
  }

  // 3. Execute Interactive Atomic Transaction via Prisma
  const txResult = await prisma.$transaction(
    async (tx) => {
      // --------------------------------------------------------------
      // Step A: Load and Validate All Target Products
      // --------------------------------------------------------------
      const productIds = Array.from(aggregatedDebitMap.keys());
      const products = await tx.produtoEstoque.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Verify all requested products exist
      for (const prodId of productIds) {
        if (!productMap.has(prodId)) {
          throw new ProductNotFoundError(prodId);
        }
      }

      // Verify availability, active state, and stock sufficiency
      for (const [prodId, requiredQty] of aggregatedDebitMap.entries()) {
        const prod = productMap.get(prodId)!;

        if (!prod.ativo || prod.quantidade <= 0) {
          throw new ProductInactiveError(prod.codigo, prod.discriminacao);
        }

        if (prod.quantidade < requiredQty) {
          throw new InsufficientStockError(
            prod.codigo,
            prod.discriminacao,
            prod.quantidade,
            requiredQty
          );
        }
      }

      // --------------------------------------------------------------
      // Step B: Atomic Decrement & Conditional Deactivation
      // --------------------------------------------------------------
      for (const [prodId, requiredQty] of aggregatedDebitMap.entries()) {
        const prod = productMap.get(prodId)!;
        const remainingQty = prod.quantidade - requiredQty;
        const newAtivo = remainingQty > 0;
        const newTotalCentavos = remainingQty * prod.unitarioCentavos;

        // Atomic conditional update: enforces that current stock is >= requiredQty
        const updateResult = await tx.produtoEstoque.updateMany({
          where: {
            id: prodId,
            quantidade: { gte: requiredQty },
            ativo: true,
          },
          data: {
            quantidade: { decrement: requiredQty },
            totalCentavos: newTotalCentavos,
            ativo: newAtivo,
          },
        });

        // If count === 0, stock was modified concurrently during the transaction
        if (updateResult.count === 0) {
          throw new ConcurrencyConflictError(prod.codigo, prod.discriminacao);
        }
      }

      // --------------------------------------------------------------
      // Step C: Calculate Financial Totals
      // --------------------------------------------------------------
      let totalDebitadoCentavos = 0;
      for (const item of params.itens) {
        const prod = productMap.get(item.produtoId)!;
        totalDebitadoCentavos += item.quantidadeDebitar * prod.unitarioCentavos;
      }

      const valorCartaoCentavos =
        params.formaPagamento === "CARTAO" ? totalDebitadoCentavos : 0;
      const valorDinheiroCentavos =
        params.formaPagamento === "DINHEIRO" ? totalDebitadoCentavos : 0;

      // --------------------------------------------------------------
      // Step D: Insert Daily Sales Ledger Entry (lancamentos_diarios)
      // --------------------------------------------------------------
      const defaultObs = `Baixa Frente de Caixa - ${params.formaPagamento}`;
      const lancamento = await tx.lancamentoDiario.create({
        data: {
          data: params.dataLancamento,
          valorCartaoCentavos,
          valorDinheiroCentavos,
          totalDiarioCentavos: totalDebitadoCentavos,
          observacoes: params.operadorObservacao || defaultObs,
        },
      });

      // --------------------------------------------------------------
      // Step E: Insert Immutable Audit Trail Records (historico_baixas)
      // --------------------------------------------------------------
      const historicoIds: string[] = [];

      for (const item of params.itens) {
        const prod = productMap.get(item.produtoId)!;
        const itemTotalCentavos = item.quantidadeDebitar * prod.unitarioCentavos;

        const audit = await tx.historicoBaixa.create({
          data: {
            lancamentoDiarioId: lancamento.id,
            produtoId: prod.id,
            codigoProduto: prod.codigo, // Frozen snapshot
            discriminacaoProduto: prod.discriminacao, // Frozen snapshot
            quantidadeBaixada: item.quantidadeDebitar,
            unitarioCentavos: prod.unitarioCentavos, // Frozen snapshot
            totalCentavos: itemTotalCentavos,
            formaPagamento: params.formaPagamento,
          },
        });

        historicoIds.push(audit.id);
      }

      // --------------------------------------------------------------
      // Step F: Return Successful Transaction Result
      // --------------------------------------------------------------
      return {
        sucesso: true,
        lancamentoDiarioId: lancamento.id,
        historicoIds,
        totalDebitadoCentavos,
      };
    },
    {
      maxWait: 5000, // Aligned with PRAGMA busy_timeout = 5000
      timeout: 10000, // 10s budget for transaction execution
    }
  );

  // ------------------------------------------------------------------
  // Async Dual-Write: Replicate to Supabase Cloud in background
  // If offline or network fails, local transaction is already committed safely.
  // ------------------------------------------------------------------
  (async () => {
    try {
      const lancamento = await prisma.lancamentoDiario.findUnique({
        where: { id: txResult.lancamentoDiarioId },
      });
      if (lancamento) {
        await syncLancamentoDiarioToSupabase(lancamento);
      }

      for (const item of params.itens) {
        const prod = await prisma.produtoEstoque.findUnique({
          where: { id: item.produtoId },
        });
        if (prod) {
          await syncProdutoEstoqueToSupabase(prod);
        }
      }

      const auditRecords = await prisma.historicoBaixa.findMany({
        where: { id: { in: txResult.historicoIds } },
      });
      for (const audit of auditRecords) {
        await syncHistoricoBaixaToSupabase(audit);
      }
    } catch (syncErr) {
      console.error("[Supabase Dual-Write] Falha ao sincronizar baixa com a nuvem:", syncErr);
    }
  })();

  return txResult;
}

// --------------------------------------------------------------------
// Auxiliary Query Helpers for POS & Auditing
// --------------------------------------------------------------------

/**
 * Retrieves the full audit trail associated with a daily sales ledger entry.
 */
export async function getTransactionAuditTrail(
  lancamentoDiarioId: string
): Promise<AuditRecordDetail[]> {
  const records = await prisma.historicoBaixa.findMany({
    where: { lancamentoDiarioId },
    orderBy: { dataHora: "asc" },
  });

  return records.map((r) => ({
    id: r.id,
    lancamentoDiarioId: r.lancamentoDiarioId,
    produtoId: r.produtoId,
    codigoProduto: r.codigoProduto,
    discriminacaoProduto: r.discriminacaoProduto,
    quantidadeBaixada: r.quantidadeBaixada,
    unitarioCentavos: r.unitarioCentavos,
    totalCentavos: r.totalCentavos,
    formaPagamento: r.formaPagamento,
    dataHora: r.dataHora,
  }));
}

/**
 * Retrieves the historical deduction trail for a given product.
 */
export async function getProductAuditHistory(
  produtoId: string,
  limit = 50
): Promise<AuditRecordDetail[]> {
  const records = await prisma.historicoBaixa.findMany({
    where: { produtoId },
    orderBy: { dataHora: "desc" },
    take: limit,
  });

  return records.map((r) => ({
    id: r.id,
    lancamentoDiarioId: r.lancamentoDiarioId,
    produtoId: r.produtoId,
    codigoProduto: r.codigoProduto,
    discriminacaoProduto: r.discriminacaoProduto,
    quantidadeBaixada: r.quantidadeBaixada,
    unitarioCentavos: r.unitarioCentavos,
    totalCentavos: r.totalCentavos,
    formaPagamento: r.formaPagamento,
    dataHora: r.dataHora,
  }));
}
