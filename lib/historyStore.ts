// 파일 위치: lib/historyStore.ts  (기존 파일 덮어쓰기)
// pages/history.tsx 와 API를 확실히 맞추기 위해 함께 보냅니다. 동작은 기존과 동일합니다.

export type HistoryItem = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  at: number;
};

const KEY = 'agent-site-history';
const EVENT = 'agent-site-history-changed';
const MAX = 300;

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((h: any) => ({
        id: String(h?.id ?? `h-${Math.random().toString(36).slice(2)}`),
        role: h?.role === 'bot' ? 'bot' : 'user',
        text: String(h?.text ?? ''),
        at: Number(h?.at ?? Date.now()),
      }))
      .filter((h: HistoryItem) => h.text);
  } catch {
    return [];
  }
}

function save(list: HistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

export function addHistory(role: 'user' | 'bot', text: string) {
  const t = (text || '').trim();
  if (!t) return;
  const item: HistoryItem = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    text: t,
    at: Date.now(),
  };
  save([...loadHistory(), item]);
}

export function clearHistory() {
  save([]);
}

export function subscribeHistory(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb as EventListener);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', cb);
  return () => {
    window.removeEventListener(EVENT, cb as EventListener);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', cb);
  };
}
