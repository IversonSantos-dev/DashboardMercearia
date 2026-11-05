export type FormaPagamento = "CARTAO" | "DINHEIRO";

export interface ItemBaixaUI {
  produtoId: string;
  codigo: string;
  barras: string | null;
  discriminacao: string;
  unidade: string;
  quantidadeDisponivel: number;
  quantidadeDebitar: number;
  unitarioCentavos: number;
  unitarioBRL: string;
  totalItemCentavos: number;
  totalItemBRL: string;
}

export interface AlternativaCatalogoUI {
  produtoId: string;
  codigo: string;
  barras: string | null;
  discriminacao: string;
  unidade: string;
  quantidadeDisponivel: number;
  unitarioCentavos: number;
  unitarioBRL: string;
  deltaCentavos: number;
}

export interface SugestaoResponseUI {
  estrategia:
    | "EXACT_UNIT"
    | "EXACT_MULTIPLE"
    | "EXACT_COMBINATION"
    | "PROXIMITY_COMBINATION"
    | "ASSISTED_CATALOG"
    | "SEM_ESTOQUE";
  valorAlvoCentavos: number;
  valorAlvoBRL: string;
  valorSugeridoCentavos: number;
  valorSugeridoBRL: string;
  deltaCentavos: number;
  deltaBRL: string;
  itens: ItemBaixaUI[];
}

export interface ExecucaoDetalheItemUI {
  produtoId: string;
  codigo: string;
  discriminacao: string;
  quantidadeDebitada: number;
  quantidadeRestante: number;
  unitarioCentavos: number;
  totalItemCentavos: number;
  ativo: boolean;
}

export interface ExecucaoReceiptUI {
  lancamentoId: string;
  totalDebitadoCentavos: number;
  totalDebitadoBRL: string;
  formaPagamento: FormaPagamento;
  dataLancamento: string;
  itensBaixados: number;
  historicoIds: string[];
  detalhesItens: ExecucaoDetalheItemUI[];
}
