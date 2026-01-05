"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { api, type ScheduleItem } from "@/lib/api";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export function ImportDialog({ isOpen, onClose, onImportSuccess }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setImportResult(null);
      setError(null);
    }
  };

  const convertExcelDate = (value: any): string => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") {
      // Excel serial date number - convert to YYYY-MM-DD
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        const year = date.y;
        const month = String(date.m).padStart(2, "0");
        const day = String(date.d).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }
    return "";
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setError(null);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, dateNF: 'yyyy-mm-dd' });

      console.log("Parsed Excel data:", jsonData.slice(0, 2));

      // Map Excel columns to ScheduleItem format
      const items: ScheduleItem[] = jsonData.map((row: any) => ({
        id: row["PSUR/PMSR ID"] || row["ID"] || "",
        product: row["Product Name"] || row["Product"] || "",
        class: row["Class"] || "",
        type: row["Type"] || "",
        start: convertExcelDate(row["Start Period"] || row["Start"]),
        end: convertExcelDate(row["End Period"] || row["End"]),
        frequency: row["Frequency"] || "",
        due: convertExcelDate(row["Due Date"] || row["Due"]),
        status: row["Status"] || "Not Started",
        writer: row["Writer"] || row["Owner"] || row["Author"] || "",
        notes: row["Notes"] || row["Note"] || "",
        combined_psur: row["Combined PSUR"] || row["Combined"] || row["Group"] || row["Combined PSUR ID"] || "",
      }));

      console.log("Mapped items with dates:", items.slice(0, 2));

      await api.saveSchedule(items);
      
      setImportResult({ success: items.length, failed: 0 });
      setTimeout(() => {
        onImportSuccess();
        onClose();
        setFile(null);
        setImportResult(null);
      }, 2000);
    } catch (err: any) {
      console.error("Import error:", err);
      setError(err.message || "Failed to import file. Please check the format.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background rounded-2xl shadow-2xl border border-border z-50 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Import Excel File</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!file ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-8 border-2 border-dashed border-border hover:border-primary rounded-xl transition-colors flex flex-col items-center gap-3 hover:bg-accent/5"
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium text-foreground">Click to upload</p>
                    <p className="text-sm text-muted-foreground">Excel files (.xlsx, .xls)</p>
                  </div>
                </button>
              ) : (
                <div className="p-4 border border-border rounded-xl flex items-center gap-3">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-900 text-sm">Import Failed</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </motion.div>
              )}

              {importResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3"
                >
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">
                      Successfully imported {importResult.success} items
                    </p>
                  </div>
                </motion.div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!file || isImporting}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
