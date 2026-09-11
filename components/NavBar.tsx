// 파일 위치: components/NavBar.tsx  (기존 파일 덮어쓰기)
//
// 이번 수정
//  · 유리질감(backdrop-blur) 상단바 + 그라데이션 로고로 톤업
//  · 로고 옆 작은 태그라인 한 줄 표시
//  · 현재 페이지 하이라이트(알약 모양) / 모바일은 하단 탭바로 자동 전환

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { loadDiscoveries, subscribeDiscoveries } from '@/lib/discoveryStore';

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || '한입 에이전트';
const AGENT_TAGLINE = process.env.NEXT_PUBLIC_AGENT_TAGLINE || '오늘의 한입 지식';
const AGENT_EMOJI = process.env.NEXT_PUBLIC_AGENT_EMOJI || '🍕';

const MENU = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/chat', label: '채팅', icon: '💬' },
  { href: '/dex', label: '도감', icon: '📖' },
  { href: '/history', label: '기록', icon: '🕘' },
  { href: '/survey', label: '설문', icon: '📝' },
];

export default function NavBar() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(loadDiscoveries().length);
    sync();
    return subscribeDiscoveries(sync);
  }, []);

  const isActive = (href: string) =>
    href === '/' ? router.pathname === '/' : router.pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xl shadow-lg shadow-indigo-200">
              {AGENT_EMOJI}
            </span>
            <span className="leading-tight">
              {/* 👇 이름 위 작은 한 줄 */}
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500">
                {AGENT_TAGLINE}
              </span>
              <span className="block bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-base font-extrabold text-transparent">
                {AGENT_NAME}
              </span>
            </span>
          </Link>

          <ul className="hidden items-center gap-1 sm:flex">
            {MENU.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  className={
                    'relative rounded-full px-3.5 py-2 text-sm font-semibold transition ' +
                    (isActive(m.href)
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200'
                      : 'text-slate-600 hover:bg-slate-100')
                  }
                >
                  {m.label}
                  {m.href === '/dex' && count > 0 && (
                    <span
                      className={
                        'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ' +
                        (isActive(m.href) ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700')
                      }
                    >
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* 모바일 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/60 bg-white/85 backdrop-blur-xl sm:hidden">
        <ul className="mx-auto flex max-w-lg">
          {MENU.map((m) => (
            <li key={m.href} className="flex-1">
              <Link
                href={m.href}
                className={
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ' +
                  (isActive(m.href) ? 'text-indigo-600' : 'text-slate-400')
                }
              >
                <span className="relative text-lg">
                  {m.icon}
                  {m.href === '/dex' && count > 0 && (
                    <span className="absolute -right-2 -top-1 rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                      {count}
                    </span>
                  )}
                </span>
                {m.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
