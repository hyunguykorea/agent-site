// 파일 위치: lib/discoveryStore.ts  (새 파일 — 이게 "발견 도감이 사라지는" 문제의 핵심 해결책)
//
// 문제 원인
//   기존 도감은 채팅 화면의 useState(=메모리) 에만 쌓였습니다.
//   Next.js 는 페이지를 이동하면 컴포넌트를 통째로 언마운트하므로
//   채팅 → 다른 탭 → 채팅 으로 돌아오면 state 가 초기값으로 리셋됩니다.
//   즉 에이전트는 정상이고, "저장할 곳이 없었던" 것이 원인입니다.
//
// 해결
//   localStorage 에 영구 저장합니다. 새로고침·탭이동·브라우저 재시작에도 유지됩니다.

export type Discovery = {
  id: string;
  category: string;  // 예: 음식
  title: string;     // 예: 오늘의 발견
  body: string;      // 본문(정제된 내용)
  at: number;        // 발견 시각(epoch ms)
};

const KEY = 'agent-site-discoveries';
const LIMIT = 300;

/** 비교용 정규화 (중복 발견 방지) */
function norm(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/[.,!?~…"'`]/g, '').toLowerCase();
}

/**
 * 봇 메시지에서 "발견" 항목을 뽑아냅니다.
 * 인식 형식 (한 개라도 맞으면 도감에 등록)
 *   🎉 오늘의 발견
 *   [음식]
 *   피자는 노동자들의 음식에서 시작됐다.
 *
 * 카테고리 [ ] 가 있거나, "발견/알아두면/사실/트리비아" 같은 신호어가 있으면 등록합니다.
 */
export function parseDiscovery(raw: string): Discovery | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  // 카테고리: 첫 번째 [ ... ]
  const catMatch = text.match(/\[([^\]]{1,20})\]/);
  const category = catMatch ? catMatch[1].trim() : '';

  // 제목: 이모지로 시작하는 첫 줄, 또는 "…발견" 이 들어간 줄
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine =
    lines.find((l) => /발견|오늘의|사실|트리비아|알아두면/.test(l)) ?? '';
  const title = titleLine
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[*_#>]/g, '')
    .trim();

  // 신호가 전혀 없으면 일반 대화로 보고 도감에 넣지 않음
  const looksLikeDiscovery = !!category || !!titleLine;
  if (!looksLikeDiscovery) return null;

  // 본문: 제목줄·카테고리줄·URL 을 제외한 나머지
  const body = lines
    .filter((l) => l !== titleLine)
    .join(' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!body) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: category || '기타',
    title: title || '오늘의 발견',
    body,
    at: Date.now(),
  };
}

export function loadDiscoveries(): Discovery[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Discovery[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: Discovery[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-LIMIT)));
  } catch {
    /* 저장 실패 무시 */
  }
}

/** 도감에 추가. 이미 같은 내용이 있으면 추가하지 않고 false 반환 */
export function addDiscovery(d: Discovery | null): boolean {
  if (!d || typeof window === 'undefined') return false;
  const list = loadDiscoveries();
  if (list.some((x) => norm(x.body) === norm(d.body))) return false; // 중복 방지
  save([...list, d]);
  return true;
}

/** 봇 메시지를 받아 자동으로 파싱 후 저장 (ChatWindow 에서 이것만 호출) */
export function captureDiscovery(botText: string): Discovery | null {
  const d = parseDiscovery(botText);
  if (!d) return null;
  return addDiscovery(d) ? d : null;
}

export function clearDiscoveries(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}

/** 카테고리별 묶음 (도감 화면용) */
export function groupByCategory(list: Discovery[]): Record<string, Discovery[]> {
  return list.reduce<Record<string, Discovery[]>>((acc, d) => {
    (acc[d.category] ||= []).push(d);
    return acc;
  }, {});
}
