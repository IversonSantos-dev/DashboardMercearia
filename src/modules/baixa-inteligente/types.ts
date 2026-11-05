/**
 * Types and Contracts for Intelligent Deduction Engine
 * Module: src/modules/baixa-inteligente/types.ts
 */

export interface StockCandidate {
  id: string;
  codigo: string;
  barras: string | null;
  ncm?: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitarioCentavos: number;
  ativo?: boolean;
}

export interface DeductionItemSuggestion {
  produtoId: string;
  codigo: string;
  barras: string | null;
  discriminacao: string;
  unidade: string;
  quantidadeDebitar: number;
  unitarioCentavos: number;
  totalItemCentavos: number;
}

export type DeductionStrategy =
  | 'EXACT_UNIT'
  | 'EXACT_MULTIPLE'
  | 'EXACT_COMBINATION'
  | 'PROXIMITY_COMBINATION'
  | 'ASSISTED_CATALOG';

export interface DeductionSuggestionResult {
  strategy: DeductionStrategy;
  valorAlvoCentavos: number;
  valorSugeridoCentavos: number;
  deltaCentavos: number;
  itens: DeductionItemSuggestion[];
  alternativasProximidade?: StockCandidate[];
}

export interface DeductionEngineOptions {
  timeoutMs?: number;
  maxCombinationItems?: number;
  maxQuantityMultiplier?: number;
  topAlternativesLimit?: number;
}
