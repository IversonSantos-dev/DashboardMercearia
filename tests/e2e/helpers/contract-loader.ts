/**
 * Dynamic Contract Loader for Progressive E2E Verification
 * 
 * Safely resolves domain module interfaces defined in PROJECT.md.
 * Allows E2E test suites to run cleanly against both partially implemented
 * milestones (M1) and fully completed application stages (M2, M3, M4, M5).
 */

// 1. Currency Contract (M1 - Active)
export interface CurrencyContract {
  brlToCentavos: (val: string | number) => number;
  centavosToBRL: (centavos: number) => string;
  formatDecimalBRL: (centavos: number) => string;
  addMoney: (a: number, b: number) => number;
  subtractMoney: (a: number, b: number) => number;
  multiplyMoney: (centavos: number, qty: number) => number;
}

// 2. Parser P7 Contract (M2)
export interface P7ProductItem {
  codigo: string;
  barras: string | null;
  ncm: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitarioCentavos: number;
  totalCentavos: number;
}

export interface P7RowIssue {
  rowNumber: number;
  codigo?: string;
  discriminacao?: string;
  reason: string;
  severity: "WARNING" | "ERROR";
  rawContent?: string;
}

export interface P7ParseResult {
  administrativeHeader: {
    razaoSocial?: string;
    cnpj?: string;
    dataInventario?: string;
  };
  headerRowIndex: number;
  items: P7ProductItem[];
  quarantine: P7RowIssue[];
  totalItensValidos: number;
  valorTotalGeralCentavos: number;
}

export interface ParserP7Contract {
  parseModelP7File: (buffer: Buffer, fileName: string) => Promise<P7ParseResult>;
}

// 3. Intelligent Deduction Contract (M3)
export interface StockCandidate {
  id: string;
  codigo: string;
  barras: string | null;
  discriminacao: string;
  unidade: string;
  quantidade: number;
  unitarioCentavos: number;
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

export interface DeductionSuggestionResult {
  strategy:
    | "EXACT_UNIT"
    | "EXACT_MULTIPLE"
    | "EXACT_COMBINATION"
    | "PROXIMITY_COMBINATION"
    | "ASSISTED_CATALOG";
  valorAlvoCentavos: number;
  valorSugeridoCentavos: number;
  deltaCentavos: number;
  itens: DeductionItemSuggestion[];
  alternativasProximidade?: StockCandidate[];
}

export interface BaixaInteligenteContract {
  findDeductionSuggestion: (
    stock: StockCandidate[],
    valorAlvoCentavos: number
  ) => DeductionSuggestionResult;
}

// 4. Atomic Transactions Contract (M3)
export type FormaPagamento = "CARTAO" | "DINHEIRO";

export interface ExecuteDeductionParams {
  valorAlvoCentavos: number;
  formaPagamento: FormaPagamento;
  dataLancamento: string; // ISO Date YYYY-MM-DD
  itens: {
    produtoId: string;
    quantidadeDebitar: number;
  }[];
  operadorObservacao?: string;
}

export interface ExecuteDeductionResult {
  sucesso: boolean;
  lancamentoDiarioId: string;
  historicoIds: string[];
  totalDebitadoCentavos: number;
}

export interface TransacoesContract {
  executeDeductionTransaction: (
    params: ExecuteDeductionParams
  ) => Promise<ExecuteDeductionResult>;
}

// 5. Financial Dashboard Contract (M4)
export interface DailySalesSummary {
  data: string; // YYYY-MM-DD
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalGeralCentavos: number;
  quantidadeLancamentos: number;
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

export interface FinanceiroContract {
  getDailySales: (data: string) => Promise<DailySalesSummary>;
  getDailySalesRange: (
    startDate: string,
    endDate: string
  ) => Promise<DailySalesSummary[]>;
  getMonthlyConsolidation: (mesAno: string) => Promise<MonthlyConsolidation>;
}

/**
 * Dynamic module loaders with error-safe detection.
 */

export async function loadCurrency(): Promise<CurrencyContract | null> {
  try {
    const mod = await import("@/modules/currency");
    return mod as unknown as CurrencyContract;
  } catch {
    return null;
  }
}

export async function loadParserP7(): Promise<ParserP7Contract | null> {
  try {
    const mod = await import("@/modules/parser-p7");
    return mod as unknown as ParserP7Contract;
  } catch {
    return null;
  }
}

export async function loadBaixaInteligente(): Promise<BaixaInteligenteContract | null> {
  try {
    // @ts-ignore - dynamic progressive loading before M3 implementation
    const mod = await import("@/modules/baixa-inteligente");
    return mod as unknown as BaixaInteligenteContract;
  } catch {
    return null;
  }
}

export async function loadTransacoes(): Promise<TransacoesContract | null> {
  try {
    // @ts-ignore - dynamic progressive loading before M3 implementation
    const mod = await import("@/modules/transacoes");
    return mod as unknown as TransacoesContract;
  } catch {
    return null;
  }
}

export async function loadFinanceiro(): Promise<FinanceiroContract | null> {
  try {
    // @ts-ignore - dynamic progressive loading before M4 implementation
    const mod = await import("@/modules/financeiro");
    return mod as unknown as FinanceiroContract;
  } catch {
    return null;
  }
}
