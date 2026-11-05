"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { FileUploader } from "@/components/inventario/FileUploader";
import { DryRunPreview, DryRunData } from "@/components/inventario/DryRunPreview";
import { StockTable } from "@/components/inventario/StockTable";

export default function InventarioPage() {
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [dryRunData, setDryRunData] = useState<DryRunData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitSuccessMessage, setCommitSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 1. Operator selects file -> Execute Dry Run
  const handleFileSelect = async (file: File) => {
    setActiveFile(file);
    setCommitSuccessMessage(null);
    setErrorMessage(null);
    setIsLoadingPreview(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/inventario/import?dryRun=true", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao processar prévia do arquivo P7");
      }

      setDryRunData(data);
    } catch (err: any) {
      setErrorMessage(err.message || "Falha na comunicação com o servidor.");
      setDryRunData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // 2. Operator confirms commit -> Execute Real Batch Ingestion
  const handleConfirmImport = async () => {
    if (!activeFile) return;

    setIsCommitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", activeFile);

      const res = await fetch("/api/inventario/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao importar dados no banco.");
      }

      const { novosCadastrados, atualizados } = data.summary;
      setCommitSuccessMessage(
        `Importação finalizada com sucesso! ${novosCadastrados} novos itens cadastrados e ${atualizados} itens atualizados no estoque.`
      );

      // Reset upload workflow and trigger live stock refresh
      setDryRunData(null);
      setActiveFile(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao persistir importação no banco.");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCancelPreview = () => {
    setDryRunData(null);
    setActiveFile(null);
    setErrorMessage(null);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/" className="hover:text-emerald-600 flex items-center gap-1 transition">
              <ArrowLeft className="w-4 h-4" /> Início
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Inventário Modelo P7</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            <Package className="w-8 h-8 text-emerald-600" />
            Gestão de Estoque &amp; Inventário Modelo P7
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Importação automatizada de planilhas (.xlsx, .csv), auditoria de integridade e catálogo em tempo real.
          </p>
        </div>
      </div>

      {/* Global Notifications */}
      {commitSuccessMessage && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{commitSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setCommitSuccessMessage(null)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline"
          >
            Fechar
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold text-rose-700 hover:text-rose-900 underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Section 1: Ingestion Workflow (File Uploader or Dry Run Preview) */}
      <section className="space-y-4">
        {!dryRunData ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Importar Nova Planilha de Inventário</h2>
            <p className="text-sm text-slate-500 mb-4">
              Envie o arquivo exportado da contabilidade. O sistema processará em modo prévio (Dry Run) para
              sua conferência antes de gravar qualquer alteração.
            </p>
            <FileUploader
              onFileSelect={handleFileSelect}
              isLoading={isLoadingPreview}
            />
          </div>
        ) : (
          <DryRunPreview
            data={dryRunData}
            onConfirm={handleConfirmImport}
            onCancel={handleCancelPreview}
            isCommitting={isCommitting}
          />
        )}
      </section>

      {/* Section 2: Live Stock Catalog Table */}
      <section>
        <StockTable refreshTrigger={refreshTrigger} />
      </section>
    </main>
  );
}
