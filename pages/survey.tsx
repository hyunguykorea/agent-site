export default function SurveyPage() {
  const url = process.env.NEXT_PUBLIC_SURVEY_URL || "";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">설문</h1>
      <div className="card text-center">
        <p className="text-sm leading-relaxed text-slate-600">
          서비스 개선을 위해 짧은 설문에 참여해 주세요.
          <br />
          아래 버튼을 누르면 외부 설문 페이지로 이동합니다.
        </p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-6 w-full sm:w-auto"
          >
            설문 참여하기 →
          </a>
        ) : (
          <p className="mt-6 text-sm text-rose-600">
            NEXT_PUBLIC_SURVEY_URL 환경변수를 설정해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
