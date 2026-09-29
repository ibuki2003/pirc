import { assertEquals } from "@std/assert";
import { MOBILE_STREAM, type SessionState, type SyncOp } from "@pirc/api";
import { Registry } from "../core/registry.ts";
import { initialSummary } from "../core/summary.ts";
import type { ClientConnection } from "../core/client-connection.ts";
import type { HostConnection } from "../core/host-connection.ts";

Deno.test("replacement host retains subscribers and requests resync", () => {
  const registry = new Registry();
  const state = {
    instanceId: "i",
    hostId: "h",
    hostname: "box",
    sessionId: "s",
    cwd: "/",
    piVersion: "1",
    availableThinkingLevels: [],
    status: { streaming: false, compacting: false, pendingMessages: false },
  } as SessionState;
  const calls: string[] = [];
  const client = {
    streams: new Map(),
    resync: () => calls.push("resync"),
    paused: () => false,
    closed: () => {},
    forget: () => {},
    ops: (_id: string, ops: SyncOp[]) => calls.push(`ops:${ops.length}`),
  } as unknown as ClientConnection;
  const old = {
    summary: initialSummary(state, 0),
    viewers: () => {},
    close: () => registry.unregister(old),
  } as unknown as HostConnection;
  registry.register(old);
  registry.attach(client, "i", MOBILE_STREAM);
  registry.unregister(old);
  const next = {
    summary: initialSummary(state, 0),
    viewers: () => {},
    close: () => {},
  } as unknown as HostConnection;
  registry.register(next);
  registry.fanout("i", [{ seq: 1, op: "set", target: "leaf", value: "e" }]);
  assertEquals(calls, ["resync", "ops:1"]);
  registry.unregister(next, "quit");
});
