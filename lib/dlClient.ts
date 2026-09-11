/**
 * Copilot Studio 에이전트(Direct Line 채널) 클라이언트
 * 서버에서 토큰만 받고, 대화 생성 / 전송 / 응답 폴링은 브라우저에서 처리한다.
 */

const DL = "https://directline.botframework.com/v3/directline";

export interface DLActivity {
  id: string;
  type: string;
  text?: string;
  from: { id: string; name?: string };
  timestamp?: string;
}

export class DirectLineClient {
  private token = "";
  private conversationId = "";
  private watermark: string | null = null;
  private userId = `user_${Math.random().toString(36).slice(2)}`;

  async start(): Promise<void> {
    const tokenRes = await fetch("/api/directline-token", { method: "POST" });
    if (!tokenRes.ok) {
      const err = (await tokenRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "토큰 발급 실패");
    }
    const { token } = (await tokenRes.json()) as { token: string };
    this.token = token;

    const convRes = await fetch(`${DL}/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!convRes.ok) throw new Error("대화 생성 실패");

    const conv = (await convRes.json()) as { conversationId: string };
    this.conversationId = conv.conversationId;
    this.watermark = null;

    await this.sendEvent("startConversation");
  }

  get ready() {
    return Boolean(this.token && this.conversationId);
  }

  private post(activity: Record<string, unknown>) {
    return fetch(`${DL}/conversations/${this.conversationId}/activities`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(activity)
    });
  }

  async sendEvent(name: string) {
    await this.post({
      type: "event",
      name,
      from: { id: this.userId, name: "web-user" },
      value: ""
    });
  }

  async sendMessage(text: string) {
    const res = await this.post({
      type: "message",
      text,
      from: { id: this.userId, name: "web-user" }
    });
    if (!res.ok) throw new Error("메시지 전송 실패");
  }

  async poll(): Promise<DLActivity[]> {
    const url = `${DL}/conversations/${this.conversationId}/activities${
      this.watermark ? `?watermark=${this.watermark}` : ""
    }`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { activities: DLActivity[]; watermark: string };
    this.watermark = data.watermark ?? this.watermark;

    return (data.activities || []).filter(
      (a) => a.type === "message" && a.from?.id !== this.userId && a.text
    );
  }

  async waitForReply(timeoutMs = 20000, intervalMs = 900): Promise<DLActivity[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const acts = await this.poll();
      if (acts.length > 0) return acts;
    }
    return [];
  }
}
