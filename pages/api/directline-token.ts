import type { NextApiRequest, NextApiResponse } from "next";

/**
 * 목적: Direct Line Secret을 브라우저에 노출하지 않고 수명이 짧은 토큰만 내려준다.
 * 호출: POST /api/directline-token  ->  { token, expires_in }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 허용됩니다." });
  }

  const secret = process.env.DIRECTLINE_SECRET;
  if (!secret) {
    return res
      .status(500)
      .json({ error: "DIRECTLINE_SECRET 환경변수가 설정되지 않았습니다." });
  }

  try {
    const r = await fetch(
      "https://directline.botframework.com/v3/directline/tokens/generate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user: { id: `dl_${Math.random().toString(36).slice(2)}`, name: "web-user" }
        })
      }
    );

    if (!r.ok) {
      const detail = await r.text();
      return res
        .status(r.status)
        .json({ error: "Direct Line 토큰 발급 실패", detail });
    }

    const data = (await r.json()) as { token: string; expires_in: number };
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: "네트워크 오류", detail: String(e) });
  }
}
