import { describe, it, expect } from "vitest";
import { applyOps, applySnapshot, applyRuntimeOps, runtimeSnapshot, computeBranch, missingAncestor, SyncMismatch } from "./mirror.ts";
import type { SessionSnapshot, SessionState, SyncOp } from "@pirc/api";

const state = { instanceId: "i", status: { streaming: true } } as SessionState;
const item = (index: number, id: string, parentId: string | null) =>
  ({ index, entry: { type: "session_info" as const, id, parentId, timestamp: "", name: id } });
const snapshot: SessionSnapshot = {
  mode: "full", seq: 0, entryCount: 2, lastEntryId: "b", leafId: "b",
  entries: [item(1, "b", "a")], hasMoreBefore: true,
};
const runtime = { seq: 0, state, live: null, tools: {}, calls: {}, toolDurations: {} };
describe("mirror", () => {
  it("synchronizes completed durations atomically and restores them on reconnect", () => {
    const previous = runtimeSnapshot(runtime);
    const next = applyRuntimeOps(previous, [{ seq: 1, op: "set", target: "toolDuration", key: "bash", value: 2500 }]);
    expect(previous.toolDurations.size).toBe(0);
    expect(next.toolDurations.get("bash")).toBe(2500);
    const reconnected = runtimeSnapshot({ ...runtime, seq: 1, toolDurations: { bash: 2500 } });
    expect(reconnected.toolDurations).toEqual(next.toolDurations);
  });
  it("tracks a partial branch and merges older entries", () => {
    const m = applySnapshot(null, snapshot);
    expect(missingAncestor(m)).toBe("a");
    m.entries.set(0, item(0, "a", null));
    m.entryIds.set("a", 0);
    expect(computeBranch(m).map(e => e.entry.id)).toEqual(["a", "b"]);
  });
  it("applies a batch atomically, detects gaps and ignores replayed ops", () => {
    const m = applySnapshot(null, snapshot);
    const ops: SyncOp[] = [
      { seq: 1, op: "append" as const, target: "entries" as const, from: 2, items: [item(2, "c", "b")] },
      { seq: 2, op: "set" as const, target: "leaf" as const, value: "a" },
    ];
    const next = applyOps(m, ops);
    expect(next.leafId).toBe("a");
    expect(applyOps(next, ops).seq).toBe(2);
    expect(() => applyOps(m, [{ seq: 1, op: "append", target: "entries", from: 9, items: [] }])).toThrow(SyncMismatch);
    expect(m.entryCount).toBe(2);
  });
  it("applies live deltas without mutating the previous frame", () => {
    const initial = runtimeSnapshot(runtime);
    const next = applyRuntimeOps(initial, [
      { seq: 1, op: "set", target: "live", value: { provider: "p", model: "m", startedAt: 1, content: [] } },
      { seq: 2, op: "set", target: "live.content", index: 0, value: { type: "text", text: "a" } },
      { seq: 3, op: "append", target: "live.content", index: 0, text: "b" },
    ]);
    expect(next.live?.content).toEqual([{ type: "text", text: "ab" }]);
    expect(initial.live).toBeNull();
    expect(applySnapshot(applySnapshot(null, snapshot), { ...snapshot, mode: "delta", seq: 3, entries: [], entryCount: 2 }).hasMoreBefore).toBe(true);
  });
});
