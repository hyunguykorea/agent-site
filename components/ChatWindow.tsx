// 파일 위치: components/ChatWindow.tsx  (기존 파일 덮어쓰기)
//
// 이번 수정
//  1) 채팅 화면에서 바로 도감 확인 — 상단 "📖 도감 N" 을 누르면 오른쪽에서 패널이 슬라이드
//     (기록 페이지까지 안 가도 됨)
//  2) 말풍선마다 ⭐ 버튼 — 파서가 놓친 발견도 직접 담을 수 있음 (이미 담긴 건 ★ 노란색)
//  3) 시스템/메타 메시지("Manage your memories", "I'll check your discovery log.") 는
//     말풍선에 안 띄우고, 도감에도 안 넣고, TTS 로도 안 읽음
//  4) 새 대화를 해도 도감 배지는 구독으로 항상 최신 유지

import { useCallback, useEffect, useRef, useState } from 'react';
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
  countDiscoveries,
  subscribeDiscoveries,
  loadDiscoveries,
  addManual,
  hasDiscovery,
  removeDiscovery,
  isSystemMessage,
  type Discovery,
} from '@/lib/discoveryStore';

type Msg = { id: string; role: 'user' | 'bot'; text: string };

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || '에이전트';
const MSG_KEY = 'agent-site-chat-messages';

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
  const [tick, setTick] = useState(0); // ⭐ 표시 갱신용

  const connRef = useRef<DLConnection | null>(null);
  const startedRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTextsRef = useRef<string[]>([]);

  const locked = status !== 'ready' || pending;
  const dexCount = dex.length;

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
    if (messages.length) saveMsgs(messages);
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
    setTimeout(() => setToast(''), 2500);
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
              return [...prev, { id: a.id || `${Date.now()}`, role: 'bot', text }];
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

  // 새 대화 — 도감은 건드리지 않음
  const newChat = useCallback(() => {
    if (!confirm('새 대화를 시작할까요?\n\n· 대화 말풍선만 초기화됩니다\n· 발견 도감은 그대로 유지됩니다')) return;
    clearSession();
    setMessages([]);
    try {
      window.localStorage.removeItem(MSG_KEY);
    } catch {}
    sentTextsRef.current = [];
    setDex(loadDiscoveries()); // 배지 즉시 재동기화
    connect(true);
  }, [connect]);

  // ⭐ 직접 담기 / 빼기
  const toggleStar = useCallback(
    (text: string) => {
      if (hasDiscovery(text)) {
        const target = loadDiscoveries().find((d) => norm(d.body) === norm(text.replace(/\s+/g, ' ')));
        const all = loadDiscoveries();
        const hit =
          target ??
          all.find((d) => norm(text).includes(norm(d.body)) || norm(d.body).includes(norm(text)));
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
      ? '에이전트 연결 중…'
      : status === 'error'
      ? `연결 오류: ${errorMsg}`
      : pending
      ? `${AGENT_NAME} 생각 중…`
      : '연결됨';

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-64px)] w-full max-w-2xl flex-col p-3">
      {/* 상태 바 */}
      <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-white px-4 py-2 shadow-sm">
        <span className="flex items-center gap-2 text-sm text-slate-600">
          <span
            className={
              'inline-block h-2.5 w-2.5 rounded-full ' +
              (status === 'ready' && !pending
                ? 'bg-emerald-500'
                : status === 'error'
                ? 'bg-red-500'
                : 'animate-pulse bg-amber-400')
            }
          />
          {statusLabel}
        </span>
        <span className="flex items-center gap-2">
          <button
            onClick={() => setDexOpen(true)}
            className="rounded-xl bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
          >
            📖 도감 {dexCount}
          </button>
          <button onClick={newChat} className="rounded-xl border border-slate-300 px-2 py-1 text-xs">
            새 대화
          </button>
          <button
            onClick={() =>
              setTtsOn((v) => {
                if (v && typeof window !== 'undefined') window.speechSynthesis.cancel();
                return !v;
              })
            }
            className="rounded-xl border border-slate-300 px-3 py-1 text-sm"
          >
            {ttsOn ? '🔊 ON' : '🔇 OFF'}
          </button>
        </span>
      </div>

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm">
        {messages.length === 0 && status === 'connecting' && (
          <p className="text-center text-slate-400">에이전트와 연결하고 있습니다…</p>
        )}
        {messages.map((m) => {
          const starred = m.role === 'bot' && hasDiscovery(m.text);
          return (
            <div key={m.id + tick} className={m.role === 'user' ? 'flex justify-end' : 'flex items-start justify-start gap-1'}>
              <div
                className={
                  'max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 leading-relaxed ' +
                  (m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800')
                }
              >
                {m.text}
              </div>
              {m.role === 'bot' && (
                <button
                  onClick={() => toggleStar(m.text)}
                  className="mt-2 shrink-0 text-lg leading-none opacity-70 hover:opacity-100"
                  title={starred ? '도감에서 빼기' : '도감에 담기'}
                >
                  {starred ? '⭐' : '☆'}
                </button>
              )}
            </div>
          );
        })}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-500">
              <span className="inline-flex gap-1">
                <span className="animate-bounce">•</span>
                <span className="animate-bounce [animation-delay:150ms]">•</span>
                <span className="animate-bounce [animation-delay:300ms]">•</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 입력 */}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={toggleMic}
          disabled={locked && !listening}
          className={
            'h-12 w-12 shrink-0 rounded-2xl text-xl disabled:cursor-not-allowed disabled:opacity-40 ' +
            (listening ? 'bg-red-500 text-white' : 'bg-white shadow-sm')
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
              ? '연결 오류 — 새로고침 해주세요'
              : pending
              ? '답변을 기다리는 중…'
              : '메시지를 입력하세요'
          }
          className="h-12 flex-1 rounded-2xl border border-slate-200 px-4 outline-none disabled:bg-slate-100 disabled:text-slate-400"
        />
        <button
          onClick={() => send()}
          disabled={locked || !input.trim()}
          className="h-12 shrink-0 rounded-2xl bg-indigo-500 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          전송
        </button>
      </div>

      {/* ── 도감 패널 (채팅 화면에서 바로 확인) ───────────────── */}
      {dexOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDexOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b p-4">
              <h2 className="text-lg font-bold">📖 발견 도감 {dexCount}</h2>
              <button onClick={() => setDexOpen(false)} className="rounded-xl border px-3 py-1 text-sm">
                닫기
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {dex.length === 0 ? (
                <p className="pt-10 text-center text-sm text-slate-500">
                  아직 발견이 없습니다.
                  <br />
                  마음에 드는 답변 옆 ☆ 를 눌러 담아보세요!
                </p>
              ) : (
                dex
                  .slice()
                  .reverse()
                  .map((d) => (
                    <article key={d.id} className="rounded-2xl bg-slate-50 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {d.category}
                        </span>
                        <button
                          onClick={() => {
                            removeDiscovery(d.id);
                            setDex(loadDiscoveries());
                            setTick((t) => t + 1);
                          }}
                          className="text-xs text-slate-400 hover:text-red-500"
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
            <footer className="border-t p-3">
              <a
                href="/dex"
                className="block rounded-2xl bg-indigo-500 py-3 text-center font-semibold text-white"
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
