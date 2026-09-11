// 파일 위치: components/NavBar.tsx  (기존 파일 덮어쓰기)
// 변경점: "📖 도감" 메뉴를 상단 네비에 추가 + 발견 개수 배지 표시

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { countDiscoveries, subscribeDiscoveries } from '@/lib/discoveryStore';

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || '에이전트';

const MENUS = [
  { href: '/', label: '홈' },
  { href: '/chat', label: '채팅' },
  { href: '/dex', label: '도감' },
  { href: '/history', label: '기록' },
  { href: '/survey', label: '설문' },
];

export default function NavBar() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(countDiscoveries());
    sync();
    return subscribeDiscoveries(sync);
  }, []);

  return (
    <nav className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white px-4">
      <Link href="/" className="font-bold text-slate-800">
        {AGENT_NAME}
      </Link>
      <ul className="flex items-center gap-1">
        {MENUS.map((m) => {
          const active = router.pathname === m.href;
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                className={
                  'rounded-xl px-3 py-2 text-sm font-semibold ' +
                  (active ? 'bg-indigo-500 text-white' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                {m.label}
                {m.href === '/dex' && count > 0 && (
                  <span
                    className={
                      'ml-1 rounded-full px-1.5 py-0.5 text-[11px] ' +
                      (active ? 'bg-white/25' : 'bg-amber-100 text-amber-700')
                    }
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
