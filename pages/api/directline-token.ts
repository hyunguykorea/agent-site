// 파일 위치: pages/api/directline-token.ts  (기존 파일 덮어쓰기)
//
// 405 오류의 원인:
//   기존 라우트가 POST(또는 GET) 한쪽만 허용하고 있는데
//   클라이언트가 반대쪽 메서드로 호출해서 "Method Not Allowed(405)" 가 났습니다.
//   → 이 파일은 GET·POST 를 모두 허용합니다. (어느 쪽으로 불러도 동작)
//
// 추가 개선:
//   Direct Line 토큰을 "특정 사용자 ID" 로 발급받습니다.
//   이렇게 하면 서버가 내 메시지를 그 ID 로 표시해 주므로 에코(따라하기) 차단이 더 확실해집니다.
//   ※ Direct Line 규칙: 사용자 ID 는 반드시 "dl_" 로 시작해야 합니다.

import type { NextApiRequest, NextApiResponse } from 'next';

const TOKEN_URL = 'https://directline.botframework.com/v3/directline/tokens/generate';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET · POST 둘 다 허용 (405 방지)
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
  }

  const secret = process.env.DIRECTLINE_SECRET;
  if (!secret || secret.includes('여기에')) {
    return res.status(500).json({
      error:
        'DIRECTLINE_SECRET 환경변수가 설정되지 않았습니다. .env.local 작성 후 dev 서버를 재시작하세요. (Vercel은 Redeploy)',
    });
  }

  // 사용자 ID: 쿼리스트링(GET) 또는 body(POST) 에서 받고, 없으면 서버가 생성
  const rawUserId =
    (typeof req.query.userId === 'string' && req.query.userId) ||
    (req.body && typeof req.body === 'object' && (req.body as any).userId) ||
    '';
  const userId =
    typeof rawUserId === 'string' && rawUserId.startsWith('dl_')
      ? rawUserId
      : 'dl_' + Math.random().toString(36).slice(2, 12);

  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user: { id: userId } }),
    });

    const raw = await r.text();

    if (!r.ok) {
      // 401/403 = 시크릿 오타 또는 미게시
      return res.status(r.status).json({
        error: `Direct Line 토큰 발급 실패 (${r.status})`,
        detail: raw.slice(0, 300),
      });
    }

    const data = JSON.parse(raw);
    const token = data.token ?? data.Token;
    if (!token) {
      return res.status(502).json({ error: '토큰이 응답에 없습니다.', detail: raw.slice(0, 300) });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      token,
      userId,
      conversationId: data.conversationId ?? null,
      expires_in: data.expires_in ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ error: '토큰 발급 중 오류', detail: String(e?.message || e) });
  }
}
