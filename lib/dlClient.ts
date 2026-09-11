// 파일 위치: lib/dlClient.ts  (기존 파일 덮어쓰기)
// 목적
//  1) Direct Line 연결 상태(connecting / ready / error)를 밖으로 알려준다  → 연결 중 입력 잠금
//  2) 내가 보낸 메시지가 다시 내려오는 "에코 활동"을 여기서 전부 걸러낸다  → 봇이 말 따라하는 문제 해결
//  3) 중복 activity id 제거 + watermark 폴링

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

/** 사용자 고유 ID (에코 판별의 기준값) */
export function makeUserId(): string {
  return 'user-' + Math.random().toString(36).slice(2, 10);
}

/**
 * 에코(내가 보낸 말) 판별.
 * Direct Line 은 내가 POST 한 activity 를 그대로 다시 내려주기 때문에
 * 이걸 안 거르면 화면에 "봇이 내 말을 따라하는" 것처럼 보인다.
 */
export function isEchoActivity(a: DLActivity, userId: string): boolean {
  const fromId = a?.from?.id ?? '';
  const role = (a?.from?.role ?? '').toLowerCase();
  if (!fromId && !role) return false;
  if (role === 'user') return true;
  if (fromId === userId) return true;
  // 탭을 새로 열어 userId 가 바뀐 경우까지 방어
  if (fromId.startsWith('user-') || fromId.startsWith('dl_')) return true;
  return false;
}

/** 화면에 그릴 가치가 있는 봇 메시지만 통과 */
export function isRenderableBotMessage(a: DLActivity, userId: string): boolean {
  if (!a) return false;
  if (a.type !== 'message') return false;
  if (isEchoActivity(a, userId)) return false;
  return !!(a.text && a.text.trim());
}

async function getToken(): Promise<string> {
  const res = await fetch('/api/directline-token');
  if (!res.ok) throw new Error(`토큰 발급 실패 (${res.status})`);
  const data = await res.json();
  const token = data?.token ?? data?.Token;
  if (!token) throw new Error('토큰이 비어 있습니다. DIRECTLINE_SECRET 을 확인하세요.');
  return token as string;
}

/**
 * 대화 시작 + 폴링 시작.
 * onStatus 로 connecting → ready 를 알려주므로 UI 에서 입력창을 잠글 수 있다.
 */
export async function connectDirectLine(opts: {
  onActivity: (a: DLActivity) => void;
  onStatus?: (s: DLStatus, message?: string) => void;
  userId?: string;
  pollMs?: number;
}): Promise<DLConnection> {
  const userId = opts.userId ?? makeUserId();
  const pollMs = opts.pollMs ?? 1000;
  opts.onStatus?.('connecting');

  const token = await getToken();

  const convRes = await fetch(`${DL_BASE}/conversations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!convRes.ok) {
    opts.onStatus?.('error', `대화 생성 실패 (${convRes.status})`);
    throw new Error(`대화 생성 실패 (${convRes.status})`);
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
              if (seen.has(a.id)) continue; // 중복 방지
              seen.add(a.id);
            }
            if (!isRenderableBotMessage(a, userId)) continue; // 에코 차단
            opts.onActivity(a);
          }
        }
      } catch {
        /* 네트워크 일시 오류는 무시하고 다음 폴링 */
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  // 인사(conversationUpdate) 메시지를 받기 위해 폴링부터 시작
  poll();
  opts.onStatus?.('ready');

  return {
    conversationId,
    userId,
    async send(text: string) {
      const r = await fetch(`${DL_BASE}/conversations/${conversationId}/activities`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
