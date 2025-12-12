"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Package, Activity, Clock, FileText, Edit2, Save, XCircle, Trash2, AlertTriangle, AlertOctagon, Info, User } from "lucide-react";
import type { ScheduleItem } from "@/lib/api";
import { api } from "@/lib/api";
import { format, parseISO, isValid, isBefore } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface ScheduleItemModalProps {
  item: ScheduleItem | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ComplianceIssue {
  type: "error" | "warning";
  title: string;
  description: string;
  field?: string;
}

export function ScheduleItemModal({ item, isOpen, onClose }: ScheduleItemModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState<ScheduleItem | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setFormData(item);
    setIsEditing(false);
    setShowDeleteConfirm(false);
  }, [item]);

  // Compliance checking
  const complianceIssues = useMemo(() => {
    if (!item) return [];
    const issues: ComplianceIssue[] = [];

    // Check 1: End Date > Start Date
    if (item.start && item.end && isValid(parseISO(item.start)) && isValid(parseISO(item.end))) {
      if (isBefore(parseISO(item.end), parseISO(item.start))) {
        issues.push({
          type: "error",
          title: "Invalid Date Range",
          description: "End Period is before Start Period. The surveillance period dates are inverted.",
          field: "end",
        });
      }
    }

    // Check 2: Due Date >= End Date
    if (item.end && item.due && isValid(parseISO(item.end)) && isValid(parseISO(item.due))) {
      if (isBefore(parseISO(item.due), parseISO(item.end))) {
        issues.push({
          type: "error",
          title: "Due Date Before Period End",
          description: "The report due date is set before the end of the surveillance period. Reports cannot be due before the period concludes.",
          field: "due",
        });
      }
    }

    // Check 3: Frequency vs Class (EU MDR/UKCA)
    if (item.frequency && item.class) {
      const freq = item.frequency.toLowerCase();
      
      // Class III / IIb -> Annual (Max 1 year)
      if (item.class === "III" || item.class === "IIb") {
        if (freq.includes("2") || freq.includes("3") || freq.includes("5") || freq.includes("biennial")) {
          issues.push({
            type: "error",
            title: "Non-Compliant Frequency",
            description: `Class ${item.class} devices require ANNUAL reporting under EU MDR 2017/745. Current frequency "${item.frequency}" exceeds the 1-year maximum.`,
            field: "frequency",
          });
        }
      }

      // Class IIa -> Biennial (Max 2 years)
      if (item.class === "IIa") {
        if (freq.includes("3") || freq.includes("5")) {
          issues.push({
            type: "warning",
            title: "Frequency May Exceed Limit",
            description: `Class IIa devices require reporting at least every 2 years (biennial) under EU MDR. Current frequency "${item.frequency}" may exceed compliance limits.`,
            field: "frequency",
          });
        }
      }
    }

    // Check 4: Missing critical dates
    if (!item.start && !item.end) {
      issues.push({
        type: "warning",
        title: "Missing Surveillance Period",
        description: "No start or end dates defined for this reporting period. Define the surveillance window to ensure timely report submission.",
        field: "start",
      });
    }

    if (!item.due && item.end) {
      issues.push({
        type: "warning",
        title: "Due Date Not Set",
        description: "Surveillance period is defined but no due date is set. EU MDR requires submission within 60-90 days of period end.",
        field: "due",
      });
    }

    return issues;
  }, [item]);

  if (!item || !formData) return null;

  const handleSave = async () => {
    if (!formData) return;
    try {
      await api.saveSchedule([formData]);
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save:", error);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    try {
      await api.deleteScheduleItem(item.id);
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
      onClose();
    } catch (error) {
      console.error("Failed to delete:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleChange = (field: keyof ScheduleItem, value: string) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === "TBD" || dateStr === "—") return "—";
    try {
      return format(parseISO(dateStr), "MMMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const hasErrors = complianceIssues.some((i) => i.type === "error");
  const hasWarnings = complianceIssues.some((i) => i.type === "warning");

  const fields = [
    { label: "PSUR/PMSR ID", value: formData.id, key: "id", icon: FileText, readOnly: true },
    { label: "Product Name", value: formData.product, key: "product", icon: Package },
    { label: "Device Class", value: formData.class, key: "class", icon: Activity },
    { label: "Type", value: formData.type, key: "type", icon: FileText },
    { label: "Start Period", value: formData.start, key: "start", icon: Calendar, type: "date" },
    { label: "End Period", value: formData.end, key: "end", icon: Calendar, type: "date" },
    { label: "Frequency", value: formData.frequency, key: "frequency", icon: Clock },
    { label: "Due Date", value: formData.due, key: "due", icon: Calendar, type: "date" },
    { label: "Writer", value: formData.writer, key: "writer", icon: User },
    { label: "Status", value: formData.status, key: "status", icon: Activity },
  ];

  const getFieldHasIssue = (fieldKey: string) => {
    return complianceIssues.some((i) => i.field === fieldKey);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className={`bg-background border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col ${
                hasErrors ? "border-red-500/50" : "border-border/40"
              }`}
            >
              {/* Header */}
              <div className={`px-6 py-4 border-b flex items-center justify-between ${
                hasErrors 
                  ? "bg-gradient-to-r from-red-500/10 to-red-500/5 border-red-500/20" 
                  : "bg-gradient-to-r from-primary/5 to-accent/5 border-border/40"
              }`}>
                <div className="flex items-center gap-3">
                  {hasErrors && (
                    <div className="p-2 rounded-lg bg-red-500/20">
                      <AlertOctagon className="w-5 h-5 text-red-500" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{item.id}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.product}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing && !showDeleteConfirm ? (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsEditing(true)}
                        className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Edit Item"
                      >
                        <Edit2 className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowDeleteConfirm(true)}
                        className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </>
                  ) : isEditing ? (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSave}
                        className="p-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors"
                        title="Save Changes"
                      >
                        <Save className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setIsEditing(false);
                          setFormData(item);
                        }}
                        className="p-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                        title="Cancel Edit"
                      >
                        <XCircle className="w-4 h-4" />
                      </motion.button>
                    </>
                  ) : null}
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </motion.button>
                </div>
              </div>

              {/* Delete Confirmation Banner */}
              <AnimatePresence>
                {showDeleteConfirm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 py-4 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <div>
                          <p className="text-sm font-medium text-red-600">Delete this record?</p>
                          <p className="text-xs text-red-500/80">This action cannot be undone.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={isDeleting}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isDeleting ? (
                            <>
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full"
                              />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Content */}
              <div className="p-6 overflow-y-auto flex-1">
                {/* Compliance Issues Card */}
                <AnimatePresence>
                  {complianceIssues.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`mb-6 rounded-xl border overflow-hidden ${
                        hasErrors 
                          ? "bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent border-red-500/30" 
                          : "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30"
                      }`}
                    >
                      {/* Card Header */}
                      <div className={`px-4 py-3 border-b flex items-center gap-3 ${
                        hasErrors ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"
                      }`}>
                        <div className={`p-1.5 rounded-lg ${hasErrors ? "bg-red-500/20" : "bg-amber-500/20"}`}>
                          {hasErrors ? (
                            <AlertOctagon className="w-4 h-4 text-red-500" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${hasErrors ? "text-red-600" : "text-amber-600"}`}>
                            {hasErrors ? "Compliance Issues Detected" : "Attention Required"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {complianceIssues.length} issue{complianceIssues.length > 1 ? "s" : ""} found
                          </p>
                        </div>
                      </div>

                      {/* Issues List */}
                      <div className="p-4 space-y-3">
                        {complianceIssues.map((issue, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`p-3 rounded-lg border ${
                              issue.type === "error"
                                ? "bg-red-500/5 border-red-500/20"
                                : "bg-amber-500/5 border-amber-500/20"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 p-1 rounded ${
                                issue.type === "error" ? "bg-red-500/20" : "bg-amber-500/20"
                              }`}>
                                {issue.type === "error" ? (
                                  <X className="w-3 h-3 text-red-500" />
                                ) : (
                                  <Info className="w-3 h-3 text-amber-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${
                                  issue.type === "error" ? "text-red-600" : "text-amber-600"
                                }`}>
                                  {issue.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                  {issue.description}
                                </p>
                                {issue.field && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-2 uppercase tracking-wider">
                                    Affected field: {issue.field}
                                  </p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Regulatory Reference */}
                      <div className={`px-4 py-2 text-[10px] uppercase tracking-wider ${
                        hasErrors ? "text-red-500/60 bg-red-500/5" : "text-amber-500/60 bg-amber-500/5"
                      }`}>
                        Reference: EU MDR 2017/745 Article 86
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Fields Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fields.map((field, i) => {
                    const hasIssue = getFieldHasIssue(field.key);
                    return (
                      <motion.div
                        key={field.label}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-4 rounded-xl border transition-all ${
                          hasIssue
                            ? "bg-red-500/5 border-red-500/30 ring-1 ring-red-500/20"
                            : isEditing
                              ? "bg-background border-border"
                              : "bg-muted/30 border-border/40 hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <field.icon className={`w-4 h-4 ${hasIssue ? "text-red-500" : "text-primary"}`} />
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {field.label}
                          </p>
                          {hasIssue && (
                            <AlertTriangle className="w-3 h-3 text-red-500 ml-auto" />
                          )}
                        </div>
                        
                        {isEditing && !field.readOnly ? (
                          <input
                            type={field.type === "date" ? "date" : "text"}
                            value={field.value}
                            onChange={(e) => handleChange(field.key as keyof ScheduleItem, e.target.value)}
                            className={`w-full bg-background border rounded-md px-3 py-1.5 text-sm focus:ring-2 outline-none ${
                              hasIssue
                                ? "border-red-500/50 focus:ring-red-500/20"
                                : "border-border focus:ring-primary/20"
                            }`}
                          />
                        ) : (
                          <p className={`text-base font-medium ${hasIssue ? "text-red-600" : "text-foreground"}`}>
                            {field.type === "date" && !isEditing ? formatDate(field.value) : (field.value || "—")}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Status Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Current Status
                      </p>
                      <p className="text-lg font-bold text-foreground">{item.status}</p>
                    </div>
                    <span
                      className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                        item.status.toLowerCase().includes("complete")
                          ? "bg-green-100 text-green-700"
                          : item.status.toLowerCase().includes("progress")
                          ? "bg-blue-100 text-blue-700"
                          : item.status.toLowerCase().includes("late")
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.class}
                    </span>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
