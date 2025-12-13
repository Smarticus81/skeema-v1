function normalizeApiBaseUrl(raw: string): string {
  let v = (raw || "").trim();
  if (!v) return "http://localhost:3000/api";

  // Trim trailing slashes so callers can safely append "/route"
  v = v.replace(/\/+$/, "");

  // If already absolute, keep as-is
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;

  // Allow local dev values like "localhost:3000/api"
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(v)) return `http://${v}`;

  // Default to https for bare hostnames/domains like "skeema-v1-production.up.railway.app/api"
  return `https://${v}`;
}

export function getApiBaseUrl(): string {
  return normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api");
}

const API_URL = getApiBaseUrl();

export interface ScheduleItem {
  id: string;
  product: string;
  class: string;
  type: string;
  start: string;
  end: string;
  frequency: string;
  due: string;
  status: string;
  writer: string;
}

export const api = {
  async getSchedule(): Promise<ScheduleItem[]> {
    const res = await fetch(`${API_URL}/schedule`);
    if (!res.ok) throw new Error("Failed to fetch schedule");
    const data = await res.json();
    return data.items;
  },

  async saveSchedule(items: ScheduleItem[]): Promise<void> {
    const res = await fetch(`${API_URL}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error("Failed to save schedule");
  },

  async checkBackendStatus(): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/supabase/status`);
      const data = await res.json();
      return data.configured;
    } catch {
      return false;
    }
  },

  async deleteScheduleItem(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/schedule/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete item");
  },

  async deleteScheduleItems(ids: string[]): Promise<void> {
    const res = await fetch(`${API_URL}/schedule/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error("Failed to delete items");
  },
};

