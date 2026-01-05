"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Package, Clock, AlertTriangle, TrendingUp, Calendar, User } from "lucide-react";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
} from "chart.js";
import { format, parseISO, isAfter, isBefore, endOfQuarter, startOfQuarter, differenceInDays } from "date-fns";
import type { ScheduleItem } from "@/lib/api";

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface DashboardProps {
  items: ScheduleItem[];
}

export function Dashboard({ items }: DashboardProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const quarterEnd = endOfQuarter(now);
    const quarterStart = startOfQuarter(now);

    const dueThisQuarter = items.filter((item) => {
      if (!item.due || item.due === "TBD") return false;
      try {
        const dueDate = parseISO(item.due);
        return isAfter(dueDate, now) && isBefore(dueDate, quarterEnd);
      } catch {
        return false;
      }
    }).length;

    const overdue = items.filter((item) =>
      item.status.toLowerCase().includes("late")
    ).length;

    const complianceRate = items.length > 0 
      ? Math.round(((items.length - overdue) / items.length) * 100)
      : 0;

    return {
      total: items.length,
      dueThisQuarter,
      overdue,
      complianceRate,
    };
  }, [items]);

  const writerStats = useMemo(() => {
    const map = new Map<string, { total: number; overdue: number }>();
    for (const item of items) {
      const w = (item.writer || "").trim() || "Unassigned";
      const entry = map.get(w) || { total: 0, overdue: 0 };
      entry.total += 1;
      if ((item.status || "").toLowerCase().includes("late")) entry.overdue += 1;
      map.set(w, entry);
    }
    const rows = Array.from(map.entries())
      .map(([writer, v]) => ({ writer, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    return rows;
  }, [items]);

  const writerData = useMemo(() => {
    if (!writerStats.length) {
      return {
        labels: ["Unassigned"],
        datasets: [{ label: "Items", data: [0], backgroundColor: "#6b6b6b", borderRadius: 6 }],
      };
    }
    return {
      labels: writerStats.map((r) => r.writer),
      datasets: [
        { label: "Total", data: writerStats.map((r) => r.total), backgroundColor: "#2d5a4a", borderRadius: 6 },
        { label: "Overdue", data: writerStats.map((r) => r.overdue), backgroundColor: "#ef4444", borderRadius: 6 },
      ],
    };
  }, [writerStats]);

  const classData = useMemo(() => {
    const counts = {
      "Class III": items.filter((i) => i.class === "III").length,
      "Class IIb": items.filter((i) => i.class === "IIb").length,
      "Class IIa": items.filter((i) => i.class === "IIa").length,
      "Class I": items.filter((i) => i.class === "I").length,
    };

    return {
      labels: Object.keys(counts).filter((k) => counts[k as keyof typeof counts] > 0),
      datasets: [
        {
          data: Object.values(counts).filter((v) => v > 0),
          backgroundColor: ["#2d5a4a", "#4a6f8a", "#8a6f4a", "#6b6b6b"],
          borderWidth: 0,
        },
      ],
    };
  }, [items]);

  const statusData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    items.forEach((item) => {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    });

    return {
      labels: Object.keys(statusCounts),
      datasets: [
        {
          data: Object.values(statusCounts),
          backgroundColor: "#2d5a4a",
          borderRadius: 6,
        },
      ],
    };
  }, [items]);

  const upcomingItems = useMemo(() => {
    const now = new Date();
    return items
      .filter((item) => item.due && item.due !== "TBD")
      .map((item) => {
        try {
          const dueDate = parseISO(item.due);
          const daysUntil = differenceInDays(dueDate, now);
          return { ...item, daysUntil, dueDate };
        } catch {
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 10);
  }, [items]);

  const agingData = useMemo(() => {
    const now = new Date();
    const aging = {
      "0-30 days": 0,
      "31-60 days": 0,
      "61-90 days": 0,
      "91-180 days": 0,
      "180+ days": 0,
      Overdue: 0,
    };

    items.forEach((item) => {
      if (!item.due || item.due === "TBD") return;
      try {
        const dueDate = parseISO(item.due);
        const daysUntil = differenceInDays(dueDate, now);

        if (daysUntil < 0) {
          aging.Overdue++;
        } else if (daysUntil <= 30) {
          aging["0-30 days"]++;
        } else if (daysUntil <= 60) {
          aging["31-60 days"]++;
        } else if (daysUntil <= 90) {
          aging["61-90 days"]++;
        } else if (daysUntil <= 180) {
          aging["91-180 days"]++;
        } else {
          aging["180+ days"]++;
        }
      } catch {
        // Skip invalid dates
      }
    });

    return {
      labels: Object.keys(aging),
      datasets: [
        {
          label: "Items",
          data: Object.values(aging),
          backgroundColor: [
            "#ef4444", // Overdue - red
            "#f97316", // 0-30 - orange
            "#eab308", // 31-60 - yellow
            "#22c55e", // 61-90 - green
            "#3b82f6", // 91-180 - blue
            "#8b5cf6", // 180+ - purple
          ],
          borderRadius: 6,
        },
      ],
    };
  }, [items]);

  const formatDueDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: "Total Reports",
            value: stats.total,
            detail: "PSURs & PMSRs",
            icon: Package,
            color: "text-primary",
          },
          {
            label: "Due This Quarter",
            value: stats.dueThisQuarter,
            detail: "Requiring attention",
            icon: Clock,
            color: "text-blue-600",
          },
          {
            label: "Overdue",
            value: stats.overdue,
            detail: "Action required",
            icon: AlertTriangle,
            color: "text-red-600",
          },
          {
            label: "Compliance Rate",
            value: `${stats.complianceRate}%`,
            detail: "On schedule",
            icon: TrendingUp,
            color: "text-green-600",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-background/40 border border-border/40 rounded-xl p-4 hover:shadow-lg transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  {stat.label}
                </p>
              </div>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-3xl font-bold mb-0.5">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground">{stat.detail}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-background/40 border border-border/40 rounded-xl p-4"
        >
          <h3 className="text-xs font-semibold mb-3">Distribution by Class</h3>
          <div className="h-48">
            <Doughnut
              data={classData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "right" },
                },
                cutout: "65%",
              }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-background/40 border border-border/40 rounded-xl p-4"
        >
          <h3 className="text-xs font-semibold mb-3">Status Overview</h3>
          <div className="h-48">
            <Bar
              data={statusData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
                  x: { grid: { display: false } },
                },
              }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-background/40 border border-border/40 rounded-xl p-4"
        >
          <h3 className="text-xs font-semibold mb-3">Aging Analysis</h3>
          <div className="h-48">
            <Bar
              data={agingData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
                  x: { grid: { display: false } },
                },
              }}
            />
          </div>
        </motion.div>
      </div>

      {/* Writer Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
        className="bg-background/40 border border-border/40 rounded-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border/40 bg-gradient-to-r from-primary/5 to-accent/5 flex items-center justify-between">
          <h3 className="text-xs font-semibold flex items-center gap-2">
            <User className="w-3.5 h-3.5" />
            Writer Metrics
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Top {Math.min(8, writerStats.length)} by volume
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="h-52">
            <Bar
              data={writerData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "top", labels: { boxWidth: 10 } },
                  tooltip: { mode: "index", intersect: false },
                },
                scales: {
                  y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
                  x: { grid: { display: false } },
                },
              }}
            />
          </div>
          <div className="space-y-2">
            {writerStats.map((r) => (
              <div key={r.writer} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{r.writer}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.overdue > 0 ? `${r.overdue} overdue` : "No overdue"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{r.total}</p>
                  <p className="text-[10px] text-muted-foreground">items</p>
                </div>
              </div>
            ))}
            {writerStats.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-10">
                No writer data yet
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Upcoming Due Dates - Enhanced Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-background/40 border border-border/40 rounded-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border/40 bg-gradient-to-r from-primary/5 to-accent/5">
          <h3 className="text-xs font-semibold flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Upcoming Due Dates
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Days Until
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Product
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Class
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {upcomingItems.map((item, i) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.05 }}
                  className="border-b border-border/20 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-2 text-xs font-medium text-foreground whitespace-nowrap">
                    {formatDueDate(item.due)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        item.daysUntil < 0
                          ? "bg-red-100 text-red-700"
                          : item.daysUntil <= 30
                          ? "bg-orange-100 text-orange-700"
                          : item.daysUntil <= 60
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {item.daysUntil < 0
                        ? `${Math.abs(item.daysUntil)} days ago`
                        : `${item.daysUntil} days`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-medium text-foreground">
                    {item.id}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                    {item.product}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                      {item.class}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        item.status.toLowerCase().includes("complete")
                          ? "bg-green-100 text-green-700"
                          : item.status.toLowerCase().includes("progress")
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {upcomingItems.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-8">
              No upcoming due dates
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

