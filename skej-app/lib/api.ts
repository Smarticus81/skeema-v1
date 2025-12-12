const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

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

