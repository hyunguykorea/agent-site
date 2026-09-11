// 파일 위치: pages/history.tsx  (기존 파일 덮어쓰기)
// 목적: "발견 도감"과 "대화 기록"을 한 페이지에서 탭으로 확인. 저장소는 localStorage 라 영구 유지됩니다.

import { useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import { loadHistory, clearHistory, type HistoryItem } from '@/lib/historyStore';
import {
  loadDiscoveries,
  clearDiscoveries,
  groupByCategory,
  type Discovery,
} from '@/lib/discoveryStore';

export default function HistoryPage() {
  const [tab, setTab] = useState<'dex' | 'log'>('dex');
  const [dex, setDex] = useState<Discovery[]>([]);
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setDex(loadDiscoveries());
    setItems(loadHistory());
  }, []);

  const grouped = groupByCategory(dex);
  const categories = Object.keys(grouped).sort();

  return (
    <main className="min-h-screen bg-slate-50">
      <NavBar />
      <div className="mx-auto w-full max-w-2xl p-4">
        {/* 탭 */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTab('dex')}
            className={
              'flex-1 rounded-2xl px-4 py-3 font-semibold ' +
              (tab === 'dex' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 shadow-sm')
            }
          >
            📖 발견 도감 {dex.length}
          </button>
          <button
            onClick={() => setTab('log')}
            className={
              'flex-1 rounded-2xl px-4 py-3 font-semibold ' +
              (tab === 'log' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 shadow-sm')
            }
          >
            💬 대화 기록 {items.length}
          </button>
        </div>

        {tab === 'dex' ? (
          dex.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
              아직 발견한 것이 없습니다. 채팅에서 대화를 나눠보세요!
            </p>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => {
                    if (!confirm('도감을 모두 비울까요?')) return;
                    clearDiscoveries();
                    setDex([]);
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  도감 비우기
                </button>
              </div>
              {categories.map((cat) => (
                <section key={cat} className="mb-5">
                  <h2 className="mb-2 text-sm font-bold text-slate-500">
                    {cat} · {grouped[cat].length}개
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {grouped[cat]
                      .slice()
                      .reverse()
                      .map((d) => (
                        <article key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
                          <div className="mb-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            {d.category}
                          </div>
                          <h3 className="font-bold text-slate-800">{d.title}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.body}</p>
                          <div className="mt-2 text-xs text-slate-400">
                            {new Date(d.at).toLocaleString('ko-KR')}
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
            </>
          )
        ) : items.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
            아직 기록이 없습니다.
          </p>
        ) : (
          <>
            <div className="mb-3 flex justify-end">
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
          </>
        )}
      </div>
    </main>
  );
}
