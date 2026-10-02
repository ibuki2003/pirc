// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { flushSync } from "svelte";
import type { SessionSummary, SessionListing } from "@pirc/api";

const mock = vi.hoisted(() => ({
  list: vi.fn(), request: vi.fn(),
  listener: undefined as undefined | ((params: unknown, method: string) => void),
}));
vi.mock("./http.ts", () => ({ http: { listSessions: mock.list } }));
vi.mock("./connection.svelte.ts", () => ({ connection: {
  peer: { request: mock.request }, generation: 1,
  listen: (listener: typeof mock.listener) => { mock.listener = listener; return () => { mock.listener = undefined; }; },
} }));
import { Sessions } from "./sessions.svelte.ts";

test("HTTP supplies previews; WS deltas preserve them and never fetch the list", async () => {
  const a: SessionListing = {
    instanceId: "a", hostId: "h", hostname: "box", sessionId: "s", cwd: "/", entryCount: 1,
    connectedAt: "", lastActivityAt: "", status: { streaming: true, compacting: false, pendingMessages: false },
  };
  const b = { ...a, instanceId: "b" };
  mock.request.mockResolvedValue([a, b]);
  let resolve!: (items: SessionSummary[]) => void;
  mock.list.mockImplementationOnce(() => new Promise<SessionSummary[]>(done => { resolve = done; }));
  const sessions = new Sessions();
  const stop = sessions.start();
  expect(mock.list).not.toHaveBeenCalled();
  // Entering SessionList requests the preview snapshot; starting the global store does not.
  void sessions.refreshPreviews();
  try {
    flushSync();
    await vi.waitFor(() => expect(sessions.items).toHaveLength(2));
    mock.listener?.({ upsert: [{ ...a, name: "renamed" }], removed: ["b"] }, "sessions.changed");
    resolve([{ ...a, messagePreview: { role: "assistant", text: "HTTP preview" } }, b]);
    await vi.waitFor(() => expect(sessions.items[0].messagePreview?.text).toBe("HTTP preview"));
    expect(sessions.items).toHaveLength(1);
    expect(sessions.items[0].name).toBe("renamed");
    mock.listener?.({ upsert: [{ ...a, name: "renamed", entryCount: 2 }], removed: [] }, "sessions.changed");
    expect(sessions.items[0].messagePreview?.text).toBe("HTTP preview");
    expect(mock.list).toHaveBeenCalledTimes(1);
    mock.list.mockResolvedValue([{ ...a, messagePreview: { role: "user", text: "refreshed on navigation" } }]);
    await Promise.all([sessions.refreshPreviews(), sessions.refreshPreviews()]);
    expect(mock.list).toHaveBeenCalledTimes(2);
    expect(sessions.items[0].entryCount).toBe(2);
    expect(sessions.items[0].messagePreview?.text).toBe("refreshed on navigation");
  } finally { stop(); }
});
