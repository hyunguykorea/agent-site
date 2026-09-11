import Link from "next/link";
import { useRouter } from "next/router";

const links = [
  { href: "/", label: "홈" },
  { href: "/chat", label: "채팅" },
  { href: "/history", label: "기록" },
  { href: "/survey", label: "설문" }
];

export default function NavBar() {
  const router = useRouter();
  const agentName = process.env.NEXT_PUBLIC_AGENT_NAME || "AI 에이전트";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-600">
          {agentName}
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => {
            const active = router.pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  active
                    ? "bg-brand-50 text-brand-600"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
