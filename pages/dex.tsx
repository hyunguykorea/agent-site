// 파일 위치: pages/dex.tsx  (새 파일)
// 목적: "발견 도감" 전용 페이지. 카테고리 필터 + 카드 그리드.
//       기록 페이지에 묻혀 있던 도감을 독립 메뉴로 승격시킵니다. (/dex)

import { useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import {
  loadDiscoveries,
  clearDiscoveries,
  removeDiscovery,
  groupByCategory,
  subscribeDiscoveries,
  type Discovery,
} from '@/lib/discoveryStore';

export default function DexPage() {
  const [dex, setDex] = useState<Discovery[]>([]);
  const [filter, setFilter] = useState<string>('전체');

  useEffect(() => {
    const sync = () => setDex(loadDiscoveries());
    sync();
    return subscribeDiscoveries(sync);
  }, []);

  const grouped = useMemo(() => groupByCategory(dex), [dex]);
  const categories = useMemo(() => ['전체', ...Object.keys(grouped).sort()], [grouped]);
  const shown = filter === '전체' ? dex : grouped[filter] ?? [];

  return (
    <main className="min-h-screen bg-slate-50">
      <NavBar />
      <div className="mx-auto w-full max-w-3xl p-4">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">📖 발견 도감</h1>
            <p className="text-sm text-slate-500">지금까지 모은 발견 {dex.length}개</p>
          </div>
          {dex.length > 0 && (
            <button
              onClick={() => {
                if (!confirm('도감을 모두 비울까요? 되돌릴 수 없습니다.')) return;
                clearDiscoveries();
                setDex([]);
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              도감 비우기
            </button>
          )}
        </div>

        {/* 카테고리 필터 */}
        {dex.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={
                  'rounded-full px-3 py-1.5 text-sm font-semibold ' +
                  (filter === c ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 shadow-sm')
                }
              >
                {c}
                {c !== '전체' && ` ${grouped[c].length}`}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="mb-2 text-4xl">🔍</p>
            <p className="text-slate-500">
              아직 발견한 것이 없습니다.
              <br />
              채팅에서 대화하고, 마음에 드는 답변 옆 ☆ 를 눌러 담아보세요!
            </p>
            <a
              href="/chat"
              className="mt-4 inline-block rounded-2xl bg-indigo-500 px-6 py-3 font-semibold text-white"
            >
              채팅하러 가기
            </a>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shown
              .slice()
              .reverse()
              .map((d) => (
                <article key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {d.category}
                    </span>
                    <button
                      onClick={() => {
                        removeDiscovery(d.id);
                        setDex(loadDiscoveries());
                      }}
                      className="text-xs text-slate-400 hover:text-red-500"
                    >
                      삭제
                    </button>
                  </div>
                  <h3 className="font-bold text-slate-800">{d.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.body}</p>
                  <div className="mt-2 text-xs text-slate-400">
                    {new Date(d.at).toLocaleString('ko-KR')}
                  </div>
                </article>
              ))}
          </div>
        )}
      </div>
    </main>
  );
}
