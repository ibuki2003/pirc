import type { SessionEntry as PiEntry } from "@earendil-works/pi-coding-agent";
import type { Content, Message, SessionEntry, Usage } from "../../api/src/index.ts";

// Select fields rather than spreading pi objects: structural typing does not strip extra properties.
function pick<T, K extends keyof T>(value: T, ...keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]])) as Pick<T, K>;
}

function usage(value: Usage): Usage {
  return {
    ...pick(value, "input", "output", "cacheRead", "cacheWrite", "cacheWrite1h", "reasoning", "totalTokens"),
    cost: pick(value.cost, "input", "output", "cacheRead", "cacheWrite", "total"),
  };
}

function content<T extends Content>(value: T): T {
  const block: Content = value;
  switch (block.type) {
    case "text": return pick(block, "type", "text") as T;
    case "thinking": return pick(block, "type", "thinking", "redacted") as T;
    case "image": return pick(block, "type", "data", "mimeType") as T;
    // Arguments are the tool's own payload, not pi metadata.
    case "toolCall": return pick(block, "type", "id", "name", "arguments", "namespace") as T;
  }
}

function serializeContent<T extends Content>(value: string | T[]): string | T[] {
  return typeof value === "string" ? value : value.map(content);
}

function message(value: PiEntry & { type: "message" }): Message {
  const m = value.message;
  const base = pick(m, "role", "timestamp");
  switch (m.role) {
    case "assistant": return {
      ...base, ...pick(m, "role", "api", "provider", "model", "responseModel", "responseId", "providerThinkingLevel",
        "stopReason", "errorMessage", "rawStopReason", "endTurn"),
      // Older pi versions persisted this under thinkingLevel.
      ...pick(m as typeof m & { thinkingLevel?: string }, "thinkingLevel"),
      content: m.content.map(content), usage: usage(m.usage),
    };
    case "user": return { ...base, role: m.role, content: serializeContent(m.content) };
    case "system": return { ...base, ...pick(m, "role", "sections"), content: serializeContent(m.content) };
    case "toolResult": return {
      ...base, ...pick(m, "role", "toolCallId", "toolName", "isError"), content: m.content.map(content),
      ...(m.usage ? { usage: usage(m.usage) } : {}),
    };
    case "bashExecution": return { ...base, ...pick(m, "role", "command", "output", "exitCode", "cancelled",
      "truncated", "fullOutputPath", "excludeFromContext") };
    case "custom": return { ...base, ...pick(m, "role", "customType", "display"), content: serializeContent(m.content) };
    case "branchSummary": return { ...base, ...pick(m, "role", "summary", "fromId") };
    case "compactionSummary": return { ...base, ...pick(m, "role", "summary", "tokensBefore") };
  }
}

export function serializeEntry(entry: PiEntry): SessionEntry {
  const base = pick(entry, "id", "parentId", "timestamp");
  switch (entry.type) {
    case "message": return { ...base, type: entry.type, message: message(entry) };
    case "thinking_level_change": return { ...base, ...pick(entry, "type", "thinkingLevel") };
    case "model_change": return { ...base, ...pick(entry, "type", "provider", "modelId") };
    case "usage": return { ...base, ...pick(entry, "type", "kind", "provider", "model", "note"), usage: usage(entry.usage) };
    case "compaction": return { ...base, ...pick(entry, "type", "summary", "firstKeptEntryId", "tokensBefore", "fromHook"),
      ...(entry.usage ? { usage: usage(entry.usage) } : {}) };
    case "branch_summary": return { ...base, ...pick(entry, "type", "fromId", "summary", "fromHook"),
      ...(entry.usage ? { usage: usage(entry.usage) } : {}) };
    case "custom": return { ...base, ...pick(entry, "type", "customType") };
    case "custom_message": return { ...base, ...pick(entry, "type", "customType", "display"), content: serializeContent(entry.content) };
    case "context_edit": return { ...base, ...pick(entry, "type", "targetId"),
      replacement: entry.replacement && { content: serializeContent<Content>(entry.replacement.content) } };
    case "label": return { ...base, ...pick(entry, "type", "targetId", "label") };
    case "session_info": return { ...base, ...pick(entry, "type", "name") };
  }
}
