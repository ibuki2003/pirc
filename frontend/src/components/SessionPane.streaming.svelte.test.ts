// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import {
  RpcPeer, type ClientToServer, type ServerToClient, type Handlers, type Transport,
  type SessionState, type ProjectedEntry, type SyncOp, type ToolProgress,
} from "@pirc/api";
import { Runtime } from "../../../server/core/runtime.ts";
import { projectEntry, projectOps, projectRuntime } from "../../../server/core/projection.ts";

const mock = vi.hoisted(() => ({
  getSync: vi.fn(), getEntry: vi.fn(),
  peer: undefined as undefined | ((handlers: Handlers<ServerToClient>) => { close(): void }),
}));
vi.mock("@pirc/api", async importOriginal => ({
  ...await importOriginal<typeof import("@pirc/api")>(),
  WsClient: class {
    onStatus?: (status: string, peer?: unknown) => void;
    private peer?: { close(): void };
    constructor(_url: string, private handlers: Handlers<ServerToClient>) {}
    start() { this.peer = mock.peer!(this.handlers); this.onStatus?.("connected", this.peer); }
    stop() { this.peer?.close(); this.onStatus?.("disconnected"); }
  },
  HttpClient: class { getSync = mock.getSync; getEntry = mock.getEntry; },
}));
vi.mock("../lib/sessions.svelte.ts", () => ({ sessions: { items: [] } }));

import { connection } from "../lib/connection.svelte.ts";
import SessionPane from "./SessionPane.svelte";

function pair(): [Transport, Transport] {
  const messages: ((data: string | Uint8Array) => void)[] = [];
  const closes: (() => void)[] = [];
  const side = (index: number): Transport => ({
    send: data => messages[1 - index](data),
    close: () => closes.forEach(close => close()),
    onMessage: handler => { messages[index] = handler; },
    onClose: handler => { closes.push(handler); },
  });
  return [side(0), side(1)];
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

test.each([
  { name: "bash", args: { command: "echo result" }, available: true },
  { name: "apply_patch", args: { patch: "*** Begin Patch\n*** Update File: a.ts\n@@\n-old\n+new\n*** End Patch" }, available: true },
  { name: "read", args: { path: "a.ts" }, available: true },
  { name: "write", args: { path: "a.ts", content: "new" }, available: true },
  { name: "edit", args: { path: "a.ts", oldText: "old", newText: "new" }, available: true },
  { name: "bash", args: { command: "echo result" }, available: false },
])("expanded $name uses no extra HTTP from generation to EOF (randomUUID: $available)", async ({ name, args, available }) => {
  if (!available) vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const state: SessionState = {
    instanceId: "i", hostId: "h", hostname: "box", sessionId: "s", piVersion: "1", cwd: "/repo",
    availableThinkingLevels: [], status: { streaming: true, compacting: false, pendingMessages: false },
  };
  const call = { type: "toolCall" as const, id: "t", name, arguments: args as Record<string, unknown> };
  const partial = { ...call, arguments: {} };
  const progress: ToolProgress = { toolName: name, startedAt: 1, output: "start", totalBytes: 5, truncatedHead: false };
  const runtime = new Runtime({ seq: 0, state,
    live: { provider: "p", model: "m", startedAt: 1, content: [partial] },
    calls: { t: partial }, tools: {}, toolDurations: {} });
  const history: ProjectedEntry[] = [];
  const assistant = {
    index: 0, entry: { type: "message", id: "a", parentId: null, timestamp: "",
      message: { role: "assistant", content: [call] } },
  } as unknown as ProjectedEntry;
  mock.getSync.mockImplementation(async (_id, options) => ({
    seq: runtime.sequence, entryCount: history.length, leafId: history.at(-1)?.entry.id ?? null,
    lastEntryId: history.at(-1)?.entry.id ?? null, hasMoreBefore: false,
    mode: options?.since === undefined ? "full" : "delta",
    entries: history.filter(item => item.index >= (options?.since ?? 0)).map(item => projectEntry(item, { toolOutputBytes: 2048 })),
  }));
  mock.getEntry.mockImplementation(async (_id, id) => history.find(item => item.entry.id === id));
  const [serverTransport, browserTransport] = pair();
  const subscriptions = new Map<string, string>();
  let server!: RpcPeer<ClientToServer, ServerToClient>;
  mock.peer = handlers => {
    server = new RpcPeer<ClientToServer, ServerToClient>(serverTransport, { requests: {
      "session.attach": () => {
        server.notify("session.runtime", { instanceId: "i", snapshot: projectRuntime(runtime.snapshot(), { toolOutputBytes: 2048 }) });
        return {};
      },
      "session.detach": () => { subscriptions.clear(); return {}; },
      "tool.subscribe": ({ toolCallId, subscriptionId }) => {
        subscriptions.set(toolCallId, subscriptionId);
        const object = runtime.objects.get(toolCallId);
        server.notify("tool.object", { instanceId: "i", toolCallId, subscriptionId,
          event: object ? { type: "snapshot", revision: object.revision, value: object.value } : { type: "unavailable" } });
        return {};
      },
      "tool.unsubscribe": ({ toolCallId }) => { subscriptions.delete(toolCallId); return {}; },
      ping: () => ({}),
    } });
    return new RpcPeer<ServerToClient, ClientToServer>(browserTransport, handlers);
  };
  const publish = async (ops: SyncOp[]) => {
    runtime.apply(ops, (toolCallId, event) => {
      const subscriptionId = subscriptions.get(toolCallId);
      if (!subscriptionId) return;
      server.notify("tool.object", { instanceId: "i", toolCallId, subscriptionId, event });
      if (event.type === "end") subscriptions.delete(toolCallId);
    });
    server.notify("session.ops", { instanceId: "i", ops: projectOps(ops, { toolOutputBytes: 2048 }, new Set(subscriptions.keys())) });
    await connection.peer!.request("ping", {});
    await tick();
  };
  const target = document.createElement("div");
  const component = mount(SessionPane, { target, props: { instanceId: "i", onswitch: () => {} } });
  try {
    connection.start();
    flushSync();
    await vi.waitFor(() => expect(target.querySelector("details.tool")).not.toBeNull());
    const details = target.querySelector("details.tool") as HTMLDetailsElement;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    await vi.waitFor(() => expect(subscriptions.has("t")).toBe(true));
    history.push(assistant);
    await publish([
      { seq: 1, op: "set", target: "live.content", index: 0, value: call },
      { seq: 2, op: "append", target: "entries", from: 0, items: [assistant] },
      { seq: 3, op: "set", target: "live", value: null },
      { seq: 4, op: "set", target: "tool", key: "t", value: progress },
    ]);
    expect((target.querySelector("details.tool") as HTMLDetailsElement).open).toBe(true);
    expect(mock.getEntry).not.toHaveBeenCalled();
    for (let seq = 5; seq <= 7; seq++) {
      await publish([{ seq, op: "set", target: "tool", key: "t", value: {
        ...progress, output: `start ${seq}`, totalBytes: 7,
      } }]);
      if (name === "bash") expect(target.textContent).toContain(`start ${seq}`);
      expect(mock.getSync).toHaveBeenCalledTimes(1);
      expect(mock.getEntry).not.toHaveBeenCalled();
    }
    const result: ProjectedEntry = { index: 1, entry: {
      type: "message", id: "r", parentId: "a", timestamp: "", message: {
        role: "toolResult", toolName: name, toolCallId: "t", isError: false, timestamp: 1,
        content: [{ type: "text", text: "final result" }],
      },
    } };
    history.push(result);
    await publish([
      { seq: 8, op: "set", target: "tool", key: "t", value: null },
      { seq: 9, op: "append", target: "entries", from: 1, items: [result] },
    ]);
    expect(target.textContent).toContain("final result");
    expect((target.querySelector("details.tool") as HTMLDetailsElement).open).toBe(true);
    expect(mock.getSync).toHaveBeenCalledTimes(1);
    expect(mock.getEntry).not.toHaveBeenCalled();
  } finally {
    await unmount(component);
    connection.stop();
    server?.close();
  }
});
