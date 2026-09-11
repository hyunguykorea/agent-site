// 파일 위치: lib/dlClient.ts  (기존 파일 덮어쓰기)
//
// 변경점
//  · 토큰 요청을 POST 로 보내고, 405/404 가 나면 GET 으로 자동 재시도  → "토큰 발급 실패 (405)" 해결
//  · 서버가 발급한 userId(dl_...) 를 그대로 사용  → 에코(따라하기) 차단 정확도 상승
//  · 연결 상태(connecting/ready/error) 통보  → 연결 중 입력 잠금
//  · 에코 활동 + 중복 activity id 제거

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
  send: (text: string) => Promise<void>;
  stop: () => void;
}

const DL_BASE = 'https://directline.botframework.com/v3/directline';

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

/** 화면에 그릴 가치가 있는 봇 메시지만 통과 */
export function isRenderableBotMessage(a: DLActivity, userId: string): boolean {
  if (!a) return false;
  if (a.type !== 'message') return false;
  if (isEchoActivity(a, userId)) return false;
  return !!(a.text && a.text.trim());
}

/** 토큰 발급: POST 우선, 405/404 면 GET 으로 자동 재시도 */
export async function fetchToken(
  userId: string
): Promise<{ token: string; userId: string }> {
  const tryOnce = async (method: 'POST' | 'GET') => {
    if (method === 'POST') {
      return fetch('/api/directline-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    }
    return fetch(`/api/directline-token?userId=${encodeURIComponent(userId)}`);
  };

  let res = await tryOnce('POST');
  if (res.status === 405 || res.status === 404 || res.status === 501) {
    res = await tryOnce('GET'); // 구버전 라우트 호환
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
    throw new Error(
      `토큰 발급 실패 (${res.status}) ${data?.error ?? ''} ${hint}`.trim()
    );
  }

  const token = data?.token ?? data?.Token;
  if (!token) throw new Error('토큰이 비어 있습니다. DIRECTLINE_SECRET 을 확인하세요.');
  return { token, userId: data?.userId || userId };
}

export async function connectDirectLine(opts: {
  onActivity: (a: DLActivity) => void;
  onStatus?: (s: DLStatus, message?: string) => void;
  userId?: string;
  pollMs?: number;
}): Promise<DLConnection> {
  const requestedId = opts.userId ?? makeUserId();
  const pollMs = opts.pollMs ?? 1000;
  opts.onStatus?.('connecting');

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
  const conversationId: string = conv.conversationId;

  let stopped = false;
  let watermark: string | null = null;
  const seen = new Set<string>();

  async function poll() {
    while (!stopped) {
      try {
        const url =
          `${DL_BASE}/conversations/${conversationId}/activities` +
          (watermark ? `?watermark=${encodeURIComponent(watermark)}` : '');
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const data = await r.json();
          watermark = data.watermark ?? watermark;
          const list: DLActivity[] = data.activities ?? [];
          for (const a of list) {
            if (a.id) {
              if (seen.has(a.id)) continue;
              seen.add(a.id);
            }
            if (!isRenderableBotMessage(a, userId)) continue;
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
    conversationId,
    userId,
    async send(text: string) {
      const r = await fetch(`${DL_BASE}/conversations/${conversationId}/activities`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          from: { id: userId, role: 'user' },
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
