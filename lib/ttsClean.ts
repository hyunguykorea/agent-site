/**
 * TTS 정제 규칙
 * 음성 출력 전 제거: 이모지 제목줄 / URL·링크 / 이메일 / 이모지 / ( ) / [ ] / 카테고리 태그 / 마크다운 기호
 */
export function cleanForTTS(input: string): string {
  if (!input) return "";

  let t = input;

  // 이모지로 시작하는 제목 줄 제거 (예: "🎉 오늘의 발견")
  t = t
    .split("\n")
    .filter(
      (line) =>
        !/^\s*[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(
          line
        )
    )
    .join("\n");

  // 마크다운 링크 [텍스트](url) -> 텍스트
  t = t.replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, "$1");

  // URL 제거
  t = t.replace(/https?:\/\/[^\s<>()]+/gi, " ");
  t = t.replace(/www\.[^\s<>()]+/gi, " ");

  // 이메일 제거
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ");

  // 대괄호 / 괄호 안 내용 제거
  t = t.replace(/\[[^\]]*\]/g, " ");
  t = t.replace(/\([^)]*\)/g, " ");
  t = t.replace(/（[^）]*）/g, " ");
  t = t.replace(/【[^】]*】/g, " ");
  t = t.replace(/「[^」]*」/g, " ");

  // 해시태그 제거
  t = t.replace(/(^|\s)#[^\s#]+/g, " ");

  // 마크다운 기호 제거
  t = t.replace(/[*_`>#~]/g, " ");

  // 이모지 및 기호 제거
  t = t.replace(
    /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
    " "
  );

  // 공백 정리
  t = t
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");

  return t.replace(/\s{2,}/g, " ").trim();
}
