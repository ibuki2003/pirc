import { assertEquals } from "@std/assert";
import { MOBILE_STREAM, type ProjectedEntry, type SyncOp } from "@pirc/api";
import { projectEntry, projectOps } from "../core/projection.ts";

Deno.test("entry projection does not mutate source and retains retrieval paths", () => {
  const item = {
    index: 4,
    entry: {
      id: "e",
      parentId: null,
      timestamp: "",
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "t",
        toolName: "read",
        isError: false,
        timestamp: 0,
        content: [{ type: "text", text: "123456" }, {
          type: "image",
          mimeType: "image/png",
          data: "aGVsbG8=",
        }],
      },
    },
  } as ProjectedEntry;
  const projected = projectEntry(item, { ...MOBILE_STREAM, maxTextBytes: 3 });
  if (projected.entry.type !== "message" || item.entry.type !== "message") {
    throw new Error("Expected message");
  }
  assertEquals((projected.entry.message as { content: unknown[] }).content[0], {
    type: "text",
    text: "123",
  });
  assertEquals(projected.trims?.map((t) => t.path), [[
    "message",
    "content",
    0,
    "text",
  ], ["message", "content", 1, "data"]]);
  assertEquals((item.entry.message as { content: unknown[] }).content[0], {
    type: "text",
    text: "123456",
  });
});
Deno.test("thinking deltas are suppressed across batches", () => {
  const options = MOBILE_STREAM;
  const set = {
    seq: 1,
    op: "set",
    target: "live.content",
    index: 0,
    value: { type: "thinking", thinking: "" },
  } as SyncOp;
  const types: string[] = [];
  assertEquals(projectOps([set], options, types), []);
  assertEquals(
    projectOps(
      [{
        seq: 2,
        op: "append",
        target: "live.content",
        index: 0,
        text: "secret",
      }],
      options,
      types,
    ),
    [],
  );
});
