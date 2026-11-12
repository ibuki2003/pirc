import { assertEquals } from "@std/assert";
import type { ServerToClient, SessionState, SyncOp } from "@pirc/api";
import { completions, initialSummary } from "../core/summary.ts";
import { Registry } from "../core/registry.ts";
import type { ClientConnection } from "../core/client-connection.ts";
import type { HostConnection } from "../core/host-connection.ts";

const state: SessionState = {
  instanceId: "i", hostId: "h", hostname: "box", sessionId: "s", cwd: "/work",
  piVersion: "1", availableThinkingLevels: [],
  status: { streaming: false, compacting: false, pendingMessages: false },
};
const running = { ...state, status: { ...state.status, streaming: true } };
const op = (seq: number, value: SessionState): SyncOp => ({ seq, op: "set", target: "state", value });

Deno.test("completion detection preserves transitions inside a single batch", () => {
  const summary = initialSummary(state, 0);
  assertEquals(completions(summary, [op(1, running), op(2, state), op(3, running), op(4, state)]), [
    { instanceId: "i", hostname: "box", cwd: "/work", name: undefined },
    { instanceId: "i", hostname: "box", cwd: "/work", name: undefined },
  ]);
  assertEquals(completions(summary, [op(1, state)]), []);
  assertEquals(completions(initialSummary(running, 0), [op(1, state), op(2, state)]).length, 1);
});

Deno.test("only completion subscribers receive completion events", () => {
  const registry = new Registry();
  const received: string[] = [];
  const client = { streams: new Map(), completed: () => received.push("completed") } as unknown as ClientConnection;
  registry.subscribeCompletions(client, { activityWindowSeconds: 0, delaySeconds: 0 });
  registry.completed({ instanceId: "i", hostname: "box", cwd: "/work" });
  registry.remove(client);
  registry.completed({ instanceId: "i", hostname: "box", cwd: "/work" });
  assertEquals(received, ["completed"]);
});

Deno.test("activity window is per session, includes the boundary, and clears on session exit", () => {
  const registry = new Registry();
  const received: ServerToClient["notifications"]["session.completed"][] = [];
  const client = { completed: (session: typeof received[number]) => received.push(session) } as unknown as ClientConnection;
  const host = {
    summary: initialSummary(state, 0),
    viewers: () => {},
  } as unknown as HostConnection;
  registry.register(host);
  registry.subscribeCompletions(client, { activityWindowSeconds: 10, delaySeconds: 0 });
  const completion = { instanceId: "i", hostname: "box", cwd: "/work" };
  const original = Date.now;
  let now = 100000;
  Date.now = () => now;
  try {
    registry.completed(completion);
    assertEquals(received.length, 1);
    registry.activity("i");
    registry.completed(completion);
    assertEquals(received.length, 1);
    registry.completed({ ...completion, instanceId: "other" });
    assertEquals(received.length, 2);
    now += 10000;
    registry.completed(completion);
    assertEquals(received.length, 2);
    now++;
    registry.completed(completion);
    assertEquals(received.length, 3);
    registry.activity("i");
    registry.unregister(host, "quit");
    registry.register(host);
    registry.completed(completion);
    assertEquals(received.length, 4);
  } finally {
    Date.now = original;
    registry.unregister(host, "quit");
    registry.unsubscribeCompletions(client);
  }
});

Deno.test("delayed completions are per subscriber and canceled by activity, disconnection, and unsubscribe", async () => {
  const registry = new Registry();
  const host = { summary: initialSummary(state, 0), viewers: () => {} } as unknown as HostConnection;
  const received: string[] = [];
  const first = { completed: () => received.push("first") } as unknown as ClientConnection;
  const second = { completed: () => received.push("second") } as unknown as ClientConnection;
  const completion = { instanceId: "i", hostname: "box", cwd: "/work" };
  const wait = () => new Promise(resolve => setTimeout(resolve, 40));
  registry.register(host);
  registry.subscribeCompletions(first, { activityWindowSeconds: 0, delaySeconds: 0.01 });
  registry.subscribeCompletions(second, { activityWindowSeconds: 10, delaySeconds: 0.02 });
  try {
    registry.completed(completion);
    assertEquals(received, []);
    await wait();
    assertEquals(received, ["first", "second"]);
    received.length = 0;
    registry.completed(completion);
    registry.activity("i");
    await wait();
    assertEquals(received, []);
    // The first subscriber ignores activity before completion; the second does not.
    registry.completed(completion);
    registry.completed(completion);
    await wait();
    assertEquals(received, ["first", "first"]);
    received.length = 0;
    registry.completed(completion);
    registry.unsubscribeCompletions(first);
    await wait();
    assertEquals(received, []);
    registry.subscribeCompletions(first, { activityWindowSeconds: 0, delaySeconds: 0.01 });
    registry.completed(completion);
    registry.unregister(host);
    await wait();
    assertEquals(received, []);
  } finally {
    registry.unsubscribeCompletions(first);
    registry.unsubscribeCompletions(second);
    registry.unregister(host, "quit");
    // Let the registry's session-list debounce finish.
    await new Promise(resolve => setTimeout(resolve, 120));
  }
});
