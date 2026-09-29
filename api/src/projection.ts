import type { SessionEntry } from "./pi.ts";
type MessageEntry = Extract<SessionEntry, { type: "message" }>;
type AssistantMessage = Extract<MessageEntry["message"], { role: "assistant" }>;
export type RedactedToolCall = {
  type: "toolCall";
  id: string;
  name: string;
  redacted: true;
  originalBytes: number;
  arguments?: Record<string, unknown>;
  changes?: { path: string; added?: number; removed?: number }[];
};
export type ProjectedAssistantEntry = Omit<MessageEntry, "message"> & {
  message: Omit<AssistantMessage, "content"> & {
    content: (AssistantMessage["content"][number] | RedactedToolCall)[];
  };
};
export interface StreamOptions {
  toolOutputBytes: number;
}
export interface RedactedEntry {
  type: "redacted";
  redacted: true;
  originalBytes: number;
  id: string;
  parentId: string | null;
  timestamp: string;
  role: "toolResult" | "bashExecution";
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  command?: string;
}
export interface ProjectedEntry {
  index: number;
  entry: SessionEntry | RedactedEntry | ProjectedAssistantEntry;
}
export const MOBILE_STREAM: StreamOptions = { toolOutputBytes: 2048 };
export const FULL_STREAM: StreamOptions = { toolOutputBytes: Number.MAX_SAFE_INTEGER };
