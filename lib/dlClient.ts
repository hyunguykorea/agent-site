// 파일 위치: lib/dlClient.ts  (기존 파일 덮어쓰기)
//
// 이번 변경점: 대화 이어가기(resume)
//   기존에는 /chat 에 들어올 때마다 새 대화를 만들어서, 탭을 나갔다 오면
//   에이전트 입장에서도 "처음 만난 사람"이 됐습니다.
//   → conversationId / token / watermark 를 sessionStorage 에 저장해 두고
//     돌아왔을 때 같은 대화를 이어갑니다. (탭을 완전히 닫으면 새 대화)
//
// 유지되는 기능: GET/POST 토큰 폴백(405 방지), 에코 차단, 중복 activity 제거

export type DLActivity = {
  id?: string;
  type?: string;
  text?: string;
  timestamp?: string;
  from?: { id?: string; name?: string; role?: string };
};

export type DLStatus = 'connecting' | 'ready' | 'error';

export interface DLConnection {
  conversationId: string;
  userId: string;
  resumed: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
}

const DL_BASE = 'https://directline.botframework.com/v3/directline';
const SESSION_KEY = 'agent-site-dl-session';

type Session = {
  token: string;
  conversationId: string;
  userId: string;
  watermark: string | null;
  createdAt: number;
};

function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    // Direct Line 토큰 수명은 약 30분 → 25분 지나면 새로 만든다
    if (!s.token || !s.conversationId) return null;
    if (Date.now() - s.createdAt > 25 * 60 * 1000) return null;
    return s;
  } catch {
    return null;
  }
}

function saveSession(s: Session): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_KEY);
}

/** Direct Line 규칙상 사용자 ID 는 "dl_" 로 시작해야 합니다. */
export function makeUserId(): string {
  return 'dl_' + Math.random().toString(36).slice(2, 12);
}

/** 내가 보낸 말이 다시 내려온 것(에코)인지 판별 */
export function isEchoActivity(a: DLActivity, userId: string): boolean {
  const fromId = a?.from?.id ?? '';
  const role = (a?.from?.role ?? '').toLowerCase();
  if (!fromId && !role) return false;
  if (role === 'user') return true;
  if (fromId === userId) return true;
  if (fromId.startsWith('dl_') || fromId.startsWith('user-')) return true;
  return false;
}

export function isRenderableBotMessage(a: DLActivity, userId: string): boolean {
  if (!a) return false;
  if (a.type !== 'message') return false;
  if (isEchoActivity(a, userId)) return false;
  return !!(a.text && a.text.trim());
}

/** 토큰 발급: POST 우선, 405/404 면 GET 으로 자동 재시도 */
export async function fetchToken(userId: string): Promise<{ token: string; userId: string }> {
  const tryOnce = (method: 'POST' | 'GET') =>
    method === 'POST'
      ? fetch('/api/directline-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
      : fetch(`/api/directline-token?userId=${encodeURIComponent(userId)}`);

  let res = await tryOnce('POST');
  if (res.status === 405 || res.status === 404 || res.status === 501) {
    res = await tryOnce('GET');
  }

  const raw = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(raw);
  } catch {
    /* HTML 오류 페이지 등 */
  }

  if (!res.ok) {
    const hint =
      res.status === 405
        ? 'pages/api/directline-token.ts 가 GET/POST 를 모두 허용하는지 확인하세요.'
        : res.status === 401 || res.status === 403
        ? 'DIRECTLINE_SECRET 오타 또는 에이전트 미게시일 수 있습니다.'
        : res.status === 404
        ? '파일 경로가 pages/api/directline-token.ts 인지 확인하세요.'
        : '';
    throw new Error(`토큰 발급 실패 (${res.status}) ${data?.error ?? ''} ${hint}`.trim());
  }

  const token = data?.token ?? data?.Token;
  if (!token) throw new Error('토큰이 비어 있습니다. DIRECTLINE_SECRET 을 확인하세요.');
  return { token, userId: data?.userId || userId };
}

/** 저장된 세션이 아직 살아있는지 확인 */
async function isSessionAlive(s: Session): Promise<boolean> {
  try {
    const r = await fetch(`${DL_BASE}/conversations/${s.conversationId}/activities?watermark=${s.watermark ?? ''}`, {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function connectDirectLine(opts: {
  onActivity: (a: DLActivity) => void;
  onStatus?: (s: DLStatus, message?: string) => void;
  userId?: string;
  pollMs?: number;
  /** true 면 저장된 대화를 무시하고 새 대화를 시작 ("새 대화" 버튼용) */
  forceNew?: boolean;
}): Promise<DLConnection> {
  const pollMs = opts.pollMs ?? 1000;
  opts.onStatus?.('connecting');

  let session = opts.forceNew ? null : loadSession();
  let resumed = false;

  if (session && (await isSessionAlive(session))) {
    // 이전 대화 이어가기 — 이미 화면에 그린 메시지를 다시 받지 않도록 watermark 유지
    resumed = true;
  } else {
    session = null;
    clearSession();
  }

  if (!session) {
    const requestedId = opts.userId ?? makeUserId();
    const { token, userId } = await fetchToken(requestedId);

    const convRes = await fetch(`${DL_BASE}/conversations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!convRes.ok) {
      const msg = `대화 생성 실패 (${convRes.status})`;
      opts.onStatus?.('error', msg);
      throw new Error(msg);
    }
    const conv = await convRes.json();
    session = {
      token,
      conversationId: conv.conversationId,
      userId,
      watermark: null,
      createdAt: Date.now(),
    };
    saveSession(session);
  }

  const s = session;
  let stopped = false;
  const seen = new Set<string>();

  async function poll() {
    while (!stopped) {
      try {
        const url =
          `${DL_BASE}/conversations/${s.conversationId}/activities` +
          (s.watermark ? `?watermark=${encodeURIComponent(s.watermark)}` : '');
        const r = await fetch(url, { headers: { Authorization: `Bearer ${s.token}` } });
        if (r.ok) {
          const data = await r.json();
          if (data.watermark) {
            s.watermark = String(data.watermark);
            saveSession(s); // 어디까지 읽었는지 기억 → 재방문 시 중복 출력 방지
          }
          const list: DLActivity[] = data.activities ?? [];
          for (const a of list) {
            if (a.id) {
              if (seen.has(a.id)) continue;
              seen.add(a.id);
            }
            if (!isRenderableBotMessage(a, s.userId)) continue;
            opts.onActivity(a);
          }
        }
      } catch {
        /* 일시 오류는 무시하고 다음 폴링 */
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  poll();
  opts.onStatus?.('ready');

  return {
    conversationId: s.conversationId,
    userId: s.userId,
    resumed,
    async send(text: string) {
      const r = await fetch(`${DL_BASE}/conversations/${s.conversationId}/activities`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          from: { id: s.userId, role: 'user' },
          text,
          locale: 'ko-KR',
        }),
      });
      if (!r.ok) throw new Error(`메시지 전송 실패 (${r.status})`);
    },
    stop() {
      stopped = true;
    },
  };
}
