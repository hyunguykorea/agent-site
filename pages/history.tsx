// 파일 위치: pages/history.tsx  (기존 파일 덮어쓰기)
//
// ★ UI 겹침 버그 수정
//   기존 history.tsx 안에 <NavBar /> 가 한 번 더 들어 있어서
//   _app.tsx 의 상단바와 겹쳐 보였습니다. → 이 파일에서는 NavBar 를 렌더하지 않습니다.
//   (상단바는 pages/_app.tsx 에서 딱 한 번만 그립니다)
//
// 역할 정리
//   · 이 페이지(기록) = 대화 로그 전용
//   · 도감/즐겨찾기 = /dex 페이지 담당

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadHistory, clearHistory, subscribeHistory, type HistoryItem } from '@/lib/historyStore';

const AGENT_EMOJI = process.env.NEXT_PUBLIC_AGENT_EMOJI || '🍕';

function dayLabel(ts: number) {
  return new Date(ts).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'user' | 'bot'>('all');

  useEffect(() => {
    const sync = () => setItems(loadHistory());
    sync();
    return subscribeHistory(sync);
  }, []);

  const list = (filter === 'all' ? items : items.filter((i) => i.role === filter))
    .slice()
    .reverse();

  // 날짜별 그룹
  const groups: Array<{ day: string; rows: HistoryItem[] }> = [];
  for (const it of list) {
    const day = dayLabel(it.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(it);
    else groups.push({ day, rows: [it] });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-indigo-100/50 backdrop-blur-xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">
          대화 로그
        </p>
        <h1 className="mt-0.5 bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-extrabold text-transparent">
          🕘 기록
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          주고받은 메시지 {items.length}개 · 이 기기에만 저장됩니다.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {([
            ['all', `전체 ${items.length}`],
            ['user', `🙋 내 말 ${items.filter((i) => i.role === 'user').length}`],
            ['bot', `${AGENT_EMOJI} 에이전트 ${items.filter((i) => i.role === 'bot').length}`],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                'rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ' +
                (filter === k
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')
              }
            >
              {label}
            </button>
          ))}

          <Link
            href="/dex"
            className="ml-auto rounded-full bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            📖 도감 보기
          </Link>
          <button
            onClick={() => {
              if (confirm('대화 기록을 모두 지울까요?\n(발견 도감과 즐겨찾기는 지워지지 않습니다)')) {
                clearHistory();
                setItems([]);
              }
            }}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-rose-500"
          >
            기록 비우기
          </button>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/60 bg-white/70 p-12 text-center shadow-lg backdrop-blur-xl">
          <p className="text-4xl">🕘</p>
          <p className="mt-3 font-bold text-slate-700">아직 기록이 없습니다.</p>
          <Link
            href="/chat"
            className="mt-4 inline-block rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-200"
          >
            💬 대화하러 가기
          </Link>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.day} className="mt-6">
            <h2 className="mb-2 px-1 text-xs font-bold text-slate-400">{g.day}</h2>
            <div className="space-y-2">
              {g.rows.map((it) => (
                <article
                  key={it.id}
                  className={
                    'animate-pop rounded-2xl border p-3.5 shadow-sm backdrop-blur-xl ' +
                    (it.role === 'user'
                      ? 'border-indigo-100 bg-indigo-50/70'
                      : 'border-white/60 bg-white/80')
                  }
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={
                        'text-[11px] font-bold ' +
                        (it.role === 'user' ? 'text-indigo-600' : 'text-slate-500')
                      }
                    >
                      {it.role === 'user' ? '🙋 나' : `${AGENT_EMOJI} 에이전트`}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(it.at).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {it.text}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
