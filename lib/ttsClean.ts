// 파일 위치: lib/ttsClean.ts  (기존 파일 덮어쓰기)
// 목적: 음성으로 읽기 전에 URL / 이메일 / 이모지 / 괄호 / 대괄호 / 태그 / 마크다운 기호를 제거한다.

export function cleanForTTS(input: string): string {
  if (!input) return '';
  let t = input;

  t = t.replace(/```[\s\S]*?```/g, ' ');            // 코드블록
  t = t.replace(/`[^`]*`/g, ' ');                   // 인라인 코드
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');  // 마크다운 링크 → 글자만
  t = t.replace(/https?:\/\/\S+|www\.\S+/gi, ' ');  // URL
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ');   // 이메일
  t = t.replace(/\[[^\]]*\]/g, ' ');                // [대괄호]
  t = t.replace(/\([^)]*\)/g, ' ');                 // (괄호)
  t = t.replace(/（[^）]*）/g, ' ');                 // 전각 괄호
  t = t.replace(/(^|\s)#[^\s#]+/g, ' ');            // #태그
  t = t.replace(/[*_~>#|]/g, ' ');                  // 마크다운 기호
  t = t.replace(/^\s*[-•]\s+/gm, ' ');              // 불릿
  t = t.replace(
    /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
    ' '
  );                                                // 이모지
  t = t
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

export default cleanForTTS;
