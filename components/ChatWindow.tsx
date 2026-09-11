// 파일 위치: components/ChatWindow.tsx  (기존 파일 덮어쓰기)
//
// 이번 수정
//  1) "새 대화" = 화면(말풍선)만 비움. Direct Line 대화 세션·에이전트 맥락·도감 데이터는 그대로 유지
//     → 에이전트는 이전 이야기를 계속 기억합니다. (진짜로 끊고 싶을 때만 "세션 재연결")
//  2) 디자인 전면 개편 — 그라데이션 배경, 유리질감 카드, 아바타, 말풍선 꼬리, 부드러운 등장 애니메이션
//  3) 에이전트 이름 위에 작은 한 줄(태그라인) 표시 — .env.local 의 NEXT_PUBLIC_AGENT_TAGLINE 로 바꿀 수 있음

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  connectDirectLine,
  clearSession,
  type DLActivity,
  type DLConnection,
  type DLStatus,
} from '@/lib/dlClient';
import { cleanForTTS } from '@/lib/ttsClean';
import { addHistory } from '@/lib/historyStore';
import {
  captureDiscovery,
  subscribeDiscoveries,
  loadDiscoveries,
  addManual,
  hasDiscovery,
  removeDiscovery,
  isSystemMessage,
  type Discovery,
} from '@/lib/discoveryStore';

type Msg = { id: string; role: 'user' | 'bot'; text: string };

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || '한입 에이전트';
// 🔽 에이전트 이름 "위"에 뜨는 작은 한 줄
const AGENT_TAGLINE = process.env.NEXT_PUBLIC_AGENT_TAGLINE || '오늘의 한입 지식';
const AGENT_DESC =
  process.env.NEXT_PUBLIC_AGENT_DESC || '무엇이든 물어보세요. 말로 묻고, 목소리로 듣습니다.';
const AGENT_EMOJI = process.env.NEXT_PUBLIC_AGENT_EMOJI || '🍕';

const MSG_KEY = 'agent-site-chat-messages';

const SUGGESTIONS = ['오늘의 발견 알려줘', '재미있는 음식 이야기', '우주에 대해 알려줘'];

function norm(s: string) {
  return (s || '').replace(/\s+/g, '').replace(/[.,!?~…"'`]/g, '').toLowerCase();
}
function loadMsgs(): Msg[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MSG_KEY);
    const list = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function saveMsgs(list: Msg[]) {
  try {
    window.localStorage.setItem(MSG_KEY, JSON.stringify(list.slice(-100)));
  } catch {}
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<DLStatus>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [pending, setPending] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [dex, setDex] = useState<Discovery[]>([]);
  const [dexOpen, setDexOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [tick, setTick] = useState(0);

  const connRef = useRef<DLConnection | null>(null);
  const startedRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTextsRef = useRef<string[]>([]);

  const locked = status !== 'ready' || pending;
  const dexCount = dex.length;
  const starredSet = useMemo(
    () => new Set(dex.map((d) => norm(d.body))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dex, tick]
  );

  // 도감 구독 — 새 대화·다른 탭·새 발견 모두 자동 반영
  useEffect(() => {
    const sync = () => {
      setDex(loadDiscoveries());
      setTick((t) => t + 1);
    };
    sync();
    return subscribeDiscoveries(sync);
  }, []);

  useEffect(() => {
    setMessages(loadMsgs());
  }, []);

  useEffect(() => {
    saveMsgs(messages);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  const speak = useCallback(
    (raw: string) => {
      if (!ttsOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const text = cleanForTTS(raw);
      if (!text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = 1.02;
      window.speechSynthesis.speak(u);
    },
    [ttsOn]
  );

  const isEchoOfUser = useCallback((botText: string) => {
    const n = norm(botText);
    if (!n) return false;
    return sentTextsRef.current.slice(-5).some((s) => norm(s) === n);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }, []);

  const connect = useCallback(
    async (forceNew = false) => {
      connRef.current?.stop();
      connRef.current = null;
      setStatus('connecting');
      setErrorMsg('');
      try {
        const conn = await connectDirectLine({
          forceNew,
          onStatus: (s, m) => {
            setStatus(s);
            if (m) setErrorMsg(m);
          },
          onActivity: (a: DLActivity) => {
            const text = (a.text || '').trim();
            if (!text) return;
            if (isEchoOfUser(text)) return;

            // 시스템/메타 메시지는 화면·도감·TTS 모두에서 제외
            if (isSystemMessage(text)) {
              if (pendingTimer.current) clearTimeout(pendingTimer.current);
              setPending(false);
              return;
            }

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'bot' && norm(last.text) === norm(text)) return prev;
              return [...prev, { id: a.id || `b-${Date.now()}`, role: 'bot', text }];
            });

            if (pendingTimer.current) clearTimeout(pendingTimer.current);
            setPending(false);
            addHistory('bot', text);

            const found = captureDiscovery(text);
            if (found) showToast(`도감에 추가! [${found.category}]`);

            speak(text);
          },
        });
        connRef.current = conn;
      } catch (e: any) {
        setStatus('error');
        setErrorMsg(e?.message || '연결에 실패했습니다.');
      }
      setDex(loadDiscoveries());
    },
    [isEchoOfUser, showToast, speak]
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    connect(false);
    return () => {
      connRef.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [connect]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text) return;
      if (status !== 'ready' || pending) return;
      const conn = connRef.current;
      if (!conn) return;

      setInput('');
      sentTextsRef.current = [...sentTextsRef.current, text].slice(-10);
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
      addHistory('user', text);
      setPending(true);

      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(() => setPending(false), 30000);

      try {
        await conn.send(text);
      } catch (e: any) {
        setPending(false);
        setErrorMsg(e?.message || '전송 실패');
      }
    },
    [input, pending, status]
  );

  // ── 새 대화 = 화면만 비우기 ──────────────────────────────
  //  · Direct Line 세션 유지 → 에이전트는 앞 이야기를 계속 기억
  //  · 도감/기록 데이터도 그대로
  const clearScreen = useCallback(() => {
    setMessages([]);
    try {
      window.localStorage.removeItem(MSG_KEY);
    } catch {}
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setDex(loadDiscoveries()); // 배지 즉시 재동기화
    setTick((t) => t + 1);
    showToast('화면을 비웠어요 (기억·도감은 그대로)');
  }, [showToast]);

  // 진짜로 대화를 끊고 싶을 때만 사용 (연결이 꼬였을 때 복구용)
  const hardReset = useCallback(() => {
    if (!confirm('에이전트와의 대화를 완전히 새로 시작할까요?\n\n· 에이전트가 앞의 내용을 잊습니다\n· 발견 도감과 기록은 그대로 유지됩니다')) return;
    clearSession();
    setMessages([]);
    try {
      window.localStorage.removeItem(MSG_KEY);
    } catch {}
    sentTextsRef.current = [];
    setDex(loadDiscoveries());
    connect(true);
  }, [connect]);

  // ⭐ 직접 담기 / 빼기
  const toggleStar = useCallback(
    (text: string) => {
      if (hasDiscovery(text)) {
        const all = loadDiscoveries();
        const hit = all.find(
          (d) => norm(d.body) === norm(text) || norm(text).includes(norm(d.body)) || norm(d.body).includes(norm(text))
        );
        if (hit) {
          removeDiscovery(hit.id);
          showToast('도감에서 뺐어요');
        }
      } else {
        const d = addManual(text);
        showToast(d ? `도감에 추가! [${d.category}]` : '담을 내용이 없어요');
      }
      setDex(loadDiscoveries());
      setTick((t) => t + 1);
    },
    [showToast]
  );

  const toggleMic = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    if (locked) return;

    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      const said = ev.results?.[0]?.[0]?.transcript ?? '';
      if (said) send(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, [listening, locked, send]);

  const statusLabel =
    status === 'connecting'
      ? '연결 중…'
      : status === 'error'
      ? '연결 오류'
      : pending
      ? '생각 중…'
      : '대화할 준비 완료';

  const dotClass =
    status === 'ready' && !pending
      ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.25)]'
      : status === 'error'
      ? 'bg-rose-400 shadow-[0_0_0_4px_rgba(251,113,133,0.25)]'
      : 'animate-pulse bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25)]';

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-128px)] w-full max-w-2xl flex-col gap-3 p-3 sm:h-[calc(100dvh-72px)] sm:p-4">
      {/* ── 헤더 카드: 태그라인 → 에이전트 이름 → 설명 ─────────── */}
      <header className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-lg shadow-indigo-100/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-2xl shadow-lg shadow-indigo-200">
            {AGENT_EMOJI}
          </div>
          <div className="min-w-0 flex-1">
            {/* 👇 이름 위 작은 한 줄 */}
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">
              <span className="inline-block h-1 w-4 rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" />
              {AGENT_TAGLINE}
            </p>
            <h1 className="truncate bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-xl font-extrabold text-transparent">
              {AGENT_NAME}
            </h1>
            <p className="truncate text-xs text-slate-500">{AGENT_DESC}</p>
          </div>
          <span className="hidden items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 sm:flex">
            <span className={'inline-block h-2 w-2 rounded-full ' + dotClass} />
            {statusLabel}
          </span>
        </div>

        {/* 툴바 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 sm:hidden">
            <span className={'inline-block h-2 w-2 rounded-full ' + dotClass} />
            {statusLabel}
          </span>
          <button
            onClick={() => setDexOpen(true)}
            className="rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-amber-200 transition hover:brightness-105 active:scale-95"
          >
            📖 도감 {dexCount}
          </button>
          <button
            onClick={clearScreen}
            title="말풍선만 비웁니다. 에이전트 기억과 도감은 유지돼요."
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95"
          >
            🧹 새 대화
          </button>
          <button
            onClick={() =>
              setTtsOn((v) => {
                if (v && typeof window !== 'undefined') window.speechSynthesis.cancel();
                return !v;
              })
            }
            className={
              'rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition active:scale-95 ' +
              (ttsOn
                ? 'bg-indigo-50 text-indigo-600 ring-indigo-200'
                : 'bg-white text-slate-400 ring-slate-200')
            }
          >
            {ttsOn ? '🔊 음성 ON' : '🔇 음성 OFF'}
          </button>
          <button
            onClick={hardReset}
            title="에이전트 기억까지 새로 시작 (연결이 꼬였을 때)"
            className="ml-auto rounded-full px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:text-slate-600"
          >
            ↺ 세션 재연결
          </button>
        </div>

        {status === 'error' && (
          <p className="mt-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-rose-100">
            {errorMsg || '에이전트에 연결하지 못했습니다.'} — “↺ 세션 재연결”을 눌러보세요.
          </p>
        )}
      </header>

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 animate-[fadeIn_.2s_ease-out] rounded-full bg-slate-900/90 px-4 py-2 text-sm font-semibold text-white shadow-xl backdrop-blur">
          {toast}
        </div>
      )}

      {/* ── 메시지 영역 ────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-3xl border border-white/60 bg-white/70 p-4 shadow-lg shadow-indigo-100/50 backdrop-blur-xl"
      >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <div className="mx-auto mb-3 grid h-16 w-16 animate-bounce place-items-center rounded-3xl bg-gradient-to-br from-indigo-100 to-fuchsia-100 text-3xl">
                {AGENT_EMOJI}
              </div>
              <p className="font-bold text-slate-700">
                {status === 'connecting' ? '에이전트를 부르는 중…' : '무엇이 궁금하세요?'}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                아래 버튼을 누르거나 🎤 로 말해보세요.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    disabled={locked}
                    onClick={() => send(s)}
                    className="rounded-full bg-white px-3 py-2 text-sm font-medium text-indigo-600 ring-1 ring-indigo-100 transition hover:bg-indigo-50 disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => {
          const starred = m.role === 'bot' && starredSet.has(norm(m.text));
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[82%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-3 leading-relaxed text-white shadow-md shadow-indigo-200">
                  {m.text}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex items-end gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 to-fuchsia-100 text-base">
                {AGENT_EMOJI}
              </div>
              <div className="max-w-[78%] whitespace-pre-wrap rounded-3xl rounded-bl-md bg-white px-4 py-3 leading-relaxed text-slate-800 shadow-md ring-1 ring-slate-100">
                {m.text}
              </div>
              <button
                onClick={() => toggleStar(m.text)}
                className={
                  'shrink-0 rounded-full p-1.5 text-lg leading-none transition active:scale-90 ' +
                  (starred ? 'bg-amber-50' : 'opacity-40 hover:opacity-100')
                }
                title={starred ? '도감에서 빼기' : '도감에 담기'}
              >
                {starred ? '⭐' : '☆'}
              </button>
            </div>
          );
        })}

        {pending && (
          <div className="flex items-end gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 to-fuchsia-100 text-base">
              {AGENT_EMOJI}
            </div>
            <div className="rounded-3xl rounded-bl-md bg-white px-4 py-3 shadow-md ring-1 ring-slate-100">
              <span className="inline-flex gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-300" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 입력 영역 ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-3xl border border-white/60 bg-white/70 p-2 shadow-lg shadow-indigo-100/50 backdrop-blur-xl">
        <button
          onClick={toggleMic}
          disabled={locked && !listening}
          className={
            'grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ' +
            (listening
              ? 'animate-pulse bg-gradient-to-br from-rose-500 to-red-500 text-white shadow-lg shadow-rose-200'
              : 'bg-slate-100 hover:bg-slate-200')
          }
          title={locked ? '지금은 사용할 수 없습니다' : '음성으로 말하기'}
        >
          🎤
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !locked) send();
          }}
          disabled={locked}
          placeholder={
            status === 'connecting'
              ? '에이전트 연결 중…'
              : status === 'error'
              ? '연결 오류 — 세션 재연결을 눌러주세요'
              : pending
              ? '답변을 기다리는 중…'
              : '메시지를 입력하세요'
          }
          className="h-12 min-w-0 flex-1 rounded-2xl bg-transparent px-3 text-slate-800 placeholder:text-slate-400 outline-none disabled:text-slate-400"
        />
        <button
          onClick={() => send()}
          disabled={locked || !input.trim()}
          className="grid h-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 font-bold text-white shadow-lg shadow-indigo-200 transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          전송
        </button>
      </div>

      {/* ── 도감 슬라이드 패널 ─────────────────────────────── */}
      {dexOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setDexOpen(false)}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-gradient-to-b from-amber-50 to-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-amber-100 p-4">
              <h2 className="text-lg font-extrabold text-slate-800">📖 발견 도감 {dexCount}</h2>
              <button
                onClick={() => setDexOpen(false)}
                className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200"
              >
                닫기
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {dex.length === 0 ? (
                <p className="pt-10 text-center text-sm leading-relaxed text-slate-500">
                  아직 발견이 없습니다.
                  <br />
                  마음에 드는 답변 옆 ☆ 를 눌러 담아보세요!
                </p>
              ) : (
                dex
                  .slice()
                  .reverse()
                  .map((d) => (
                    <article
                      key={d.id}
                      className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-amber-100"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2.5 py-0.5 text-xs font-bold text-white">
                          {d.category}
                        </span>
                        <button
                          onClick={() => {
                            removeDiscovery(d.id);
                            setDex(loadDiscoveries());
                            setTick((t) => t + 1);
                          }}
                          className="text-xs text-slate-400 hover:text-rose-500"
                        >
                          삭제
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">{d.body}</p>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {new Date(d.at).toLocaleString('ko-KR')}
                      </div>
                    </article>
                  ))
              )}
            </div>
            <footer className="border-t border-amber-100 p-3">
              <a
                href="/dex"
                className="block rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-center font-bold text-white shadow-lg shadow-indigo-200"
              >
                도감 전체 보기
              </a>
            </footer>
          </aside>
        </>
      )}
    </div>
  );
}
