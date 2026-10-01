import { describe, expect, it } from "vitest";
import type { ExtensionContext, SessionEntry as PiEntry } from "@earendil-works/pi-coding-agent";
import { serializeEntry } from "./serialize-entry.ts";
import { EntryTracker } from "./entry-tracker.ts";
import type { OpInput } from "../../api/src/index.ts";

const base = { id: "a", parentId: null, timestamp: "2026-01-01" };
const usage = {
  input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cacheWrite1h: 1, reasoning: 1, totalTokens: 10,
  cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10, extra: "unwanted" },
  extra: "unwanted",
};
const assistant = {
  ...base, type: "message", extra: "unwanted",
  message: {
    role: "assistant", api: "responses", provider: "openai", model: "m", timestamp: 123,
    usage, stopReason: "stop", responseId: "r", rawStopReason: "completed", thinkingLevel: "high",
    extra: "unwanted", deferred: { data: "unwanted" },
    content: [
      { type: "thinking", thinking: "reason", redacted: true, thinkingSignature: "unwanted".repeat(1000) },
      { type: "text", text: "answer", textSignature: "unwanted" },
      { type: "toolCall", id: "t", name: "read", arguments: { path: "a" }, thoughtSignature: "unwanted" },
    ],
  },
} as unknown as PiEntry;

describe("serializeEntry", () => {
  it("selects nested fields and preserves display metadata without mutating pi state", () => {
    const before = JSON.stringify(assistant);
    const result = serializeEntry(assistant);
    expect(JSON.stringify(result)).not.toContain("unwanted");
    expect(result).toMatchObject({
      ...base, message: {
        timestamp: 123, stopReason: "stop", responseId: "r", rawStopReason: "completed", thinkingLevel: "high",
        usage: { reasoning: 1, cacheWrite1h: 1, totalTokens: 10, cost: { total: 10 } },
        content: [
          { type: "thinking", thinking: "reason", redacted: true },
          { type: "text", text: "answer" },
          { type: "toolCall", id: "t", name: "read", arguments: { path: "a" } },
        ],
      },
    });
    expect(JSON.stringify(assistant)).toBe(before);
  });

  it.each([
    { type: "compaction", summary: "s", firstKeptEntryId: "a", tokensBefore: 10, usage, fromHook: true, systemMessage: { content: "unwanted" } },
    { type: "branch_summary", fromId: "a", summary: "s", usage },
    { type: "custom", customType: "extension", data: "unwanted" },
    { type: "custom_message", customType: "extension", display: true, content: [{ type: "text", text: "visible", textSignature: "unwanted" }] },
    { type: "context_edit", targetId: "a", replacement: { content: [{ type: "thinking", thinking: "visible", thinkingSignature: "unwanted" }], extra: "unwanted" } },
    { type: "message", message: { role: "toolResult", toolCallId: "t", toolName: "read", isError: false, timestamp: 1, usage,
      details: "unwanted", content: [{ type: "text", text: "visible", textSignature: "unwanted" }] } },
    { type: "message", message: { role: "custom", customType: "extension", display: true, timestamp: 1, details: "unwanted", content: "visible" } },
  ])("strips internal payloads from $type", entry => {
    const result = serializeEntry({ ...base, ...entry, details: "unwanted", extra: "unwanted" } as unknown as PiEntry);
    expect(JSON.stringify(result)).not.toContain("unwanted");
    expect(result.type).toBe(entry.type);
  });

  it("uses the whitelist for every history transport path", () => {
    const entries: PiEntry[] = [];
    const manager = {
      getEntries: () => entries,
      getBranch: () => entries,
      getLeafId: () => entries.at(-1)?.id ?? null,
    };
    const ops: OpInput[] = [];
    const tracker = new EntryTracker({ sessionManager: manager } as unknown as ExtensionContext, op => ops.push(op));
    entries.push(assistant);
    tracker.reconcile();
    const expected = { index: 0, entry: serializeEntry(assistant) };
    expect(ops[0]).toMatchObject({ op: "append", items: [expected] });
    expect(tracker.snapshot(undefined, 10).entries).toEqual([expected]);
    expect(tracker.snapshot(0, 10).entries).toEqual([expected]);
    expect(tracker.branch("a", 10).entries).toEqual([expected]);
    expect(tracker.entry("a")).toEqual(expected);
  });
});
