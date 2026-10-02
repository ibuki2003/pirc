import { assertEquals } from "@std/assert";
import { type SessionState } from "@pirc/api";
import { Registry } from "../core/registry.ts";
import { initialSummary, listingKey, updateSummary } from "../core/summary.ts";
import type { ClientConnection } from "../core/client-connection.ts";
import type { HostConnection } from "../core/host-connection.ts";
import { projectOps, projectRuntime } from "../core/projection.ts";

const state: SessionState = {
  instanceId: "a", hostId: "h", hostname: "box", sessionId: "s", cwd: "/", piVersion: "1",
  availableThinkingLevels: [], status: { streaming: true, compacting: false, pendingMessages: false },
  messagePreview: { role: "assistant", text: "HTTP only" },
};
Deno.test("live output and preview changes do not change session listing metadata", () => {
  const summary = initialSummary(state, 1);
  const progress = updateSummary(summary, [{ seq: 1, op: "set", target: "tool", key: "t", value: {
    toolName: "bash", startedAt: 1, output: "updated", totalBytes: 7, truncatedHead: false,
  } }]);
  assertEquals(listingKey(progress), listingKey(summary));
  assertEquals(progress.lastActivityAt, summary.lastActivityAt);
  const changed = updateSummary(summary, [{ seq: 2, op: "set", target: "state", value: {
    ...state, messagePreview: { role: "user", text: "new HTTP preview" },
  } }]);
  assertEquals(listingKey(changed), listingKey(summary));
  assertEquals(changed.lastActivityAt, summary.lastActivityAt);
  assertEquals(changed.messagePreview?.text, "new HTTP preview");
});
Deno.test("runtime projection never carries message previews", () => {
  const runtime = projectRuntime({ seq: 0, state, live: null, calls: {}, tools: {}, toolDurations: {} }, { toolOutputBytes: 2048 });
  assertEquals("messagePreview" in runtime.state, false);
  const [op] = projectOps([{ seq: 1, op: "set", target: "state", value: state }], { toolOutputBytes: 2048 });
  assertEquals(op.op === "set" && op.target === "state" && "messagePreview" in op.value, false);
});
Deno.test("session list subscribers receive only changed metadata, additions and removals, never previews", async () => {
  const registry = new Registry();
  const a = { summary: initialSummary(state, 1), viewers: () => {} } as unknown as HostConnection;
  const b = { summary: initialSummary({ ...state, instanceId: "b" }, 1), viewers: () => {} } as unknown as HostConnection;
  const notifications: unknown[] = [];
  const client = { sessionsChanged: (upsert: unknown, removed: unknown) => notifications.push({ upsert, removed }) } as unknown as ClientConnection;
  const flush = () => new Promise(resolve => setTimeout(resolve, 550));
  registry.register(a);
  registry.register(b);
  const initial = registry.subscribe(client);
  assertEquals(initial.map(item => "messagePreview" in item), [false, false]);
  await flush();
  assertEquals(notifications, []);
  a.summary = { ...a.summary, messagePreview: { role: "assistant", text: "updated" } };
  registry.changed();
  await flush();
  assertEquals(notifications, []);
  a.summary = { ...a.summary, name: "changed" };
  registry.unregister(b, "quit");
  registry.changed();
  await flush();
  const { messagePreview: _, ...expected } = a.summary;
  assertEquals(notifications, [{ upsert: [expected], removed: ["b"] }]);
  assertEquals(registry.list()[0].messagePreview?.text, "updated");
  registry.unsubscribe(client);
  registry.unregister(a, "quit");
  await flush();
});
