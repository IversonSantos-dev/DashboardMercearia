"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, X, AlertCircle, Loader2 } from "lucide-react";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export function FileUploader({ onFileSelect, isLoading, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndHandleFile = (file: File) => {
    setClientError(null);

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setClientError(`Formato inválido (${ext}). Por favor, envie um arquivo .xlsx, .xls ou .csv.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setClientError(`O arquivo excede o limite máximo permitido de 15MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
      return;
    }

    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled || isLoading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isLoading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndHandleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndHandleFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setClientError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={disabled || isLoading}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && !disabled && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
          isDragging
            ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
            : "border-slate-300 hover:border-emerald-400 bg-white hover:bg-slate-50/50"
        } ${disabled || isLoading ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {isLoading ? (
          <div className="flex flex-col items-center py-4">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-700">Lendo e validando estrutura do Modelo P7...</p>
            <p className="text-xs text-slate-500 mt-1">Calculando estimativa de novos produtos e quarentena</p>
          </div>
        ) : selectedFile ? (
          <div className="flex items-center justify-between w-full max-w-md p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-3 truncate">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="truncate text-left">
                <p className="text-sm font-semibold text-slate-800 truncate">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="p-3 mb-3 rounded-full bg-emerald-50 text-emerald-600">
              <UploadCloud className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Arraste a planilha do Inventário Modelo P7 aqui ou{" "}
              <span className="text-emerald-600 underline">clique para selecionar</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Suporta formatos <strong>.xlsx</strong>, <strong>.xls</strong> e <strong>.csv</strong> (até 15MB)
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Ignora preâmbulo administrativo automaticamente (Razão Social, CNPJ, Data)
            </p>
          </div>
        )}
      </div>

      {clientError && (
        <div className="flex items-center gap-2 p-3 mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{clientError}</span>
        </div>
      )}
    </div>
  );
}
