// 파일 위치: lib/discoveryStore.ts   (기존 파일 덮어쓰기)
//
// ★ 이번 수정의 핵심 — 별(즐겨찾기)이 안 먹던 진짜 원인
//   도감에는 파서가 잘라낸 "본문(body)"만 저장되는데,
//   말풍선 옆 ☆ 는 "원문 메시지 전체"로 비교하고 있었습니다.
//   → 두 문자열이 절대 같을 수 없어 항상 ☆(빈 별)로 보이고, 누를 때마다 중복 추가됐습니다.
//
//   해결: 저장할 때 원문 메시지의 지문(src)을 같이 기록하고,
//        별 판정은 body 가 아니라 src 로 합니다.
//
// 추가: fav(즐겨찾기) 플래그 — 별을 누르면 도감에 담기 + 즐겨찾기 ON.
//      즐겨찾기만 모아보는 탭에서 사용합니다.

export type Discovery = {
  id: string;
  category: string;
  title: string;
  body: string;
  at: number;
  fav: boolean; // ⭐ 즐겨찾기
  src: string;  // 원문 메시지 지문 (별 판정용)
};

const KEY = 'agent-site-discoveries';
const BACKUP_KEY = 'agent-site-discoveries-backup';
const EVENT = 'agent-site-discoveries-changed';

/* ────────────────── 공통 유틸 ────────────────── */

function norm(s: string) {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/[.,!?~…"'`·\-—()[\]{}<>:;]/g, '')
    .toLowerCase();
}

/** 원문 메시지 → 지문. 앞 160자만 쓰므로 뒤에 링크가 붙어도 같은 메시지로 인식 */
export function sourceKey(text: string) {
  return norm(text).slice(0, 160);
}

function uid() {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ────────────────── 저장 / 로드 ────────────────── */

function migrate(raw: any): Discovery | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = String(raw.body ?? raw.text ?? '').trim();
  if (!body) return null;
  return {
    id: String(raw.id ?? uid()),
    category: String(raw.category ?? '기타'),
    title: String(raw.title ?? '오늘의 발견'),
    body,
    at: Number(raw.at ?? Date.now()),
    fav: Boolean(raw.fav ?? false),
    // 예전 데이터엔 src 가 없으니 body 로 채워 둡니다
    src: String(raw.src ?? sourceKey(body)),
  };
}

export function loadDiscoveries(): Discovery[] {
  if (typeof window === 'undefined') return [];
  const read = (k: string): Discovery[] | null => {
    try {
      const raw = window.localStorage.getItem(k);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      return arr.map(migrate).filter(Boolean) as Discovery[];
    } catch {
      return null;
    }
  };
  // 본 데이터가 깨졌으면 백업으로 자동 복구
  return read(KEY) ?? read(BACKUP_KEY) ?? [];
}

function save(list: Discovery[]) {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(list.slice(-300));
  try {
    window.localStorage.setItem(KEY, json);
    window.localStorage.setItem(BACKUP_KEY, json);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

/** 도감이 바뀔 때마다 콜백 실행 (같은 탭·다른 탭·창 복귀 모두 감지) */
export function subscribeDiscoveries(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb as EventListener);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', cb);
  return () => {
    window.removeEventListener(EVENT, cb as EventListener);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', cb);
  };
}

export function countDiscoveries() {
  return loadDiscoveries().length;
}
export function loadFavorites() {
  return loadDiscoveries().filter((d) => d.fav);
}
export function countFavorites() {
  return loadFavorites().length;
}
export function clearDiscoveries() {
  save([]);
}

/* ────────────────── 시스템/메타 메시지 판별 ────────────────── */
// Copilot Studio 내장 메모리 기능이 영어로 내보내는 안내문 등은
// 화면·도감·TTS 어디에도 넣지 않습니다.

const SYSTEM_PATTERNS: RegExp[] = [
  /manage your memories/i,
  /copilotstudio\.microsoft\.com/i,
  /i'?ll (check|look up|search|review)\b/i,
  /let me (check|look up|search)\b/i,
  /^(searching|thinking|working on it|one moment)\b/i,
  /your (discovery log|memories|memory)/i,
  /\/environments\/[A-Za-z0-9-]+\/agents\//i,
];

export function isSystemMessage(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  if (SYSTEM_PATTERNS.some((re) => re.test(t))) return true;
  // 링크/괄호를 걷어내면 남는 게 거의 없는 메시지
  const stripped = t
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[()[\]{}]/g, '')
    .trim();
  if (stripped.length < 4) return true;
  // 한글이 하나도 없고 전부 영어인 짧은 안내문
  if (!/[가-힣]/.test(stripped) && stripped.length < 80) return true;
  return false;
}

/* ────────────────── 발견 파싱 ────────────────── */

const CATEGORY_HINTS: Array<[string, RegExp]> = [
  ['음식', /(음식|요리|피자|파스타|빵|커피|라면|김치|맛|식재료|디저트|레시피)/],
  ['우주', /(우주|행성|별|은하|블랙홀|천문|위성|화성|태양)/],
  ['역사', /(역사|시대|왕|조선|전쟁|고대|중세|유적|유래|기원)/],
  ['동물', /(동물|고양이|강아지|새|물고기|곤충|포유류|생물)/],
  ['과학', /(과학|물리|화학|실험|에너지|분자|세포|기술|AI|인공지능)/],
  ['문화', /(문화|영화|음악|미술|책|축제|전통|언어|예술)/],
  ['건강', /(건강|운동|수면|영양|스트레스|면역|질병|비타민)/],
  ['경제', /(환율|주가|금리|경제|물가|달러|증시|투자|시장)/],
];

export function guessCategory(text: string): string {
  for (const [name, re] of CATEGORY_HINTS) if (re.test(text)) return name;
  return '기타';
}

/** TTS/도감 본문용 정리 — 링크·이모지·대괄호 태그 제거 */
function cleanBody(text: string): string {
  return (text || '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '') // [라벨](링크)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/^\s*\[[^\]]{1,12}\]\s*/gm, '') // 줄머리 [카테고리]
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const FACT_ENDING = /(다|야|래|죠|지|어|요|었어|했어|입니다|이다|이야)[.!]?$/;

/**
 * 에이전트 응답에서 "발견"을 추출합니다.
 * 태그가 없어도 사실을 설명하는 문장이면 통과시킵니다. (예전엔 너무 엄격했음)
 */
export function parseDiscovery(
  raw: string
): { category: string; title: string; body: string } | null {
  const text = (raw || '').trim();
  if (!text || isSystemMessage(text)) return null;

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // 1) [카테고리] 태그가 있으면 그대로 사용
  let category = '';
  let title = '';
  const bodyLines: string[] = [];

  for (const line of lines) {
    const tag = line.match(/^\[([^\]]{1,12})\]$/);
    if (tag && !category) {
      category = tag[1].trim();
      continue;
    }
    if (!title && /^([🎉🍕✨🔎📖🌟]|오늘의|한입|발견)/.test(line) && line.length <= 24) {
      title = cleanBody(line) || '오늘의 발견';
      continue;
    }
    bodyLines.push(line);
  }

  const body = cleanBody(bodyLines.join('\n'));
  if (body.length < 10) return null;

  // 2) 질문만 있는 응답은 발견이 아님
  const onlyQuestion = /[?？]\s*$/.test(body) && !FACT_ENDING.test(body.replace(/[?？]\s*$/, ''));
  if (onlyQuestion) return null;

  return {
    category: category || guessCategory(body),
    title: title || '오늘의 발견',
    body,
  };
}

/* ────────────────── 조회 / 추가 / 삭제 ────────────────── */

/** 원문 메시지로 도감 항목 찾기 (src 우선, 없으면 본문 포함관계로) */
export function findBySource(text: string): Discovery | undefined {
  const key = sourceKey(text);
  const n = norm(text);
  const list = loadDiscoveries();
  return (
    list.find((d) => d.src === key) ||
    list.find((d) => {
      const b = norm(d.body);
      return b.length > 8 && (n.includes(b) || b.includes(n));
    })
  );
}

export function hasDiscovery(text: string): boolean {
  return !!findBySource(text);
}

/** 자동 수집 — 에이전트 응답이 올 때 호출 */
export function captureDiscovery(raw: string): Discovery | null {
  const parsed = parseDiscovery(raw);
  if (!parsed) return null;
  if (findBySource(raw)) return null; // 중복 방지

  const item: Discovery = {
    id: uid(),
    ...parsed,
    at: Date.now(),
    fav: false,
    src: sourceKey(raw),
  };
  save([...loadDiscoveries(), item]);
  return item;
}

/** 수동 담기 — 파서가 놓친 것도 강제로 담습니다 */
export function addManual(raw: string): Discovery | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const exist = findBySource(text);
  if (exist) return exist;

  const parsed = parseDiscovery(text);
  const body = parsed?.body || cleanBody(text);
  if (body.length < 2) return null;

  const item: Discovery = {
    id: uid(),
    category: parsed?.category || guessCategory(body),
    title: parsed?.title || '오늘의 발견',
    body,
    at: Date.now(),
    fav: false,
    src: sourceKey(text),
  };
  save([...loadDiscoveries(), item]);
  return item;
}

export function removeDiscovery(id: string) {
  save(loadDiscoveries().filter((d) => d.id !== id));
}

export function setFav(id: string, fav: boolean) {
  save(loadDiscoveries().map((d) => (d.id === id ? { ...d, fav } : d)));
}

export function toggleFav(id: string) {
  const cur = loadDiscoveries().find((d) => d.id === id);
  if (cur) setFav(id, !cur.fav);
}

/** 말풍선이 즐겨찾기 상태인지 */
export function isStarred(text: string): boolean {
  return !!findBySource(text)?.fav;
}

/**
 * 말풍선 옆 ☆ 버튼 동작.
 *  · 도감에 없으면 → 담고 즐겨찾기 ON
 *  · 있는데 즐겨찾기 OFF → ON
 *  · 즐겨찾기 ON → OFF (도감에는 그대로 남습니다)
 */
export function toggleStarByMessage(
  text: string
): { action: 'added' | 'faved' | 'unfaved' | 'none'; item?: Discovery } {
  const exist = findBySource(text);
  if (!exist) {
    const item = addManual(text);
    if (!item) return { action: 'none' };
    setFav(item.id, true);
    return { action: 'added', item: { ...item, fav: true } };
  }
  const next = !exist.fav;
  setFav(exist.id, next);
  return { action: next ? 'faved' : 'unfaved', item: { ...exist, fav: next } };
}
