import { expect, it, vi } from "vitest";
import type { Handlers, RpcPeer } from "../../api/src/index.ts";
import type { HostToServer, ServerToHost } from "../../api/src/host-protocol.ts";
import type { SessionState } from "../../api/src/model.ts";

const mock = vi.hoisted(() => ({ clients: [] as Array<{
  onStatus?: (status: "connecting" | "connected" | "disconnected", peer?: unknown) => void;
  handlers: unknown;
  start: () => void;
  stop: () => void;
}> }));
vi.mock("../../api/src/index.ts", () => ({
  PROTOCOL_VERSION: 1,
  WsClient: class {
    onStatus?: (status: "connecting" | "connected" | "disconnected", peer?: unknown) => void;
    constructor(_url: string, readonly handlers: unknown) { mock.clients.push(this); }
    start() {}
    stop() { this.onStatus?.("disconnected"); }
  },
}));

import { Connection } from "./connection.ts";

it("ignores late socket and RPC callbacks after shutdown, including a pending hello", async () => {
  vi.useFakeTimers();
  try {
    const statuses: string[] = [];
    const handler = vi.fn();
    const connection = new Connection("ws://localhost/api/host", {
      requests: { "host.sync": () => { handler(); throw new Error("Should not run"); } },
      notifications: { "host.viewers": () => { handler(); } },
    }, () => ({} as SessionState), () => 0, status => statuses.push(status));
    const client = mock.clients.at(-1)!;
    const callback = client.onStatus!;
    let finishHello!: (value: {}) => void;
    const peer = {
      request: vi.fn(() => new Promise<{}>(resolve => { finishHello = resolve; })),
      notify: vi.fn(),
      close: vi.fn(),
    } as unknown as RpcPeer<ServerToHost, HostToServer>;
    callback("connected", peer);
    connection.close({ reason: "reload" });
    callback("disconnected");
    const guarded = client.handlers as Handlers<ServerToHost>;
    expect(() => guarded.requests?.["host.sync"]?.({ branchLimit: 1 })).toThrow("Session is closed");
    guarded.notifications?.["host.viewers"]?.({ count: 1 });
    finishHello({});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(statuses).toEqual(["connecting"]);
    expect(handler).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
