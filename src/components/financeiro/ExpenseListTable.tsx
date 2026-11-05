"use client";

import { useState } from "react";
import { Trash2, Receipt, Calendar, Loader2 } from "lucide-react";

interface ExpenseItem {
  id: string;
  descricao: string;
  categoria: string;
  categoriaLabel: string;
  valorCentavos: number;
  valorBRL: string;
  mesAno: string;
  dataPagamento: string | null;
  criadoEm: string;
}

interface Props {
  despesas: ExpenseItem[];
  onExpenseDeleted: () => void;
}

export function ExpenseListTable({ despesas, onExpenseDeleted }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/despesas?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onExpenseDeleted();
      }
    } catch (err) {
      console.error("Erro ao excluir despesa:", err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">
            Registro de Despesas Mensais
          </h3>
          <p className="text-xs text-slate-500">
            Despesas operacionais, fornecedores, contas e tributos abatidos das vendas.
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-full text-slate-600">
          {despesas.length} {despesas.length === 1 ? "despesa" : "despesas"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-100/50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-6 py-3.5">Descrição</th>
              <th className="px-6 py-3.5">Categoria</th>
              <th className="px-6 py-3.5">Data Pagamento</th>
              <th className="px-6 py-3.5 text-right">Valor</th>
              <th className="px-6 py-3.5 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {despesas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  Nenhuma despesa cadastrada no mês de competência selecionado.
                </td>
              </tr>
            ) : (
              despesas.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-rose-500" />
                    <span>{item.descricao}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      {item.categoriaLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {item.dataPagamento ? (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {item.dataPagamento}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-rose-600">
                    {item.valorBRL}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
                      title="Excluir Despesa"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
