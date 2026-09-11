// 파일 위치: pages/index.tsx  (선택 교체 — 홈이 칙칙하다면 이걸로 덮어쓰기)
//
//  · 에이전트 이름 "위"에 작은 한 줄(태그라인) 배지
//  · 그라데이션 히어로 + 기능 카드 + 도감 현황
//  · 어떤 에이전트든 .env.local 값만 바꾸면 그대로 재사용 가능

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadDiscoveries, subscribeDiscoveries } from '@/lib/discoveryStore';

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || '한입 에이전트';
const AGENT_TAGLINE = process.env.NEXT_PUBLIC_AGENT_TAGLINE || '오늘의 한입 지식';
const AGENT_DESC =
  process.env.NEXT_PUBLIC_AGENT_DESC || '무엇이든 물어보세요. 말로 묻고, 목소리로 듣습니다.';
const AGENT_EMOJI = process.env.NEXT_PUBLIC_AGENT_EMOJI || '🍕';

const FEATURES = [
  { icon: '🎤', title: '말로 물어보기', desc: '마이크를 누르고 말하면 자동으로 입력됩니다.' },
  { icon: '🔊', title: '목소리로 듣기', desc: '답변을 사람 목소리로 읽어줍니다.' },
  { icon: '📖', title: '발견 도감', desc: '마음에 든 답변을 ☆ 로 담아 모아보세요.' },
];

export default function Home() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(loadDiscoveries().length);
    sync();
    return subscribeDiscoveries(sync);
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      {/* 히어로 */}
      <section className="animate-pop overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 p-8 text-center shadow-xl shadow-indigo-100/60 backdrop-blur-xl sm:p-12">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-4xl shadow-xl shadow-indigo-200">
          {AGENT_EMOJI}
        </div>

        {/* 👇 이름 위 작은 한 줄 */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600 ring-1 ring-indigo-100">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
          {AGENT_TAGLINE}
        </span>

        <h1 className="mt-3 bg-gradient-to-r from-slate-900 via-indigo-700 to-fuchsia-600 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
          {AGENT_NAME}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-slate-500">{AGENT_DESC}</p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/chat"
            className="rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-7 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 transition hover:brightness-105 active:scale-95"
          >
            💬 대화 시작하기
          </Link>
          <Link
            href="/dex"
            className="rounded-2xl bg-white px-7 py-3.5 font-bold text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95"
          >
            📖 발견 도감 {count > 0 && <span className="text-amber-600">{count}</span>}
          </Link>
        </div>
      </section>

      {/* 기능 카드 */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="animate-pop rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-indigo-100/40 backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-fuchsia-50 text-xl">
              {f.icon}
            </div>
            <h2 className="font-extrabold text-slate-800">{f.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{f.desc}</p>
          </article>
        ))}
      </section>

      {/* 사용법 */}
      <section className="mt-6 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-lg shadow-indigo-100/40 backdrop-blur-xl">
        <h2 className="mb-4 font-extrabold text-slate-800">이렇게 사용하세요</h2>
        <ol className="space-y-3">
          {[
            '채팅 화면에서 궁금한 것을 묻거나 🎤 로 말합니다.',
            '답변이 오면 자동으로 읽어주고, 새로운 사실은 도감에 담깁니다.',
            '마음에 드는 답변 옆 ☆ 를 누르면 직접 담을 수도 있어요.',
            '“🧹 새 대화”는 화면만 비우고, 도감과 대화 기억은 그대로 유지됩니다.',
          ].map((t, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-600">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-8 text-center text-xs text-slate-400">
        Powered by Copilot Studio · Direct Line · Web Speech API
      </p>
    </main>
  );
}
