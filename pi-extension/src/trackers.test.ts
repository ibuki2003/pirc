import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, MessageStartEvent, MessageUpdateEvent, ToolExecutionStartEvent, ToolExecutionUpdateEvent, ToolExecutionEndEvent } from "@earendil-works/pi-coding-agent";
import type { OpInput, SyncOp } from "../../api/src/index.ts";
import { EntryTracker } from "./entry-tracker.ts";
import { LiveTracker } from "./live-tracker.ts";
import { Outbox } from "./outbox.ts";
import { StateTracker } from "./state-tracker.ts";

describe("StateTracker preview", () => {
  it("reads the last user or assistant on the active branch and updates after navigation", () => {
    const user = { type: "message", message: { role: "user", content: "質問\nです" } };
    const assistant = { type: "message", message: { role: "assistant", content: [
      { type: "thinking", thinking: "hidden" }, { type: "text", text: "回答" },
    ] } };
    let branch = [user, assistant, { type: "message", message: { role: "toolResult", content: "tool" } }];
    const ctx = {
      cwd: "/repo", getContextUsage: () => undefined, isIdle: () => true, hasPendingMessages: () => false,
      sessionManager: { getBranch: () => branch, getSessionId: () => "s", getSessionFile: () => undefined },
    } as unknown as ExtensionContext;
    const pi = { getSessionName: () => undefined, getThinkingLevel: () => "off" } as unknown as ExtensionAPI;
    const ops: OpInput[] = [];
    const tracker = new StateTracker(pi, ctx, { instanceId: "i", hostId: "h", hostname: "host", piVersion: "" }, op => ops.push(op));
    expect(tracker.get().messagePreview).toEqual({ role: "assistant", text: "回答" });
    branch = [user];
    tracker.diff();
    expect(ops[0]).toMatchObject({ target: "state", value: { messagePreview: { role: "user", text: "質問 です" } } });
    branch = [];
    expect(tracker.get().messagePreview).toBeUndefined();
  });
});

describe("Outbox", () => {
  it("coalesces adjacent live deltas and retains a continuous sequence", () => {
    vi.useFakeTimers();
    try {
      const batches: SyncOp[][] = [];
      const box = new Outbox(7, () => {}, ops => batches.push(ops));
      box.push({ op: "set", target: "live.content", index: 0, value: { type: "text", text: "" } });
      box.push({ op: "append", target: "live.content", index: 0, text: "a" });
      box.push({ op: "append", target: "live.content", index: 0, text: "b" });
      vi.advanceTimersByTime(100);
      expect(batches).toEqual([[{ seq: 8, op: "set", target: "live.content", index: 0, value: { type: "text", text: "ab" } }]]);
      box.push({ op: "set", target: "leaf", value: "a" });
      box.flush();
      expect(box.sequence).toBe(9);
      expect(batches[1]?.[0]?.seq).toBe(9);
    } finally { vi.useRealTimers(); }
  });
});

describe("EntryTracker", () => {
  it("sends appended entries and a separately navigated leaf; full snapshots follow the active branch", () => {
    const entries = [
      { id: "a", parentId: null, type: "custom", timestamp: "" },
      { id: "b", parentId: "a", type: "custom", timestamp: "" },
    ];
    let leaf = "a";
    const manager = {
      getEntries: () => [...entries],
      getLeafId: () => leaf,
      getBranch: (id = leaf) => id === "b" ? [...entries] : entries.slice(0, 1),
    };
    const ops: OpInput[] = [];
    const tracker = new EntryTracker({ sessionManager: manager } as unknown as ExtensionContext, op => ops.push(op));
    leaf = "b";
    tracker.reconcile();
    expect(ops).toEqual([{ op: "set", target: "leaf", value: "b" }]);
    entries.push({ id: "c", parentId: "b", type: "custom", timestamp: "" });
    leaf = "c";
    tracker.reconcile();
    expect(ops[1]).toMatchObject({ op: "append", target: "entries", from: 2, items: [{ index: 2, entry: entries[2] }] });
    expect(tracker.snapshot(2, 1)).toMatchObject({ mode: "delta", entryCount: 3, entries: [{ index: 2 }] });
  });
});

describe("LiveTracker", () => {
  it("retains running output beyond the mobile projection limit for expanded viewers", () => {
    const tracker = new LiveTracker(() => {});
    tracker.toolStart({ toolCallId: "bash", toolName: "bash", args: {} } as ToolExecutionStartEvent);
    const output = "output\n".repeat(3000);
    tracker.toolUpdate({ toolCallId: "bash", partialResult: { content: [{ type: "text", text: output }] } } as ToolExecutionUpdateEvent);
    expect(tracker.snapshot().tools.bash).toMatchObject({
      output, totalBytes: Buffer.byteLength(output), truncatedHead: false,
    });
  });
  it("publishes bash duration once at completion and retains it independently of progress", () => {
    vi.useFakeTimers();
    try {
      const ops: OpInput[] = [];
      const durations = new Map<string, number>();
      const tracker = new LiveTracker(op => ops.push(op), durations);
      tracker.toolStart({ toolCallId: "bash", toolName: "bash", args: {} } as ToolExecutionStartEvent);
      vi.advanceTimersByTime(2500);
      expect(ops).toHaveLength(2);
      expect(ops[0]).toEqual({ op: "set", target: "call", key: "bash",
        value: { type: "toolCall", id: "bash", name: "bash", arguments: {} } });
      tracker.toolEnd({ toolCallId: "bash" } as ToolExecutionEndEvent);
      expect(ops.slice(2)).toEqual([
        { op: "set", target: "toolDuration", key: "bash", value: 2500 },
        { op: "set", target: "tool", key: "bash", value: null },
      ]);
      expect(tracker.snapshot().tools).toEqual({});
      expect(tracker.snapshot().toolDurations).toEqual({ bash: 2500 });
      expect(tracker.snapshot().calls.bash).toBeDefined();
      tracker.committed("bash");
      expect(tracker.snapshot().calls.bash).toBeUndefined();
      expect(new LiveTracker(() => {}, durations).snapshot().toolDurations).toEqual({ bash: 2500 });
      tracker.toolEnd({ toolCallId: "unknown" } as ToolExecutionEndEvent);
      expect(durations.size).toBe(1);
    } finally { vi.useRealTimers(); }
  });
  it("coalesces partial tool arguments, publishes final arguments immediately, and keeps bash command with progress", () => {
    vi.useFakeTimers();
    try {
      const ops: OpInput[] = [];
      const tracker = new LiveTracker(op => ops.push(op));
      tracker.start({ message: { role: "assistant", provider: "p", model: "m", timestamp: 1 } } as MessageStartEvent);
      const update = (type: "toolcall_start" | "toolcall_delta" | "toolcall_end", args: Record<string, unknown>) => {
        const call = { type: "toolCall", id: "call", name: "write", arguments: args };
        tracker.update({ assistantMessageEvent: {
          type, contentIndex: 0, partial: { content: [call] }, ...(type === "toolcall_end" ? { toolCall: call } : {}),
        } } as unknown as MessageUpdateEvent);
      };
      update("toolcall_start", {});
      ops.length = 0;
      update("toolcall_delta", { path: "a.ts", content: "one" });
      vi.advanceTimersByTime(100);
      update("toolcall_delta", { path: "a.ts", content: "one\ntwo" });
      expect(ops).toEqual([]);
      vi.advanceTimersByTime(150);
      expect(ops).toEqual([{ op: "set", target: "live.content", index: 0,
        value: { type: "toolCall", id: "call", name: "write", arguments: { path: "a.ts", content: "one\ntwo" } } }]);
      ops.length = 0;
      update("toolcall_delta", { path: "a.ts", content: "one\ntwo\nthree" });
      update("toolcall_end", { path: "a.ts", content: "final" });
      vi.advanceTimersByTime(250);
      expect(ops).toEqual([{ op: "set", target: "live.content", index: 0,
        value: { type: "toolCall", id: "call", name: "write", arguments: { path: "a.ts", content: "final" } } }]);

      tracker.toolStart({ toolCallId: "bash", toolName: "bash", args: { command: "echo hello" } } as ToolExecutionStartEvent);
      expect(tracker.snapshot().tools.bash.command).toBe("echo hello");
      tracker.stop();
    } finally { vi.useRealTimers(); }
  });
});
