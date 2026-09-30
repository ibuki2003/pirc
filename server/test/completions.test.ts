import { assertEquals } from "@std/assert";
import type { SessionState, SyncOp } from "@pirc/api";
import { completions, initialSummary } from "../core/summary.ts";
import { Registry } from "../core/registry.ts";
import type { ClientConnection } from "../core/client-connection.ts";

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
  registry.subscribeCompletions(client);
  registry.completed({ instanceId: "i", hostname: "box", cwd: "/work" });
  registry.remove(client);
  registry.completed({ instanceId: "i", hostname: "box", cwd: "/work" });
  assertEquals(received, ["completed"]);
});
