import { useEffect, useRef, useState } from "react";
import { DirectLineClient } from "@/lib/dlClient";
import { useSTT, useTTS } from "@/lib/speechHooks";
import { saveHistoryItem } from "@/lib/historyStore";
import type { ChatMessage } from "@/lib/appTypes";

const uid = () => Math.random().toString(36).slice(2);

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"연결중" | "준비됨" | "오류">("연결중");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const clientRef = useRef<DirectLineClient | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const stt = useSTT("ko-KR");
  const tts = useTTS("ko-KR");

  /* 1) 에이전트 연결 */
  useEffect(() => {
    const c = new DirectLineClient();
    clientRef.current = c;
    (async () => {
      try {
        await c.start();
        setStatus("준비됨");
        const greet = await c.waitForReply(8000);
        if (greet.length) {
          setMessages(
            greet.map((a) => ({
              id: a.id || uid(),
              role: "agent" as const,
              text: a.text || "",
              at: Date.now()
            }))
          );
          tts.speak(greet.map((a) => a.text).join(" "));
        }
      } catch (e) {
        setStatus("오류");
        setErrorMsg(
          (e as Error).message + " — .env.local 의 DIRECTLINE_SECRET 값을 확인하세요."
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 2) STT 결과 -> 입력창 */
  useEffect(() => {
    if (stt.transcript) setInput(stt.transcript);
  }, [stt.transcript]);

  /* 3) 자동 스크롤 */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim();
    const client = clientRef.current;
    if (!q || !client || !client.ready || busy) return;

    stt.stop();
    tts.stop();
    setInput("");
    stt.setTranscript("");
    setMessages((m) => [...m, { id: uid(), role: "user", text: q, at: Date.now() }]);
    setBusy(true);

    try {
      await client.sendMessage(q);
      const replies = await client.waitForReply(25000);
      const answer = replies.map((r) => r.text).filter(Boolean).join("\n");

      if (answer) {
        setMessages((m) => [
          ...m,
          { id: uid(), role: "agent", text: answer, at: Date.now() }
        ]);
        tts.speak(answer);
        saveHistoryItem({ id: uid(), question: q, answer, at: Date.now() });
      } else {
        setMessages((m) => [
          ...m,
          {
            id: uid(),
            role: "agent",
            text: "응답이 없습니다. 잠시 후 다시 시도해 주세요.",
            at: Date.now()
          }
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "agent", text: `오류: ${(e as Error).message}`, at: Date.now() }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 상태 표시 */}
      <div className="flex items-center justify-between rounded-xl bg-white px-4 py-2 text-xs ring-1 ring-slate-200">
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "준비됨"
                ? "bg-emerald-500"
                : status === "오류"
                ? "bg-rose-500"
                : "bg-amber-400"
            }`}
          />
          에이전트 {status}
        </span>
        <button
          onClick={() => {
            tts.setEnabled(!tts.enabled);
            if (tts.enabled) tts.stop();
          }}
          className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100"
        >
          {tts.enabled ? "🔊 음성 ON" : "🔇 음성 OFF"}
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {errorMsg}
        </div>
      )}

      {/* 대화 영역 */}
      <div className="h-[58vh] overflow-y-auto rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        {messages.length === 0 && !busy && (
          <p className="mt-10 text-center text-sm text-slate-400">
            마이크를 누르고 말하거나, 아래에 질문을 입력하세요.
          </p>
        )}

        <div className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-brand-500 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
                생각하는 중…
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => (stt.listening ? stt.stop() : stt.start())}
          disabled={!stt.supported}
          title={stt.supported ? "음성 입력" : "이 브라우저는 음성 인식을 지원하지 않습니다"}
          className={`h-14 w-14 shrink-0 rounded-2xl text-xl font-bold transition ${
            stt.listening
              ? "animate-pulse bg-rose-500 text-white"
              : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          } disabled:opacity-40`}
        >
          🎙️
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={stt.listening ? "듣고 있어요…" : "질문을 입력하세요"}
          className="min-h-[56px] flex-1 resize-none rounded-2xl bg-white px-4 py-4 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
        />

        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim() || status !== "준비됨"}
          className="btn-primary h-14 shrink-0 px-5"
        >
          전송
        </button>
      </div>

      {!stt.supported && (
        <p className="text-center text-xs text-slate-400">
          음성 인식은 Chrome / Edge 브라우저에서 지원됩니다.
        </p>
      )}
    </div>
  );
}
