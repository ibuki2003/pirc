import { describe, expect, it } from "vitest";
import type { ToolProgress } from "@pirc/api";
import { liveToolDisplay } from "./live-tool";

const progress: ToolProgress = {
  toolName: "bash",
  command: "pwd",
  startedAt: 1,
  output: "/repo",
  totalBytes: 5,
  truncatedHead: true,
};

describe("liveToolDisplay", () => {
  it("keeps partial calls renderable before progress arrives", () => {
    expect(liveToolDisplay("call", { type: "toolCall", id: "call", name: "read" })).toEqual({
      calls: [{ id: "call", name: "read", arguments: undefined, changes: undefined, results: [], progress: undefined }],
      failed: false,
    });
  });

  it("preserves arguments and projected changes", () => {
    const call = { type: "toolCall" as const, id: "call", name: "apply_patch", arguments: { patch: "*** Begin Patch" }, changes: [] };
    const display = liveToolDisplay(call.id, call, progress);
    expect(display.calls[0].arguments).toBe(call.arguments);
    expect(display.calls[0].changes).toBe(call.changes);
    expect(display.calls[0].progress).toBe(progress);
  });

  it("normalizes orphan progress without inventing a result", () => {
    expect(liveToolDisplay("orphan", null, progress)).toEqual({
      calls: [{
        id: "orphan", name: "bash", arguments: { command: "pwd" },
        changes: undefined, results: [], progress,
      }],
      failed: false,
    });
  });
});
