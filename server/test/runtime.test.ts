import { assertEquals, assertThrows } from "@std/assert";
import { applyObjectChanges, type ProjectedEntry, type RuntimeSnapshot, type SessionState, type SyncOp, type ToolObject, type ToolObjectEvent } from "@pirc/api";
import { Runtime } from "../core/runtime.ts";

const state = { instanceId: "i", status: { streaming: true } } as SessionState;
const seed: RuntimeSnapshot = { seq: 0, state, live: null, tools: {}, calls: {}, toolDurations: {} };

Deno.test("object streams append only new text and reach EOF only after the persisted result", () => {
  const runtime = new Runtime(seed);
  const events: ToolObjectEvent[] = [];
  const emit = (_id: string, event: ToolObjectEvent) => events.push(event);
  const call = { type: "toolCall" as const, id: "t", name: "bash", arguments: { command: "echo done" } };
  runtime.apply([{ seq: 1, op: "set", target: "call", key: "t", value: call }], emit);
  runtime.apply([{ seq: 2, op: "set", target: "tool", key: "t", value: {
    toolName: "bash", startedAt: 1, output: "first\n", totalBytes: 6, truncatedHead: false,
  } }], emit);
  const first = runtime.objects.get("t")!.value;
  events.length = 0;
  runtime.apply([{ seq: 3, op: "set", target: "tool", key: "t", value: {
    toolName: "bash", startedAt: 1, output: "first\nlast\n", totalBytes: 11, truncatedHead: false,
  } }], emit);
  assertEquals(events[0].type === "patch" && events[0].changes.some(change =>
    change.op === "splice" && change.text === "last\n"), true);
  assertEquals(JSON.stringify(events).includes("first"), false);
  runtime.apply([{ seq: 4, op: "set", target: "tool", key: "t", value: null }], emit);
  assertEquals(events.some(event => event.type === "end"), false);
  assertEquals(runtime.objects.has("t"), true);
  runtime.apply([{ seq: 5, op: "append", target: "entries", from: 0, items: [{
    index: 0, entry: { type: "message", id: "r", parentId: null, timestamp: "date", message: {
      role: "toolResult", toolCallId: "t", toolName: "bash",
      content: [{ type: "text", text: "first\nlast\n" }], isError: false, timestamp: 10,
    } },
  }] }], emit);
  assertEquals(JSON.stringify(events).includes("first"), false);
  assertEquals(events.at(-1), { type: "end", revision: 4, entryId: "r" });
  let value = first;
  for (const event of events) if (event.type === "patch") value = applyObjectChanges(value, event.changes);
  assertEquals(value.content, [{ type: "text", text: "first\nlast\n" }]);
  assertEquals(value.result?.id, "r");
  assertEquals(value.result?.message.isError, false);
  assertEquals(value.progress, undefined);
  assertEquals(runtime.objects.has("t"), false);
  assertEquals(runtime.snapshot().calls.t, undefined);
});

Deno.test("partial patch arguments are retained across message-end and corrected before EOF", () => {
  const runtime = new Runtime(seed);
  const events: ToolObjectEvent[] = [];
  const emit = (_id: string, event: ToolObjectEvent) => events.push(event);
  runtime.apply([
    { seq: 1, op: "set", target: "live", value: { provider: "p", model: "m", startedAt: 1, content: [] } },
    { seq: 2, op: "set", target: "live.content", index: 0,
      value: { type: "toolCall", id: "p", name: "apply_patch", arguments: { patch: "*** Begin Patch\n" } } },
    { seq: 3, op: "set", target: "live.content", index: 0, value: {
      type: "toolCall", id: "p", name: "apply_patch", arguments: { patch: "*** Begin Patch\n*** Add File: a\n+new" },
    } },
    { seq: 4, op: "set", target: "live", value: null },
  ], emit);
  assertEquals(runtime.objects.has("p"), true);
  assertEquals(runtime.snapshot().calls.p.arguments?.patch, "*** Begin Patch\n*** Add File: a\n+new");
  assertEquals(events[1].type === "patch" && events[1].changes, [
    { op: "splice", path: ["arguments", "patch"], start: 16, deleteCount: 0, text: "*** Add File: a\n+new" },
  ]);
  const start = runtime.objects.get("p")!.value;
  events.length = 0;
  runtime.apply([{ seq: 5, op: "append", target: "entries", from: 0, items: [{
    index: 0, entry: { type: "message", id: "r", parentId: null, timestamp: "", message: {
      role: "toolResult", toolCallId: "p", toolName: "apply_patch",
      content: [{ type: "text", text: "final error" }], isError: true, timestamp: 10,
    } },
  }] }], emit);
  const patch = events[0];
  const final = patch.type === "patch" ? applyObjectChanges(start, patch.changes) : undefined;
  assertEquals(final?.result?.message.isError, true);
  assertEquals(final?.content, [{ type: "text", text: "final error" }]);
});

Deno.test("runtime seeds full unresolved objects and rejects host sequence gaps", () => {
  const call = { type: "toolCall" as const, id: "t", name: "write", arguments: { path: "a", content: "full" } };
  const runtime = new Runtime({ ...seed, seq: 10, calls: { t: call } });
  assertEquals(runtime.objects.get("t")?.value, {
    id: "t", name: "write", arguments: call.arguments, content: [],
  } satisfies ToolObject);
  assertThrows(() => runtime.apply([{ seq: 12, op: "set", target: "leaf", value: null }] as SyncOp[], () => {}));
});

Deno.test("an aborted call without a persisted result releases its subscription without EOF", () => {
  const runtime = new Runtime({ ...seed, calls: {
    t: { type: "toolCall", id: "t", name: "bash", arguments: { command: "partial" } },
  } });
  const events: ToolObjectEvent[] = [];
  runtime.apply([{ seq: 1, op: "set", target: "state", value: {
    ...state, status: { streaming: false, compacting: false, pendingMessages: false },
  } }], (_id, event) => events.push(event));
  assertEquals(events, [{ type: "unavailable" }]);
  assertEquals(runtime.objects.size, 0);
  assertEquals(runtime.snapshot().calls, {});
});

Deno.test("canonical call and result in one host operation still have distinct object revisions", () => {
  const runtime = new Runtime({ ...seed, calls: {
    t: { type: "toolCall", id: "t", name: "write", arguments: { path: "a", content: "partial" } },
  } });
  const events: ToolObjectEvent[] = [];
  const assistant = { index: 0, entry: { id: "a", parentId: null, timestamp: "", type: "message",
    message: { role: "assistant", content: [{
      type: "toolCall", id: "t", name: "write", arguments: { path: "a", content: "canonical" },
    }] } } } as unknown as ProjectedEntry;
  runtime.apply([{ seq: 1, op: "append", target: "entries", from: 0, items: [
    assistant,
    { index: 1, entry: { type: "message", id: "r", parentId: "a", timestamp: "", message: {
      role: "toolResult", toolCallId: "t", toolName: "write",
      content: [], isError: false, timestamp: 1,
    } } },
  ] }], (_id, event) => events.push(event));
  assertEquals(events.map(event => "revision" in event ? event.revision : undefined), [1, 2, 2]);
  assertEquals(events[1].type === "patch" ? events[1].from : undefined, 1);
  assertEquals(events.at(-1)?.type, "end");
});
