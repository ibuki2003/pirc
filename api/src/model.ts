import type { ThinkingLevel } from "./pi.ts";

export interface ModelRef {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}
export interface SessionState {
  instanceId: string;
  hostId: string;
  hostname: string;
  piVersion: string;
  sessionId: string;
  sessionFile?: string;
  cwd: string;
  name?: string;
  model?: ModelRef;
  thinkingLevel?: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  status: {
    streaming: boolean;
    compacting: boolean;
    pendingMessages: boolean;
    uiPrompt?: { kind: "select" | "confirm" | "input" | "editor" | "custom"; title?: string };
  };
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}
export interface SessionSummary extends Pick<SessionState, "instanceId" | "hostId" | "hostname" | "sessionId" | "cwd" | "name" | "model" | "status"> {
  connectedAt: string;
  lastActivityAt: string;
  entryCount: number;
  lastUserText?: string;
}
export interface Notice {
  level: "info" | "warning" | "error";
  message: string;
  requestId?: string;
}
export interface LiveMessage {
  provider: string;
  model: string;
  startedAt: number;
  content: LiveBlock[];
}
export type LiveBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments?: Record<string, unknown>;
      changes?: import("./projection.ts").RedactedToolCall["changes"] };
export interface ToolProgress {
  toolName: string;
  command?: string;
  startedAt: number;
  output: string;
  totalBytes: number;
  truncatedHead: boolean;
}
