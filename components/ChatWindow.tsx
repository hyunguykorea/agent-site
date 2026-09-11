// 파일 위치: components/ChatWindow.tsx  (기존 파일 덮어쓰기)
//
// 이번 수정 (새 대화 시 도감이 사라져 보이던 문제)
//  · 도감 개수를 subscribeDiscoveries 로 구독 → 새 대화·다른 탭·새 발견에 자동 반영
//  · newChat 은 말풍선과 Direct Line 세션만 초기화. 도감 저장소는 절대 건드리지 않음
//  · 새 대화 직후 도감 개수를 강제로 재동기화
//  · 확인창 문구에 "도감은 유지됩니다" 명시
//
// 유지: 연결 중/생각 중 입력 잠금, 에코 차단, STT/TTS, 대화 복원

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
  } catch {
    /* 무시 */
  }
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<DLStatus>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [pending, setPending] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [dexCount, setDexCount] = useState(0);
  const [toast, setToast] = useState('');

  const connRef = useRef<DLConnection | null>(null);
  const startedRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTextsRef = useRef<string[]>([]);

  const locked = status !== 'ready' || pending;

  // ── ★ 도감 개수를 "구독" — 무슨 일이 있어도 화면이 최신값을 따라간다 ──
  useEffect(() => {
    const sync = () => setDexCount(countDiscoveries());
    sync();                                  // 마운트 시 1회
    const unsub = subscribeDiscoveries(sync); // 변경 시마다
    return unsub;
  }, []);

  // ── 저장된 대화 복원 ─────────────────────────────────────
  useEffect(() => {
    setMessages(loadMsgs());
  }, []);

  useEffect(() => {
    if (messages.length) saveMsgs(messages);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  // ── TTS ────────────────────────────────────────────────
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

  // ── 연결 ────────────────────────────────────────────────
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

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'bot' && norm(last.text) === norm(text)) return prev;
              return [...prev, { id: a.id || `${Date.now()}`, role: 'bot', text }];
            });

            if (pendingTimer.current) clearTimeout(pendingTimer.current);
            setPending(false);
            addHistory('bot', text);

            // 발견 도감에 영구 저장 (구독 덕분에 배지가 자동 증가)
            const found = captureDiscovery(text);
            if (found) {
              setToast(`도감에 추가! [${found.category}]`);
              setTimeout(() => setToast(''), 2500);
            }

            speak(text);
          },
        });
        connRef.current = conn;
      } catch (e: any) {
        setStatus('error');
        setErrorMsg(e?.message || '연결에 실패했습니다.');
      }
      setDexCount(countDiscoveries()); // 연결 직후에도 재동기화
    },
    [isEchoOfUser, speak]
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

  // ── 전송 ────────────────────────────────────────────────
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

  // ── 새 대화 — 도감 저장소는 절대 건드리지 않는다 ──────────
  const newChat = useCallback(() => {
    if (!confirm('새 대화를 시작할까요?\n\n· 대화 말풍선만 초기화됩니다\n· 발견 도감은 그대로 유지됩니다')) {
      return;
    }
    clearSession();          // Direct Line 세션만 초기화
    setMessages([]);
    try {
      window.localStorage.removeItem(MSG_KEY); // 말풍선만 삭제
    } catch {}
    sentTextsRef.current = [];
    setDexCount(countDiscoveries()); // ★ 배지 즉시 재동기화 (이게 빠져서 0으로 보였음)
    connect(true);
  }, [connect]);

  // ── STT ─────────────────────────────────────────────────
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
          <a
            href="/history"
            className="rounded-xl bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700"
            title="발견 도감 보기"
          >
            📖 도감 {dexCount}
          </a>
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
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm">
        {messages.length === 0 && status === 'connecting' && (
          <p className="text-center text-slate-400">에이전트와 연결하고 있습니다…</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 leading-relaxed ' +
                (m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800')
              }
            >
              {m.text}
            </div>
          </div>
        ))}
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
    </div>
  );
}
