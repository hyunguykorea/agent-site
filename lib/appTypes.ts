export type Role = "user" | "agent";

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  at: number;
}

export interface HistoryItem {
  id: string;
  question: string;
  answer: string;
  at: number;
}
