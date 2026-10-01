import { assertEquals } from "@std/assert";
import { MOBILE_STREAM, type ProjectedEntry, type SyncOp } from "@pirc/api";
import { projectEntry, projectOps, projectSnapshot } from "../core/projection.ts";

function entry(message: unknown): ProjectedEntry {
  return {
    index: 4,
    entry: {
      id: "e",
      parentId: null,
      timestamp: "",
      type: "message",
      message,
    },
  } as ProjectedEntry;
}

Deno.test("tool result redaction never leaks content or details", () => {
  for (const toolName of ["read", "bash", "edit", "write", "other"]) {
    const original = entry({
      role: "toolResult", toolCallId: "t", toolName, isError: false,
      content: [{ type: "text", text: "secret" }],
      details: { truncation: { content: "secret" } },
    });
    const projected = projectEntry(original, MOBILE_STREAM);
    assertEquals(projected.entry, {
      type: "redacted", redacted: true, id: "e", parentId: null, timestamp: "",
      originalBytes: new TextEncoder().encode(JSON.stringify(original.entry)).length,
      role: "toolResult", toolCallId: "t", toolName,
      ...(["bash", "edit", "write"].includes(toolName) ? { isError: false } : {}),
    });
    assertEquals(JSON.stringify(projected).includes("secret"), false);
    assertEquals(JSON.stringify(original).includes("secret"), true);
  }
});

Deno.test("tool calls are redacted per block, keeping assistant text and thinking", () => {
  const original = entry({
    role: "assistant",
    content: [
      { type: "text", text: "hello" },
      { type: "thinking", thinking: "reasoning" },
      ...["read", "bash", "edit", "write", "other"].map((name) => ({
        type: "toolCall", id: name, name,
        arguments: { path: "file", offset: 2, command: "echo secret", content: "secret" },
        thoughtSignature: "secret",
      })),
    ],
  });
  const projected = projectEntry(original, MOBILE_STREAM);
  if (projected.entry.type !== "message" || projected.entry.message.role !== "assistant") throw new Error("Expected assistant");
  const bytes = (original.entry.type === "message" && original.entry.message.role === "assistant"
    ? original.entry.message.content.slice(2).map(block => new TextEncoder().encode(JSON.stringify(block)).length)
    : []);
  assertEquals(projected.entry.message.content as unknown[], [
    { type: "text", text: "hello" },
    { type: "thinking", thinking: "reasoning" },
    { type: "toolCall", id: "read", name: "read", redacted: true, originalBytes: bytes[0], arguments: {
      path: "file", offset: 2, command: "echo secret", content: "secret",
    } },
    { type: "toolCall", id: "bash", name: "bash", redacted: true, originalBytes: bytes[1], arguments: { command: "echo secret" } },
    { type: "toolCall", id: "edit", name: "edit", redacted: true, originalBytes: bytes[2], arguments: { path: "file" },
      changes: [{ path: "file", added: 0, removed: 0 }] },
    { type: "toolCall", id: "write", name: "write", redacted: true, originalBytes: bytes[3], arguments: { path: "file" },
      changes: [{ path: "file", added: 1 }] },
    { type: "toolCall", id: "other", name: "other", redacted: true, originalBytes: bytes[4] },
  ]);
});

Deno.test("edit/write line counts and apply_patch file summaries are projected without source content", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: a.ts",
    "@@",
    "-old",
    "+new",
    "+another",
    "*** Move to: renamed.ts",
    "@@",
    "-again",
    "+again",
    "*** Add File: b.ts",
    "+first",
    "+second",
    "*** Delete File: c.ts",
    "*** End Patch",
  ].join("\n");
  const original = entry({ role: "assistant", content: [
    { type: "toolCall", id: "e", name: "edit", arguments: { path: "a.ts", oldText: "one\ntwo\n", newText: "three\n" } },
    { type: "toolCall", id: "w", name: "write", arguments: { path: "b.ts", content: "first\nsecond" } },
    { type: "toolCall", id: "p", name: "apply_patch", arguments: { patch } },
  ] });
  const projected = projectEntry(original, MOBILE_STREAM);
  if (projected.entry.type !== "message" || projected.entry.message.role !== "assistant") throw new Error("Expected assistant");
  const calls = projected.entry.message.content;
  assertEquals(calls.map(call => "changes" in call ? call.changes : undefined), [
    [{ path: "a.ts", added: 1, removed: 2 }],
    [{ path: "b.ts", added: 2 }],
    [{ path: "a.ts", added: 3, removed: 2 }, { path: "b.ts", added: 2 }, { path: "c.ts" }],
  ]);
  assertEquals(JSON.stringify(projected).includes("oldText"), false);
  assertEquals(JSON.stringify(projected).includes("*** Begin Patch"), false);
});

Deno.test("bash execution keeps only the command prefix", () => {
  const projected = projectEntry(entry({ role: "bashExecution", command: "é".repeat(100), output: "secret", exitCode: 1, cancelled: false }), MOBILE_STREAM);
  assertEquals(projected.entry.type, "redacted");
  if (projected.entry.type !== "redacted") throw new Error("Expected redacted entry");
  assertEquals(projected.entry.command, "é".repeat(64));
  assertEquals(projected.entry.isError, true);
  assertEquals(JSON.stringify(projected).includes("secret"), false);
});

Deno.test("thinking deltas are forwarded across batches", () => {
  const set = {
    seq: 1, op: "set", target: "live.content", index: 0,
    value: { type: "thinking", thinking: "" },
  } as SyncOp;
  assertEquals(projectOps([set], MOBILE_STREAM), [set]);
  const delta = { seq: 2, op: "append", target: "live.content", index: 0, text: "reasoning" } as SyncOp;
  assertEquals(projectOps([delta], MOBILE_STREAM), [delta]);
});

Deno.test("partial live calls project line counts and patch summaries without source, and bound running bash commands", () => {
  const calls = [
    { type: "toolCall", id: "w", name: "write", arguments: { path: "a.ts", content: "one\ntwo" } },
    { type: "toolCall", id: "e", name: "edit", arguments: { path: "b.ts", oldText: "before\n", newText: "after\nnext" } },
    { type: "toolCall", id: "p", name: "apply_patch", arguments: {
      patch: "*** Begin Patch\n*** Update File: c.ts\n@@\n-old\n+new\n*** End Patch",
    } },
  ];
  const projected = calls.map((value, index) => projectOps([
    { seq: index + 1, op: "set", target: "live.content", index, value } as SyncOp,
  ], MOBILE_STREAM)[0]);
  assertEquals(projected.map(op => op.op === "set" && op.target === "live.content" && op.value.type === "toolCall" ? op.value.changes : undefined), [
    [{ path: "a.ts", added: 2 }],
    [{ path: "b.ts", added: 2, removed: 1 }],
    [{ path: "c.ts", added: 1, removed: 1 }],
  ]);
  assertEquals(JSON.stringify(projected).includes("before"), false);
  assertEquals(JSON.stringify(projected).includes("*** Begin Patch"), false);
  const bash = projectOps([{ seq: 4, op: "set", target: "tool", key: "bash",
    value: { toolName: "bash", command: "é".repeat(100), startedAt: 1, output: "", totalBytes: 0, truncatedHead: false } }], MOBILE_STREAM);
  assertEquals(bash[0].op === "set" && bash[0].target === "tool" ? bash[0].value?.command : undefined, "é".repeat(64));
});

Deno.test("only expanded running tool calls expose arguments and output in ops and snapshots", () => {
  const stream = { ...MOBILE_STREAM, expandedToolCalls: ["patch", "bash"] };
  const patch = { type: "toolCall" as const, id: "patch", name: "apply_patch", arguments: { patch: "*** Begin Patch\n+secret" } };
  const other = { ...patch, id: "other" };
  const tool = { toolName: "bash", startedAt: 1, output: "secret".repeat(500), totalBytes: 3000, truncatedHead: false };
  const ops: SyncOp[] = [
    { seq: 1, op: "set", target: "live.content", index: 0, value: patch },
    { seq: 2, op: "set", target: "live.content", index: 1, value: other },
    { seq: 3, op: "set", target: "tool", key: "bash", value: tool },
    { seq: 4, op: "set", target: "tool", key: "other", value: tool },
  ];
  const projected = projectOps(ops, stream);
  assertEquals((projected[0] as typeof ops[0]), ops[0]);
  assertEquals(JSON.stringify(projected[1]).includes("secret"), false);
  assertEquals(projected[2].op === "set" && projected[2].target === "tool" && projected[2].value?.output, tool.output);
  assertEquals(projected[3].op === "set" && projected[3].target === "tool" && projected[3].value?.output, tool.output.slice(-2048));
  const snapshot = projectSnapshot({
    seq: 4, entries: [], entryCount: 0, hasMoreBefore: false,
    live: { provider: "test", model: "test", startedAt: 1, content: [patch, other] },
    tools: { bash: tool, other: tool }, toolDurations: {},
  } as unknown as Parameters<typeof projectSnapshot>[0], stream);
  assertEquals(snapshot.live?.content[0], patch);
  assertEquals(JSON.stringify(snapshot.live?.content[1]).includes("secret"), false);
  assertEquals(snapshot.tools.bash.output, tool.output);
  assertEquals(snapshot.tools.other.output, tool.output.slice(-2048));
});
