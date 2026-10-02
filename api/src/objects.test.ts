import { describe, expect, it } from "vitest";
import { applyObjectChanges, objectChanges } from "./objects.ts";

describe("object stream changes", () => {
  it("appends tool arguments and output without retransmitting existing text", () => {
    const before = { arguments: { patch: "*** Begin Patch\n" }, content: [{ type: "text", text: "first\n" }] };
    const after = { arguments: { patch: "*** Begin Patch\n*** Add File: a.ts\n+new" },
      content: [{ type: "text", text: "first\nlast\n" }] };
    const changes = objectChanges(before, after);
    expect(changes).toEqual([
      { op: "splice", path: ["arguments", "patch"], start: 16, deleteCount: 0, text: "*** Add File: a.ts\n+new" },
      { op: "splice", path: ["content", 0, "text"], start: 6, deleteCount: 0, text: "last\n" },
    ]);
    expect(applyObjectChanges(before, changes)).toEqual(after);
    expect(before.content[0].text).toBe("first\n");
  });
  it("handles final corrections, metadata, deletions and array growth", () => {
    const before = { text: "abc OLD xyz", progress: true, content: ["kept"] };
    const after = { text: "abc NEW xyz", result: { id: "r" }, content: ["kept", "added"] };
    const changes = objectChanges(before, after);
    expect(changes).toContainEqual({ op: "splice", path: ["text"], start: 4, deleteCount: 3, text: "NEW" });
    expect(changes).toContainEqual({ op: "array", path: ["content"], index: 1, deleteCount: 0, values: ["added"] });
    expect(applyObjectChanges(before, changes)).toEqual(after);
    expect(applyObjectChanges(after, objectChanges(after, before))).toEqual(before);
  });
  it("round-trips JSON objects, Unicode and unchanged payloads", () => {
    const pairs = [[{}, { nested: { text: "日本語😀" } }], [{ text: "😀" }, { text: "😁" }],
      [{ list: [1, 2] }, { list: [] }], [{ a: null }, { a: [false, ""] }]];
    for (const [before, after] of pairs) expect(applyObjectChanges(before, objectChanges(before, after))).toEqual(after);
    expect(objectChanges({ text: "same" }, { text: "same" })).toEqual([]);
  });
  it("rejects invalid paths and text offsets", () => {
    expect(() => applyObjectChanges({}, [{ op: "set", path: ["__proto__", "bad"], value: true }])).toThrow();
    expect(() => applyObjectChanges({ text: "short" }, [
      { op: "splice", path: ["text"], start: 100, deleteCount: 0, text: "" },
    ])).toThrow();
  });
});
