// 파일 위치: lib/discoveryStore.ts  (기존 파일 덮어쓰기)
//
// 이번 수정 2가지
//  1) 파서가 너무 엄격해서 실제 봇 응답이 도감에 안 들어가던 문제
//     → 카테고리 [ ] 가 없어도 "사실형 문장"이면 등록되도록 완화
//     → 그래도 놓치면 사용자가 말풍선의 ⭐ 버튼으로 직접 담을 수 있음 (addManual)
//  2) 시스템/메타 메시지 차단
//     "Manage your memories", "I'll check your discovery log." 같은 안내문은
//     도감에도 넣지 않고 TTS 로도 읽지 않습니다.

export type Discovery = {
  id: string;
  category: string;
  title: string;
  body: string;
  at: number;
};

const KEY = 'agent-site-discoveries';
const BACKUP_KEY = 'agent-site-discoveries-backup';
const EVENT = 'agent-site-dex-changed';
const LIMIT = 300;

function norm(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/[.,!?~…"'`]/g, '').toLowerCase();
}

/**
 * 시스템/메타 메시지 판별.
 * Copilot Studio 의 메모리 안내(영어)나 내부 상태 문구는 대화 내용이 아니므로 걸러냅니다.
 */
export function isSystemMessage(raw: string): boolean {
  if (!raw) return true;
  const t = raw.trim();
  if (!t) return true;

  const patterns = [
    /manage your memories/i,
    /copilotstudio\.microsoft\.com/i,
    /discovery log/i,
    /i'?ll check your/i,
    /let me check your/i,
    /\/environments\/[\w-]+\/agents\//i,
    /^(ok|okay|sure|got it|thanks)[.!]?$/i,
  ];
  if (patterns.some((p) => p.test(t))) return true;

  // 링크/괄호/기호를 걷어낸 뒤 알맹이가 없으면 시스템 메시지로 간주
  const stripped = t
    .replace(/\(([^)]*)\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length < 2) return true;

  return false;
}

function readKey(key: string): Discovery[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as Discovery[]) : null;
  } catch {
    return null;
  }
}

export function loadDiscoveries(): Discovery[] {
  if (typeof window === 'undefined') return [];
  const main = readKey(KEY);
  if (main && main.length) return main;
  const backup = readKey(BACKUP_KEY);
  if (backup && backup.length) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(backup));
    } catch {}
    return backup;
  }
  return main ?? [];
}

function save(list: Discovery[]): void {
  const trimmed = list.slice(-LIMIT);
  const json = JSON.stringify(trimmed);
  try {
    window.localStorage.setItem(KEY, json);
    window.localStorage.setItem(BACKUP_KEY, json);
  } catch {}
  notify();
}

function notify(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeDiscoveries(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', cb);
  };
}

/** 본문 정리: 링크·이모지·괄호·마크다운 제거 */
function cleanBody(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/[*_#>`]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/피자|음식|요리|먹|맛|치킨|커피|라면|과자/, '음식'],
  [/우주|행성|별|은하|토성|화성|달\b/, '우주'],
  [/역사|로마|조선|왕|전쟁|고대/, '역사'],
  [/동물|고양이|강아지|새|물고기|곤충/, '동물'],
  [/과학|물리|화학|생물|실험|원소/, '과학'],
  [/영화|음악|게임|책|드라마|만화/, '문화'],
  [/몸|건강|수면|운동|뇌|심장/, '건강'],
];

function guessCategory(text: string): string {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(text)) return cat;
  return '기타';
}

/**
 * 봇 메시지에서 "발견" 추출 (완화된 규칙)
 *  · [카테고리] 가 있으면 그대로 사용
 *  · 없어도 "~다/~야/~래/~했다" 같은 사실 서술이면 등록하고 카테고리는 자동 추정
 *  · 질문만 있는 문장, 시스템 메시지는 제외
 */
export function parseDiscovery(raw: string): Discovery | null {
  if (!raw) return null;
  if (isSystemMessage(raw)) return null;

  const text = raw.trim();
  const catMatch = text.match(/\[([^\]]{1,20})\]/);
  const category = catMatch ? catMatch[1].trim() : '';

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const titleLine = lines.find((l) => /발견|오늘의|사실|트리비아|알아두면|재미있는/.test(l)) ?? '';
  const title = cleanBody(titleLine) || '오늘의 발견';

  const bodyLines = lines.filter((l) => l !== titleLine);
  const body = cleanBody(bodyLines.join(' '));
  if (!body || body.length < 10) return null;

  // 질문으로만 이루어진 메시지는 발견이 아님
  const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
  const factual = sentences.filter((s) => !s.trim().endsWith('?'));
  if (factual.length === 0) return null;

  const factBody = factual.join(' ').trim();
  if (factBody.length < 10) return null;

  // 등록 조건: 카테고리 태그 / 발견 제목줄 / 사실 서술 어미
  const looksFactual = /(다|야|래|죠|지|었어|했어|입니다|이다)[.!]?$/.test(factBody.trim());
  if (!category && !titleLine && !looksFactual) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: category || guessCategory(factBody),
    title,
    body: factBody,
    at: Date.now(),
  };
}

export function addDiscovery(d: Discovery | null): boolean {
  if (!d || typeof window === 'undefined') return false;
  const list = loadDiscoveries();
  if (list.some((x) => norm(x.body) === norm(d.body))) return false;
  save([...list, d]);
  return true;
}

export function captureDiscovery(botText: string): Discovery | null {
  const d = parseDiscovery(botText);
  if (!d) return null;
  return addDiscovery(d) ? d : null;
}

/** ⭐ 버튼용 — 파서가 놓쳐도 사용자가 직접 담는다. 항상 성공시킨다. */
export function addManual(botText: string): Discovery | null {
  if (typeof window === 'undefined') return null;
  const body = cleanBody(botText);
  if (!body) return null;
  const list = loadDiscoveries();
  if (list.some((x) => norm(x.body) === norm(body))) return null; // 이미 있음
  const catMatch = botText.match(/\[([^\]]{1,20})\]/);
  const d: Discovery = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: catMatch ? catMatch[1].trim() : guessCategory(body),
    title: '오늘의 발견',
    body,
    at: Date.now(),
  };
  save([...list, d]);
  return d;
}

/** 이미 도감에 담긴 내용인지 (⭐ 채움 표시용) */
export function hasDiscovery(botText: string): boolean {
  if (typeof window === 'undefined') return false;
  const body = cleanBody(botText);
  if (!body) return false;
  return loadDiscoveries().some((x) => norm(x.body) === norm(body));
}

export function countDiscoveries(): number {
  return loadDiscoveries().length;
}

export function removeDiscovery(id: string): void {
  save(loadDiscoveries().filter((d) => d.id !== id));
}

/** ⚠️ "도감 비우기" 버튼에서만 호출 */
export function clearDiscoveries(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(BACKUP_KEY);
  notify();
}

export function groupByCategory(list: Discovery[]): Record<string, Discovery[]> {
  return list.reduce<Record<string, Discovery[]>>((acc, d) => {
    (acc[d.category] ||= []).push(d);
    return acc;
  }, {});
}
