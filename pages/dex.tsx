// 파일 위치: pages/dex.tsx  (기존 파일 덮어쓰기)
//
// ★ 추가: [📖 전체 / ⭐ 즐겨찾기] 탭
//   별을 누른 항목만 모아서 볼 수 있습니다.
//   카드의 ☆/⭐ 를 눌러 여기서도 즐겨찾기를 켜고 끌 수 있습니다.
//
// 주의: 이 페이지에서도 <NavBar /> 를 렌더하지 않습니다.
//      상단바는 pages/_app.tsx 에서 한 번만 그립니다. (겹침 방지)

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  loadDiscoveries,
  subscribeDiscoveries,
  removeDiscovery,
  toggleFav,
  clearDiscoveries,
  type Discovery,
} from '@/lib/discoveryStore';

export default function DexPage() {
  const [items, setItems] = useState<Discovery[]>([]);
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [cat, setCat] = useState('전체');

  useEffect(() => {
    const sync = () => setItems(loadDiscoveries());
    sync();
    return subscribeDiscoveries(sync);
  }, []);

  const favCount = items.filter((d) => d.fav).length;

  const scoped = tab === 'fav' ? items.filter((d) => d.fav) : items;

  const categories = useMemo(() => {
    const set = new Set(scoped.map((d) => d.category));
    return ['전체', ...Array.from(set)];
  }, [scoped]);

  const list = (cat === '전체' ? scoped : scoped.filter((d) => d.category === cat))
    .slice()
    .reverse();

  const refresh = () => setItems(loadDiscoveries());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-indigo-100/50 backdrop-blur-xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">
          내가 모은 지식
        </p>
        <h1 className="mt-0.5 bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-extrabold text-transparent">
          📖 발견 도감
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          전체 {items.length}개 · 즐겨찾기 {favCount}개
        </p>

        {/* 탭 */}
        <div className="mt-4 flex gap-1.5 rounded-2xl bg-white/70 p-1 ring-1 ring-slate-200">
          {([
            ['all', `📖 전체 ${items.length}`],
            ['fav', `⭐ 즐겨찾기 ${favCount}`],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setCat('전체');
              }}
              className={
                'flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-95 ' +
                (tab === k
                  ? k === 'fav'
                    ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-md shadow-amber-200'
                    : 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200'
                  : 'text-slate-500 hover:bg-white')
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* 카테고리 필터 */}
        {categories.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ' +
                  (cat === c
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50')
                }
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Link
            href="/chat"
            className="rounded-full bg-indigo-50 px-3.5 py-1.5 text-xs font-bold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-100"
          >
            💬 대화하러 가기
          </Link>
          {items.length > 0 && (
            <button
              onClick={() => {
                if (confirm('도감을 모두 비울까요? (되돌릴 수 없습니다)')) {
                  clearDiscoveries();
                  refresh();
                }
              }}
              className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-rose-500"
            >
              도감 비우기
            </button>
          )}
        </div>
      </header>

      {list.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/60 bg-white/70 p-12 text-center shadow-lg backdrop-blur-xl">
          <p className="text-4xl">{tab === 'fav' ? '⭐' : '📖'}</p>
          <p className="mt-3 font-bold text-slate-700">
            {tab === 'fav' ? '즐겨찾기가 비어 있어요.' : '아직 발견이 없어요.'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            채팅에서 답변 옆 <span className="font-bold text-amber-500">☆</span> 를 누르면 여기에
            쌓입니다.
          </p>
          <Link
            href="/chat"
            className="mt-4 inline-block rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-200"
          >
            💬 대화하러 가기
          </Link>
        </div>
      ) : (
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {list.map((d, i) => (
            <article
              key={d.id}
              className="animate-pop flex flex-col rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-indigo-100/40 backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                    {list.length - i}
                  </span>
                  <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2.5 py-0.5 text-xs font-bold text-white">
                    {d.category}
                  </span>
                </span>
                <button
                  onClick={() => {
                    toggleFav(d.id);
                    refresh();
                  }}
                  className={
                    'rounded-full p-1.5 text-xl leading-none transition active:scale-90 ' +
                    (d.fav
                      ? 'bg-amber-100 text-amber-500'
                      : 'text-slate-300 hover:bg-slate-100 hover:text-amber-400')
                  }
                  title={d.fav ? '즐겨찾기 해제' : '즐겨찾기'}
                >
                  {d.fav ? '⭐' : '☆'}
                </button>
              </div>

              <h2 className="font-extrabold text-slate-800">{d.title || '오늘의 발견'}</h2>
              <p className="mt-1 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                {d.body}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-[11px] text-slate-400">
                  {new Date(d.at).toLocaleString('ko-KR')}
                </span>
                <button
                  onClick={() => {
                    removeDiscovery(d.id);
                    refresh();
                  }}
                  className="text-[11px] text-slate-400 hover:text-rose-500"
                >
                  삭제
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
