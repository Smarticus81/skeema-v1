"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Upload,
  RefreshCw,
  Calendar,
  BarChart3,
  AlertCircle,
  AlertTriangle,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Trash2,
  CheckSquare,
  Square,
  MinusSquare,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  User,
  Link2,
} from "lucide-react";
import { api, type ScheduleItem } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { ImportDialog } from "@/components/ImportDialog";
import { AIChat } from "@/components/AIChat";
import { Dashboard } from "@/components/Dashboard";
import { ScheduleItemModal } from "@/components/ScheduleItemModal";
import { exportToExcel } from "@/lib/utils";
import { isValid, parseISO, isBefore } from "date-fns";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "I", label: "Class I" },
  { id: "IIa", label: "Class IIa" },
  { id: "IIb", label: "Class IIb" },
  { id: "III", label: "Class III" },
];

const STATUS_COLORS = {
  "Not Started": "bg-gray-100 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Complete: "bg-green-100 text-green-700",
  Overdue: "bg-red-100 text-red-700",
};

type SortField = "id" | "product" | "class" | "type" | "start" | "end" | "frequency" | "due" | "status" | "writer";
type SortDirection = "asc" | "desc" | null;

const GROUP_COLORS = [
  { bg: "bg-emerald-500/5", border: "border-l-emerald-400/60" },
  { bg: "bg-sky-500/5", border: "border-l-sky-400/60" },
  { bg: "bg-violet-500/5", border: "border-l-violet-400/60" },
  { bg: "bg-amber-500/5", border: "border-l-amber-400/60" },
  { bg: "bg-rose-500/5", border: "border-l-rose-400/60" },
  { bg: "bg-teal-500/5", border: "border-l-teal-400/60" },
];

function hashStringToIndex(value: string, mod: number) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

export default function Home() {
  const [filter, setFilter] = useState("all");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [activeView, setActiveView] = useState<"schedule" | "dashboard">("schedule");
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ["schedule"],
    queryFn: api.getSchedule,
  });

  const refreshMutation = useMutation({
    mutationFn: api.getSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-3 h-3 opacity-30 group-hover:opacity-60 transition-opacity" />;
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="w-3 h-3 text-primary" />;
    }
    return <ChevronDown className="w-3 h-3 text-primary" />;
  };

  const filteredItems = useMemo(() => {
    let result = items;

    if (filter !== "all") {
      result = result.filter((item) => item.class === filter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.id.toLowerCase().includes(query) ||
          item.product.toLowerCase().includes(query) ||
          item.type?.toLowerCase().includes(query) ||
          item.status?.toLowerCase().includes(query) ||
          item.writer?.toLowerCase().includes(query) ||
          item.combined_psur?.toLowerCase().includes(query) ||
          item.notes?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [items, filter, searchQuery]);

  const groupedDisplayRows = useMemo(() => {
    type Group = { groupKey: string; combinedKey: string | null; items: ScheduleItem[] };

    const groups: Group[] = [];
    const groupIndexByKey = new Map<string, number>();

    // Build groups in the filtered order (stable), but keep grouped items together.
    for (const item of filteredItems) {
      const combinedKey = (item.combined_psur || "").trim();
      const groupKey = combinedKey ? `g:${combinedKey}` : `s:${item.id}`;

      const existingIdx = groupIndexByKey.get(groupKey);
      if (existingIdx === undefined) {
        groupIndexByKey.set(groupKey, groups.length);
        groups.push({ groupKey, combinedKey: combinedKey || null, items: [item] });
      } else {
        groups[existingIdx].items.push(item);
      }
    }

    // Lock internal order for grouped rows (not sorted independently).
    for (const g of groups) {
      if (g.items.length > 1) {
        g.items.sort((a, b) => a.id.localeCompare(b.id));
      }
    }

    const isDateField = (f: SortField) => f === "start" || f === "end" || f === "due";
    const dir = sortDirection;

    const groupSortValue = (g: Group) => {
      if (!sortField || !dir) return null;
      if (isDateField(sortField)) {
        const times = g.items
          .map((it) => (it[sortField] ? new Date(it[sortField]).getTime() : 0))
          .filter((t) => Number.isFinite(t) && t > 0);
        if (!times.length) return 0;
        return dir === "asc" ? Math.min(...times) : Math.max(...times);
      }

      const vals = g.items
        .map((it) => String((it as any)[sortField] || "").toLowerCase())
        .filter((v) => v.length > 0);
      if (!vals.length) return "";
      return dir === "asc" ? vals.sort()[0] : vals.sort()[vals.length - 1];
    };

    if (sortField && dir) {
      groups.sort((a, b) => {
        const av = groupSortValue(a);
        const bv = groupSortValue(b);

        if (typeof av === "number" && typeof bv === "number") {
          if (av !== bv) return dir === "asc" ? av - bv : bv - av;
        } else {
          const as = String(av);
          const bs = String(bv);
          if (as < bs) return dir === "asc" ? -1 : 1;
          if (as > bs) return dir === "asc" ? 1 : -1;
        }
        return a.groupKey.localeCompare(b.groupKey);
      });
    }

    const rows = groups.flatMap((g) => {
      const isGrouped = !!g.combinedKey && g.items.length > 1;
      const colorIdx = isGrouped ? hashStringToIndex(g.combinedKey!, GROUP_COLORS.length) : -1;
      const color = isGrouped ? GROUP_COLORS[colorIdx] : null;
      return g.items.map((item, idx) => ({
        item,
        isGrouped,
        combinedKey: g.combinedKey,
        groupSize: g.items.length,
        isFirstInGroup: idx === 0,
        isLastInGroup: idx === g.items.length - 1,
        color,
      }));
    });

    return rows;
  }, [filteredItems, sortField, sortDirection]);

  const checkCompliance = (item: ScheduleItem) => {
    try {
      if (item.start && item.end && isValid(parseISO(item.start)) && isValid(parseISO(item.end))) {
        if (isBefore(parseISO(item.end), parseISO(item.start))) return false;
      }
      if (item.end && item.due && isValid(parseISO(item.end)) && isValid(parseISO(item.due))) {
        if (isBefore(parseISO(item.due), parseISO(item.end))) return false;
      }
      if (item.frequency && item.class) {
        const freq = item.frequency.toLowerCase();
        if (item.class === 'III' || item.class === 'IIb') {
          if (freq.includes('2') || freq.includes('3') || freq.includes('5') || freq.includes('biennial')) return false;
        }
        if (item.class === 'IIa') {
          if (freq.includes('3') || freq.includes('5')) return false;
        }
      }
      return true;
    } catch {
      return true;
    }
  };

  const handleExport = () => {
    exportToExcel(items, "skej_schedule");
  };

  const toggleSelectItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((item) => item.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      await api.deleteScheduleItems(Array.from(selectedIds));
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete items:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const selectionState = 
    selectedIds.size === 0 
      ? "none" 
      : selectedIds.size === filteredItems.length 
        ? "all" 
        : "partial";

  const SortableHeader = ({ field, label, width }: { field: SortField; label: string; width: string }) => (
    <th
      className={`${width} px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer group select-none hover:bg-muted/40 transition-colors`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {getSortIcon(field)}
      </div>
    </th>
  );

  return (
    <div className="h-screen bg-gradient-to-br from-background via-muted/20 to-accent/10 flex overflow-hidden">
      {/* Main Content */}
      <motion.div 
        className="flex-1 flex flex-col overflow-hidden"
        animate={{ 
          marginRight: isChatOpen ? 0 : 0 
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* Header */}
        <header className="border-b border-border/40 bg-background/95 backdrop-blur-2xl flex-shrink-0 z-40">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between gap-8">
              {/* Left: Logo + View Tabs */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <Logo size="large" />
                  <div className="h-8 w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />
                  <h1 className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-[0.2em]">
                    Report Manager
                  </h1>
                </div>

                <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/40">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveView("schedule")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      activeView === "schedule"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Schedule
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveView("dashboard")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      activeView === "dashboard"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Dashboard
                  </motion.button>
                </div>
              </div>

              {/* Right: Class Filters + Action Buttons */}
              <div className="flex items-center gap-4">
                {activeView === "schedule" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/40"
                  >
                    {FILTERS.map((f) => (
                      <motion.button
                        key={f.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setFilter(f.id)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                          filter === f.id
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {f.label}
                      </motion.button>
                    ))}
                  </motion.div>
                )}

                <div className="flex items-center gap-1.5 bg-muted/30 p-1.5 rounded-xl border border-border/40">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                    className="group p-2.5 rounded-lg hover:bg-background transition-all disabled:opacity-50 relative"
                    title="Reload data"
                  >
                    <RefreshCw
                      className={`w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors ${refreshMutation.isPending ? "animate-spin" : ""}`}
                    />
                  </motion.button>

                  <div className="h-6 w-px bg-border/40" />

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleExport}
                    className="group p-2.5 rounded-lg hover:bg-background transition-all"
                    title="Export to Excel"
                  >
                    <Download className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsImportOpen(true)}
                    className="group p-2.5 rounded-lg bg-primary/10 hover:bg-primary transition-all"
                    title="Import Excel"
                  >
                    <Upload className="w-4 h-4 text-primary group-hover:text-primary-foreground transition-colors" />
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden px-6 py-6">
          <AnimatePresence mode="wait">
            {activeView === "dashboard" ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="h-full bg-background/60 backdrop-blur-sm border border-border/40 rounded-xl overflow-hidden shadow-xl flex flex-col"
              >
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                  <Dashboard items={items} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="schedule"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="h-full bg-background/60 backdrop-blur-sm border border-border/40 rounded-xl overflow-hidden shadow-xl flex flex-col"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : isError ? (
                  <div className="flex items-center justify-center h-full text-red-500">
                    <AlertCircle className="w-8 h-8 mr-2" />
                    Failed to load data
                  </div>
                ) : (
                  <>
                    <div className="overflow-auto flex-1">
                      <table className="w-full table-fixed">
                        <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
                          <tr className="border-b border-border/40">
                            <th className="w-[36px] px-2 py-3">
                              <button
                                onClick={toggleSelectAll}
                                className="p-1 rounded hover:bg-muted/50 transition-colors"
                              >
                                {selectionState === "all" ? (
                                  <CheckSquare className="w-4 h-4 text-primary" />
                                ) : selectionState === "partial" ? (
                                  <MinusSquare className="w-4 h-4 text-primary" />
                                ) : (
                                  <Square className="w-4 h-4 text-muted-foreground" />
                                )}
                              </button>
                            </th>
                            <SortableHeader field="id" label="ID" width="w-[90px]" />
                            <SortableHeader field="product" label="Product" width="w-[160px]" />
                            <SortableHeader field="class" label="Class" width="w-[60px]" />
                            <SortableHeader field="type" label="Type" width="w-[90px]" />
                            <SortableHeader field="start" label="Start" width="w-[85px]" />
                            <SortableHeader field="end" label="End" width="w-[85px]" />
                            <SortableHeader field="frequency" label="Freq" width="w-[70px]" />
                            <SortableHeader field="due" label="Due" width="w-[85px]" />
                            <SortableHeader field="writer" label="Writer" width="w-[100px]" />
                            <SortableHeader field="status" label="Status" width="w-[90px]" />
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence mode="popLayout">
                            {groupedDisplayRows.map((row, i) => {
                              const item = row.item;
                              const isCompliant = checkCompliance(item);
                              const isSelected = selectedIds.has(item.id);
                              const groupAccent = row.isGrouped && row.color ? `${row.color.border} ${row.color.bg}` : "";
                              const groupDivider = row.isGrouped && row.isLastInGroup ? "border-b-2 border-border/30" : "";
                              return (
                                <motion.tr
                                  key={item.id}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ delay: Math.min(i * 0.01, 0.3) }}
                                  onClick={() => setSelectedItem(item)}
                                  className={`border-b transition-all cursor-pointer group border-l-4 ${groupDivider} ${
                                    isSelected
                                      ? "bg-primary/10 border-primary/30"
                                      : isCompliant
                                        ? "border-border/20 hover:bg-muted/40"
                                        : "border-red-500/50 bg-red-500/5 hover:bg-red-500/10 animate-pulse"
                                  } ${groupAccent}`}
                                >
                                  <td className="px-2 py-2">
                                    <button
                                      onClick={(e) => toggleSelectItem(item.id, e)}
                                      className="p-1 rounded hover:bg-muted/50 transition-colors"
                                    >
                                      {isSelected ? (
                                        <CheckSquare className="w-4 h-4 text-primary" />
                                      ) : (
                                        <Square className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                                      )}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-xs font-medium text-foreground truncate">
                                    <div className="flex items-center gap-1.5">
                                      {row.isGrouped && row.combinedKey && row.isFirstInGroup && (
                                        <span
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-foreground/5 text-muted-foreground border border-border/40"
                                          title={`Linked group: ${row.combinedKey} (${row.groupSize} records)`}
                                        >
                                          <Link2 className="w-3 h-3" />
                                          {row.combinedKey}
                                        </span>
                                      )}
                                      {item.id}
                                      {!isCompliant && (
                                        <AlertTriangle className="w-3 h-3 text-red-500 animate-bounce flex-shrink-0" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-foreground truncate" title={item.product}>
                                    {item.product}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                                      {item.class}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground truncate" title={item.type}>
                                    {item.type}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                                    {item.start || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                                    {item.end || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                                    {item.frequency}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                                    {item.due || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground truncate" title={item.writer}>
                                    {item.writer ? (
                                      <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {item.writer}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground/50">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                        STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] ||
                                        STATUS_COLORS["Not Started"]
                                      }`}
                                    >
                                      {item.status}
                                    </span>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </tbody>
                      </table>

                      {filteredItems.length === 0 && (
                        <div className="flex items-center justify-center h-32 text-muted-foreground">
                          No items found
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-border/40 bg-muted/20 flex-shrink-0">
                      <AnimatePresence mode="wait">
                        {showDeleteConfirm ? (
                          <motion.div
                            key="delete-confirm"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-2 text-red-500">
                              <AlertTriangle className="w-4 h-4" />
                              <span className="text-xs font-medium">
                                Delete {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""}?
                              </span>
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
                                onClick={handleBulkDelete}
                                disabled={isDeleting}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {isDeleting ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
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
                          </motion.div>
                        ) : (
                          <motion.div
                            key="normal"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-2 flex-1 max-w-sm">
                              <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                  type="text"
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  placeholder="Search ID, product, writer..."
                                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-background/80 border border-border/40 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-muted-foreground/60"
                                />
                              </div>
                              {searchQuery && (
                                <button
                                  onClick={() => setSearchQuery("")}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Clear
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {selectedIds.size > 0 && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-primary font-medium">
                                    {selectedIds.size} selected
                                  </span>
                                  <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                  </motion.button>
                                  <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    Clear
                                  </button>
                                </motion.div>
                              )}
                              {sortField && (
                                <span className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md">
                                  Sorted by {sortField}
                                  <button
                                    onClick={() => {
                                      setSortField(null);
                                      setSortDirection(null);
                                    }}
                                    className="ml-1 hover:text-primary/70"
                                  >
                                    x
                                  </button>
                                </span>
                              )}
                              <span>
                                {filteredItems.length} of {items.length} items
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </motion.div>

      {/* AI Chat Panel - Collapsible */}
      <motion.div
        className="h-screen flex-shrink-0 relative"
        animate={{ 
          width: isChatOpen ? 420 : 56,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* Toggle Button */}
        <motion.button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-50 w-6 h-16 bg-background border border-border/40 rounded-full shadow-lg flex items-center justify-center hover:bg-muted transition-colors group"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            animate={{ rotate: isChatOpen ? 0 : 180 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </motion.div>
        </motion.button>

        <div className="h-full p-6 overflow-hidden">
          <AnimatePresence mode="wait">
            {isChatOpen ? (
              <motion.div
                key="chat-open"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <AIChat />
              </motion.div>
            ) : (
              <motion.div
                key="chat-closed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full flex flex-col items-center pt-4"
              >
                <motion.button
                  onClick={() => setIsChatOpen(true)}
                  className="p-3 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors group"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <MessageSquare className="w-5 h-5 text-primary" />
                </motion.button>
                <motion.div
                  className="mt-4 writing-mode-vertical text-xs font-medium text-muted-foreground tracking-wider"
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  AI Assistant
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Import Dialog */}
      <ImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["schedule"] });
        }}
      />

      {/* Schedule Item Detail Modal */}
      <ScheduleItemModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
