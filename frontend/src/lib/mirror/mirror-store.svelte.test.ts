// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, tick } from "svelte";
import { objectChanges, type RuntimeSnapshot, type SessionSnapshot, type SessionState, type ToolObject, type ServerToClient } from "@pirc/api";

const mock = vi.hoisted(() => ({
  getSync: vi.fn(), getEntry: vi.fn(), request: vi.fn(),
  listener: undefined as undefined | ((params: unknown, method: string) => void),
}));
const { getSync, getEntry } = mock;
vi.mock("@pirc/api", async importOriginal => ({
  ...await importOriginal<typeof import("@pirc/api")>(),
  HttpClient: class { getSync = mock.getSync; getEntry = mock.getEntry; },
}));
vi.mock("../connection.svelte.ts", () => ({
  connection: {
    peer: { request: mock.request },
    generation: 1,
    listen: (listener: typeof mock.listener) => { mock.listener = listener; return () => { mock.listener = undefined; }; },
  },
}));
vi.mock("../visibility.ts", () => ({ watchVisibility: () => () => {} }));

import { MirrorStore } from "./mirror-store.svelte.ts";

const snapshot: SessionSnapshot = {
  mode: "full", seq: 0, entryCount: 0, lastEntryId: null, leafId: null,
  entries: [], hasMoreBefore: false,
};
const state = { instanceId: "i", status: { streaming: true } } as SessionState;
const runtime: RuntimeSnapshot = {
  seq: 0, state, live: null, tools: {}, toolDurations: {},
  calls: { t: { type: "toolCall", id: "t", name: "bash", arguments: { command: "echo done" } } },
};
function emit<M extends keyof ServerToClient["notifications"]>(method: M, params: ServerToClient["notifications"][M]) {
  mock.listener?.(params, method);
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.request.mockImplementation(async (method: string) => {
    if (method === "session.attach") emit("session.runtime", { instanceId: "i", snapshot: runtime });
    return {};
  });
});

describe("MirrorStore", () => {
  it("does not request another snapshot after applying one", async () => {
    getSync.mockClear().mockImplementation(() => getSync.mock.calls.length === 1
      ? Promise.resolve(snapshot) : new Promise(() => {}));
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.mirror?.seq).toBe(0));
    await tick();
    expect(getSync).toHaveBeenCalledTimes(1);
    store.stop();
  });
  it("stops after an initial full sync fails", async () => {
    getSync.mockClear().mockRejectedValue(new Error("HTTP 504"));
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.error).toContain("HTTP 504"));
    await tick();
    expect(store.loading).toBe(false);
    expect(getSync).toHaveBeenCalledTimes(1);
    store.stop();
  });
  it("retries a failed delta once as full, then stops on failure", async () => {
    getSync.mockClear().mockResolvedValueOnce(snapshot);
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.mirror?.seq).toBe(0));

    getSync.mockClear().mockRejectedValue(new Error("HTTP 504"));
    emit("session.resync", { instanceId: "i", reason: "backpressure" });
    await vi.waitFor(() => expect(store.error).toContain("HTTP 504"));
    await tick();
    expect(getSync).toHaveBeenCalledTimes(2);
    expect(getSync.mock.calls[0][1].since).toBe(0);
    expect(getSync.mock.calls[1][1]).toBeUndefined();
    store.stop();
  });
  it("updates WS runtime while HTTP history is in flight, without overwriting it with the history snapshot", async () => {
    let resolve!: (value: SessionSnapshot) => void;
    getSync.mockImplementationOnce(() => new Promise<SessionSnapshot>(done => { resolve = done; }));
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(getSync).toHaveBeenCalledTimes(1));
    emit("session.ops", { instanceId: "i", ops: [
      { seq: 1, op: "set", target: "live", value: { provider: "p", model: "m", startedAt: 1, content: [] } },
      { seq: 2, op: "set", target: "live.content", index: 0, value: { type: "text", text: "first" } },
      { seq: 3, op: "append", target: "live.content", index: 0, text: " latest" },
    ] });
    resolve({ ...snapshot, seq: 2 });
    await vi.waitFor(() => expect(store.mirror?.seq).toBe(3));
    expect(store.runtime?.live?.content).toEqual([{ type: "text", text: "first latest" }]);
    expect(getSync.mock.calls[0][1]).toEqual({ since: undefined });
    store.stop();
  });
  it("accepts WS updates arriving after an HTTP snapshot already covers them, without resync", async () => {
    getSync.mockResolvedValue({ ...snapshot, seq: 2 });
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    try {
      await vi.waitFor(() => expect(store.mirror?.seq).toBe(2));
      expect(store.runtime?.seq).toBe(0);
      emit("session.ops", { instanceId: "i", ops: [
        { seq: 1, op: "set", target: "toolDuration", key: "t", value: 1 },
        { seq: 2, op: "set", target: "toolDuration", key: "t", value: 2 },
      ] });
      await tick();
      expect(getSync).toHaveBeenCalledTimes(1);
      expect(store.runtime?.seq).toBe(2);
      expect(store.runtime?.toolDurations.get("t")).toBe(2);
      expect(store.mirror?.seq).toBe(2);
      emit("session.ops", { instanceId: "i", ops: [
        { seq: 3, op: "set", target: "toolDuration", key: "t", value: 3 },
      ] });
      expect(store.runtime?.seq).toBe(3);
      expect(store.mirror?.seq).toBe(3);
    } finally { store.stop(); }
  });
  it("subscribes only to the expanded object, merges final deltas, and does not GET after EOF", async () => {
    getSync.mockResolvedValue(snapshot);
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.mirror).not.toBeNull());
    store.setToolExpanded(["t"], true);
    const params = mock.request.mock.calls.find(([method]) => method === "tool.subscribe")![1];
    const value: ToolObject = { id: "t", name: "bash", arguments: { command: "echo done" },
      content: [{ type: "text", text: "do" }] };
    emit("tool.object", { ...params, event: { type: "snapshot", revision: 1, value } });
    const final: ToolObject = { ...value, content: [{ type: "text", text: "done" }],
      result: { index: 0, id: "result", parentId: null, timestamp: "", message: {
        role: "toolResult", toolCallId: "t", toolName: "bash", isError: false, timestamp: 1,
      } } };
    emit("tool.object", { ...params, event: {
      type: "patch", from: 1, revision: 2, changes: objectChanges(value, final),
    } });
    emit("tool.object", { ...params, event: { type: "end", revision: 2, entryId: "result" } });
    expect(store.objects.get("t")).toEqual({ value: final, revision: 2, complete: true });
    store.setToolExpanded(["t"], false);
    store.setToolExpanded(["t"], true);
    await tick();
    expect(mock.request.mock.calls.filter(([method]) => method === "tool.subscribe")).toHaveLength(1);
    expect(mock.request.mock.calls.some(([method]) => method === "tool.unsubscribe")).toBe(false);
    expect(getSync).toHaveBeenCalledTimes(1);
    expect(getEntry).not.toHaveBeenCalled();
    store.stop();
  });
  it("rejects an EOF without complete result data and ignores notifications from an old subscription", async () => {
    getSync.mockResolvedValue(snapshot);
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.mirror).not.toBeNull());
    store.setToolExpanded(["t"], true);
    const params = mock.request.mock.calls.find(([method]) => method === "tool.subscribe")![1];
    emit("tool.object", { ...params, event: {
      type: "snapshot", revision: 1, value: { id: "t", name: "bash", content: [] },
    } });
    emit("tool.object", { ...params, event: { type: "end", revision: 1, entryId: "result" } });
    expect(store.objects.get("t")?.complete).not.toBe(true);
    expect(mock.request.mock.calls.filter(([method]) => method === "tool.subscribe")).toHaveLength(2);
    emit("tool.object", { ...params, event: { type: "unavailable" } });
    expect(store.canStreamTool("t")).toBe(true);
    store.stop();
  });
  it("keeps separately fetched immutable details across history resyncs and deduplicates GETs", async () => {
    const entry = { index: 0, entry: { type: "session_info" as const,
      id: "e", parentId: null, timestamp: "", name: "full" } };
    getSync.mockResolvedValue({ ...snapshot, entryCount: 1, leafId: "e", entries: [
      { ...entry, entry: { ...entry.entry, name: "preview" } },
    ] });
    getEntry.mockResolvedValue(entry);
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.mirror).not.toBeNull());
    await Promise.all([store.expandEntry("e"), store.expandEntry("e")]);
    expect(getEntry).toHaveBeenCalledTimes(1);
    expect(store.branch[0]).toEqual(entry);
    emit("session.resync", { instanceId: "i", reason: "backpressure" });
    await vi.waitFor(() => expect(getSync).toHaveBeenCalledTimes(2));
    await tick();
    expect(store.branch[0]).toEqual(entry);
    store.stop();
  });
  it("starts a wanted subscription when a tool first becomes active, and unsubscribes without history resync", async () => {
    getSync.mockResolvedValue(snapshot);
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.mirror).not.toBeNull());
    store.setToolExpanded(["later"], true);
    expect(mock.request.mock.calls.some(([method]) => method === "tool.subscribe")).toBe(false);
    emit("session.ops", { instanceId: "i", ops: [
      { seq: 1, op: "set", target: "call", key: "later", value: {
        type: "toolCall", id: "later", name: "write", arguments: { path: "a" },
      } },
    ] });
    const params = mock.request.mock.calls.find(([method]) => method === "tool.subscribe")![1];
    expect(params.toolCallId).toBe("later");
    store.setToolExpanded(["later"], false);
    expect(mock.request).toHaveBeenLastCalledWith("tool.unsubscribe", params);
    expect(getSync).toHaveBeenCalledTimes(1);
    store.stop();
  });
  it("does not turn an unrelated subscription error into a history resync", async () => {
    getSync.mockResolvedValue(snapshot);
    const store = new MirrorStore("i");
    store.start();
    flushSync();
    await vi.waitFor(() => expect(store.mirror).not.toBeNull());
    store.setToolExpanded(["t"], true);
    const spy = vi.spyOn(store as unknown as { subscribeTool(id: string): void }, "subscribeTool")
      .mockImplementation(() => { throw new TypeError("subscription error"); });
    try {
      expect(() => emit("session.ops", { instanceId: "i", ops: [
        { seq: 1, op: "set", target: "toolDuration", key: "t", value: 1 },
      ] })).toThrow("subscription error");
      await tick();
      expect(getSync).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); store.stop(); }
  });
  it("never reuses a subscription token when a store is recreated on the same connection", async () => {
    getSync.mockResolvedValue(snapshot);
    const first = new MirrorStore("i");
    first.start();
    flushSync();
    await vi.waitFor(() => expect(first.mirror).not.toBeNull());
    first.setToolExpanded(["t"], true);
    const old = mock.request.mock.calls.find(([method]) => method === "tool.subscribe")![1];
    first.stop();
    const second = new MirrorStore("i");
    second.start();
    flushSync();
    try {
      await vi.waitFor(() => expect(second.mirror).not.toBeNull());
      second.setToolExpanded(["t"], true);
      const current = mock.request.mock.calls.filter(([method]) => method === "tool.subscribe").at(-1)![1];
      expect(current.subscriptionId).not.toBe(old.subscriptionId);
      emit("tool.object", { ...old, event: {
        type: "snapshot", revision: 0, value: { id: "t", name: "bash", content: [{ type: "text", text: "stale" }] },
      } });
      expect(second.objects.has("t")).toBe(false);
    } finally { second.stop(); }
  });
});
