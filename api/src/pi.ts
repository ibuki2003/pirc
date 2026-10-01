export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
export type TextContent = { type: "text"; text: string };
export type Content = TextContent | ImageContent
  | { type: "thinking"; thinking: string; redacted?: boolean }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown>; namespace?: string };
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  reasoning?: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}
export type Message =
  | { role: "system"; content: string | TextContent[]; sections?: Record<string, string | null>; timestamp: number }
  | { role: "user"; content: string | (TextContent | ImageContent)[]; timestamp: number }
  | { role: "assistant"; content: Exclude<Content, ImageContent>[]; api: string; provider: string; model: string;
      responseModel?: string; responseId?: string; providerThinkingLevel?: string; thinkingLevel?: string;
      usage: Usage; stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred";
      errorMessage?: string; rawStopReason?: string; endTurn?: boolean; timestamp: number }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: (TextContent | ImageContent)[];
      usage?: Usage; isError: boolean; timestamp: number }
  | { role: "bashExecution"; command: string; output: string; exitCode: number | undefined; cancelled: boolean;
      truncated: boolean; fullOutputPath?: string; excludeFromContext?: boolean; timestamp: number }
  | { role: "custom"; customType: string; content: string | (TextContent | ImageContent)[]; display: boolean; timestamp: number }
  | { role: "branchSummary"; summary: string; fromId: string | null; timestamp: number }
  | { role: "compactionSummary"; summary: string; tokensBefore: number; timestamp: number };
export type SessionEntry = {
  id: string;
  parentId: string | null;
  timestamp: string;
} & (
  | { type: "message"; message: Message }
  | { type: "thinking_level_change"; thinkingLevel: string }
  | { type: "model_change"; provider: string; modelId: string }
  | { type: "usage"; kind: string; provider: string; model: string; usage: Usage; note?: string }
  | { type: "compaction"; summary: string; firstKeptEntryId: string; tokensBefore: number; usage?: Usage; fromHook?: boolean }
  | { type: "branch_summary"; fromId: string; summary: string; usage?: Usage; fromHook?: boolean }
  | { type: "custom"; customType: string }
  | { type: "custom_message"; customType: string; content: string | (TextContent | ImageContent)[]; display: boolean }
  | { type: "context_edit"; targetId: string; replacement: { content: string | Content[] } | null }
  | { type: "label"; targetId: string; label: string | undefined }
  | { type: "session_info"; name?: string }
);
export interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
  labelTimestamp?: string;
}
