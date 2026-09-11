import dynamic from "next/dynamic";

// 브라우저 전용 API(STT/TTS)를 쓰므로 SSR 비활성화
const ChatWindow = dynamic(() => import("@/components/ChatWindow"), { ssr: false });

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">채팅</h1>
      <ChatWindow />
    </div>
  );
}
