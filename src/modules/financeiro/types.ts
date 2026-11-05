// ====================================================================
// Module: financeiro - Types & Constants
// Pure types and constants safe for both client and server imports
// ====================================================================

export interface DailySalesSummary {
  data: string; // YYYY-MM-DD
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalGeralCentavos: number;
  quantidadeLancamentos: number;
}

export interface DetailedDailySalesSummary extends DailySalesSummary {
  totalCartaoBRL: string;
  totalDinheiroBRL: string;
  totalGeralBRL: string;
  percentualCartao: number;
  percentualDinheiro: number;
}

export interface ExpenseCategoryBreakdown {
  categoria: string;
  label: string;
  totalCentavos: number;
  totalBRL: string;
  percentual: number; // 0 a 100%
  quantidade: number;
}

export interface MonthlyConsolidation {
  mesAno: string; // YYYY-MM
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalEntradasCentavos: number;
  totalSaidasCentavos: number;
  saldoLiquidoCentavos: number;
  diasComVendas: number;
}

export interface DetailedMonthlyConsolidation extends MonthlyConsolidation {
  totalCartaoBRL: string;
  totalDinheiroBRL: string;
  totalEntradasBRL: string;
  totalSaidasBRL: string;
  saldoLiquidoBRL: string;
  despesasPorCategoria: ExpenseCategoryBreakdown[];
  margemLiquidaPercentual: number;
  percentualCartao: number;
  percentualDinheiro: number;
  quantidadeDespesas: number;
  quantidadeLancamentos: number;
}

export const CANONICAL_EXPENSE_CATEGORIES = [
  "OPERACIONAL",
  "MERCADORIA",
  "CONTAS_FIXAS",
  "PESSOAL",
  "IMPOSTOS",
  "OUTROS",
] as const;

export type CanonicalExpenseCategory = (typeof CANONICAL_EXPENSE_CATEGORIES)[number];

export const CATEGORIAS_DESPESA_LABELS: Record<string, string> = {
  OPERACIONAL: "Operacional",
  MERCADORIA: "Mercadoria / Fornecedores",
  CONTAS_FIXAS: "Contas Fixas (Água/Luz/Aluguel)",
  PESSOAL: "Pessoal / Salários",
  IMPOSTOS: "Tributos / Impostos",
  OUTROS: "Outras Despesas",
};
