// 파일 위치: lib/historyStore.ts  (기존 파일 덮어쓰기)
// 목적: 대화 기록을 localStorage 에 저장/불러오기. ChatWindow · history 페이지가 같은 키를 쓴다.

export type HistoryItem = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  at: number; // epoch ms
};

const KEY = 'agent-site-history';
const LIMIT = 200;

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function addHistory(role: 'user' | 'bot', text: string): void {
  if (typeof window === 'undefined') return;
  const item: HistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    at: Date.now(),
  };
  try {
    const next = [...loadHistory(), item].slice(-LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}
