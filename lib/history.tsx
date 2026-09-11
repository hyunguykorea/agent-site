// 파일 위치: pages/history.tsx  (기존 파일 덮어쓰기 — historyStore.ts 와 함수 이름을 맞추기 위함)
import { useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import { loadHistory, clearHistory, type HistoryItem } from '@/lib/historyStore';

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(loadHistory());
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <NavBar />
      <div className="mx-auto w-full max-w-2xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">사용 기록</h1>
          <button
            onClick={() => {
              clearHistory();
              setItems([]);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            기록 삭제
          </button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
            아직 기록이 없습니다. 채팅을 먼저 해보세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {items
              .slice()
              .reverse()
              .map((it) => (
                <li key={it.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-1 text-xs text-slate-400">
                    {it.role === 'user' ? '나' : '에이전트'} ·{' '}
                    {new Date(it.at).toLocaleString('ko-KR')}
                  </div>
                  <div className="whitespace-pre-wrap text-slate-800">{it.text}</div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </main>
  );
}
