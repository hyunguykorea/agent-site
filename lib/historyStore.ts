import type { HistoryItem } from "@/lib/appTypes";

const KEY = "agent-site-history";

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistoryItem(item: HistoryItem) {
  if (typeof window === "undefined") return;
  const list = loadHistory();
  list.unshift(item);
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
