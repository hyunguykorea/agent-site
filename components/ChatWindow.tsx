// 파일 위치: components/ChatWindow.tsx  (기존 파일 덮어쓰기)
//
// 이 파일 하나로 3가지 문제를 모두 고칩니다.
//  ① 연결 중(connecting)에는 입력창·전송·마이크 버튼을 잠급니다. ("에이전트 연결 중…" 표시)
//  ② 에이전트가 생각 중(pending)에도 잠급니다. (점 3개 타이핑 표시)
//  ③ 봇이 내 말을 따라하는 에코를 이중으로 차단합니다.
//     - 1차: dlClient.ts 의 isRenderableBotMessage (from.id / role 기준)
//     - 2차: 아래 isEchoOfUser (직전에 내가 보낸 문장과 같으면 버림)
//
// STT/TTS 는 브라우저 기본 기능(webkitSpeechRecognition, speechSynthesis)만 사용합니다.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectDirectLine,
  makeUserId,
  type DLActivity,
  type DLConnection,
  type DLStatus,
} from '@/lib/dlClient';
import { cleanForTTS } from '@/lib/ttsClean';
import { addHistory } from '@/lib/historyStore';

type Msg = { id: string; role: 'user' | 'bot'; text: string };

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || '에이전트';

/** 비교용 정규화: 공백/문장부호 차이를 무시 */
function norm(s: string) {
  return (s || '').replace(/\s+/g, '').replace(/[.,!?~…"'`]/g, '').toLowerCase();
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<DLStatus>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [pending, setPending] = useState(false); // ② 에이전트 생각 중
  const [ttsOn, setTtsOn] = useState(true);
  const [listening, setListening] = useState(false);

  const connRef = useRef<DLConnection | null>(null);
  const startedRef = useRef(false);          // StrictMode 이중 실행 방지
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTextsRef = useRef<string[]>([]); // ③ 내가 보낸 문장 기록(에코 대조용)

  const locked = status !== 'ready' || pending; // 입력 잠금 조건

  // ── 스크롤 자동 하단 고정 ────────────────────────────────
  useEffect(() => {
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

  // ── ③ 2차 에코 차단 ─────────────────────────────────────
  const isEchoOfUser = useCallback((botText: string) => {
    const n = norm(botText);
    if (!n) return false;
    return sentTextsRef.current.slice(-5).some((s) => norm(s) === n);
  }, []);

  // ── ① Direct Line 연결 ──────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let alive = true;
    const userId = makeUserId();

    (async () => {
      try {
        const conn = await connectDirectLine({
          userId,
          onStatus: (s, m) => {
            if (!alive) return;
            setStatus(s);
            if (m) setErrorMsg(m);
          },
          onActivity: (a: DLActivity) => {
            if (!alive) return;
            const text = (a.text || '').trim();
            if (!text) return;
            if (isEchoOfUser(text)) return; // 내 말 따라하기 차단

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'bot' && norm(last.text) === norm(text)) return prev; // 중복 방지
              return [...prev, { id: a.id || `${Date.now()}`, role: 'bot', text }];
            });

            if (pendingTimer.current) clearTimeout(pendingTimer.current);
            setPending(false); // 답이 왔으니 잠금 해제
            addHistory('bot', text);
            speak(text);
          },
        });
        if (!alive) {
          conn.stop();
          return;
        }
        connRef.current = conn;
      } catch (e: any) {
        if (!alive) return;
        setStatus('error');
        setErrorMsg(e?.message || '연결에 실패했습니다.');
      }
    })();

    return () => {
      alive = false;
      connRef.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isEchoOfUser, speak]);

  // ── 전송 ────────────────────────────────────────────────
  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text) return;
      if (status !== 'ready' || pending) return; // ①② 이중 안전장치
      const conn = connRef.current;
      if (!conn) return;

      setInput('');
      sentTextsRef.current = [...sentTextsRef.current, text].slice(-10);
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
      addHistory('user', text);
      setPending(true);

      // 응답이 끝내 안 오면 30초 뒤 잠금 해제
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

  // ── STT (브라우저 기본) ─────────────────────────────────
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
    if (locked) return; // 연결 중·생각 중에는 마이크도 잠금

    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      const said = ev.results?.[0]?.[0]?.transcript ?? '';
      if (said) send(said); // 인식되면 바로 전송
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
    <div className="mx-auto flex h-[calc(100dvh-64px)] w-full max-w-2xl flex-col p-3">
      {/* 상태 바 */}
      <div className="mb-2 flex items-center justify-between rounded-2xl bg-white px-4 py-2 shadow-sm">
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
        <button
          onClick={() => {
            setTtsOn((v) => {
              if (v && typeof window !== 'undefined') window.speechSynthesis.cancel();
              return !v;
            });
          }}
          className="rounded-xl border border-slate-300 px-3 py-1 text-sm"
        >
          {ttsOn ? '🔊 ON' : '🔇 OFF'}
        </button>
      </div>

      {/* 메시지 영역 */}
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

      {/* 입력 영역 */}
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
