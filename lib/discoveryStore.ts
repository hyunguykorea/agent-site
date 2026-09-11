// 파일 위치: lib/discoveryStore.ts  (기존 파일 덮어쓰기)
//
// "새 대화를 하면 도감이 사라진다" 의 진짜 원인
//   데이터는 localStorage 에 멀쩡히 남아 있었지만,
//   화면의 개수 배지/목록이 React state 에 박혀 있어서 갱신이 안 됐습니다.
//   → 저장소가 바뀔 때마다 "구독자에게 알려주는" 구조로 바꿉니다. (subscribe)
//
// 추가 안전장치
//   · 저장 실패/JSON 손상 시 기존 데이터를 날리지 않고 백업본에서 복구
//   · 다른 탭에서 추가해도 즉시 반영 (storage 이벤트)
//   · clearDiscoveries() 는 "도감 비우기" 버튼에서만 호출 (새 대화와 완전 분리)

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

/** 도감 읽기 — 본 키가 깨졌으면 백업본으로 자동 복구 */
export function loadDiscoveries(): Discovery[] {
  if (typeof window === 'undefined') return [];
  const main = readKey(KEY);
  if (main && main.length) return main;

  const backup = readKey(BACKUP_KEY);
  if (backup && backup.length) {
    // 본 키가 비었/깨졌는데 백업이 있으면 되살린다
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
    window.localStorage.setItem(BACKUP_KEY, json); // 이중 저장
  } catch {
    /* 용량 초과 등 — 기존 데이터는 그대로 둔다 */
  }
  notify();
}

/** 변경 알림 — 배지·목록이 자동으로 다시 그려진다 */
function notify(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * 도감 변경 구독. 컴포넌트에서 useEffect 로 연결하면
 * 새 대화·다른 탭·새 발견 무엇이든 자동 반영됩니다.
 */
export function subscribeDiscoveries(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', cb); // 탭 복귀 시에도 재확인
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', cb);
  };
}

/**
 * 봇 메시지에서 "발견" 항목 추출.
 *   🎉 오늘의 발견
 *   [음식]
 *   피자는 노동자들의 음식에서 시작됐다.
 */
export function parseDiscovery(raw: string): Discovery | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const catMatch = text.match(/\[([^\]]{1,20})\]/);
  const category = catMatch ? catMatch[1].trim() : '';

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const titleLine = lines.find((l) => /발견|오늘의|사실|트리비아|알아두면/.test(l)) ?? '';
  const title = titleLine
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[*_#>]/g, '')
    .trim();

  if (!category && !titleLine) return null;

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

/** 추가. 이미 같은 내용이 있으면 false */
export function addDiscovery(d: Discovery | null): boolean {
  if (!d || typeof window === 'undefined') return false;
  const list = loadDiscoveries();
  if (list.some((x) => norm(x.body) === norm(d.body))) return false;
  save([...list, d]);
  return true;
}

/** 봇 메시지를 받아 자동 파싱 후 저장 */
export function captureDiscovery(botText: string): Discovery | null {
  const d = parseDiscovery(botText);
  if (!d) return null;
  return addDiscovery(d) ? d : null;
}

export function countDiscoveries(): number {
  return loadDiscoveries().length;
}

/** ⚠️ "도감 비우기" 버튼에서만 호출하세요. 새 대화와는 무관합니다. */
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
