import { describe, expect, it } from "vitest";
import { patchLines, patchRows } from "./patch-diff";

describe("patch diff", () => {
  it("classifies directives, hunks and content without losing text", () => {
    const patch = "*** Begin Patch\n*** Update File: a.ts\n@@\n context\n-old\n+new\n*** End Patch";
    const lines = patchLines(patch);
    expect(lines.map(line => line.kind)).toEqual(["meta", "meta", "meta", "context", "removed", "added", "meta"]);
    expect(lines.map(line => line.text).join("\n")).toBe(patch);
  });

  it("aligns replacements and leaves unmatched lines empty", () => {
    const rows = patchRows(patchLines("-old\n+new\n+extra\n context"));
    expect(rows[0]).toEqual({ left: { kind: "removed", text: "-old" }, right: { kind: "added", text: "+new" } });
    expect(rows[1].left).toBeUndefined();
    expect(rows[1].right?.text).toBe("+extra");
    expect(rows[2].left).toEqual(rows[2].right);
  });

  it("does not pair lines across hunks or files", () => {
    const rows = patchRows(patchLines("-old\n@@ next\n+new\n*** Add File: b\n+file"));
    expect(rows[0].right).toBeUndefined();
    expect(rows[1].meta?.text).toBe("@@ next");
    expect(rows[2].left).toBeUndefined();
    expect(rows[3].meta?.text).toBe("*** Add File: b");
    expect(rows[4].right?.text).toBe("+file");
  });

  it("supports deletion, CRLF and an incomplete streaming patch", () => {
    const rows = patchRows(patchLines("*** Delete File: old\r\n*** Update File: next\r\n-old"));
    expect(rows.map(row => row.meta?.text ?? row.left?.text)).toEqual(["*** Delete File: old", "*** Update File: next", "-old"]);
    expect(rows[2].right).toBeUndefined();
  });
});
