import Link from "next/link";

export default function HomePage() {
  const name = process.env.NEXT_PUBLIC_AGENT_NAME || "AI 에이전트";
  const desc =
    process.env.NEXT_PUBLIC_AGENT_DESC ||
    "무엇이든 물어보세요. 말로 묻고, 목소리로 듣습니다.";

  const features = [
    { title: "🎙️ 음성으로 질문", body: "마이크 버튼을 누르고 말하면 자동으로 입력됩니다." },
    { title: "🔊 음성으로 답변", body: "에이전트 답변을 브라우저가 바로 읽어줍니다." },
    { title: "📝 사용 기록", body: "질문과 답변이 기기에 저장되어 다시 볼 수 있습니다." }
  ];

  return (
    <div className="space-y-6">
      <section className="card text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{name}</h1>
        <p className="mt-3 text-slate-600">{desc}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/chat" className="btn-primary">
            대화 시작하기
          </Link>
          <Link href="/survey" className="btn-ghost">
            설문 참여하기
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card">
            <h2 className="text-base font-bold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">이용 방법</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-600">
          <li>
            1. 상단 <b>채팅</b> 메뉴로 이동합니다.
          </li>
          <li>2. 마이크 버튼을 누르고 질문을 말하거나 직접 입력합니다.</li>
          <li>3. 에이전트의 답변을 화면과 음성으로 확인합니다.</li>
        </ol>
      </section>
    </div>
  );
}
