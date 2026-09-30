// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushSync, tick } from "svelte";
import type { SessionSnapshot, SessionState } from "@pirc/api";

const { getSync } = vi.hoisted(() => ({ getSync: vi.fn() }));
vi.mock("@pirc/api", async importOriginal => ({
  ...await importOriginal<typeof import("@pirc/api")>(),
  HttpClient: class { getSync = getSync; },
}));
vi.mock("../connection.svelte.ts", () => ({
  connection: {
    peer: { request: async () => ({}) },
    generation: 1,
    listen: () => () => {},
  },
}));
vi.mock("../visibility.ts", () => ({ watchVisibility: () => () => {} }));

import { MirrorStore } from "./mirror-store.svelte.ts";

const snapshot: SessionSnapshot = {
  mode: "full", seq: 0, entryCount: 0, lastEntryId: null, leafId: null,
  state: { instanceId: "i" } as SessionState,
  entries: [], hasMoreBefore: false, live: null, tools: {}, toolDurations: {},
};

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
    await store.setStream({ toolOutputBytes: 4096 });
    await vi.waitFor(() => expect(store.error).toContain("HTTP 504"));
    await tick();
    expect(getSync).toHaveBeenCalledTimes(2);
    expect(getSync.mock.calls[0][1].since).toBe(0);
    expect(getSync.mock.calls[1][1].since).toBeUndefined();
    store.stop();
  });
});
