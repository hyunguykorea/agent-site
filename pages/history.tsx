import { useEffect, useState } from "react";
import { clearHistory, loadHistory } from "@/lib/historyStore";
import type { HistoryItem } from "@/lib/appTypes";

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(loadHistory());
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">기록</h1>
        {items.length > 0 && (
          <button
            className="btn-ghost px-4 py-2 text-sm"
            onClick={() => {
              clearHistory();
              setItems([]);
            }}
          >
            전체 삭제
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          아직 사용 기록이 없습니다. 채팅에서 대화를 시작해 보세요.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="card">
              <p className="text-xs text-slate-400">
                {new Date(it.at).toLocaleString("ko-KR")}
              </p>
              <p className="mt-2 text-sm font-bold text-brand-600">Q. {it.question}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                A. {it.answer}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
