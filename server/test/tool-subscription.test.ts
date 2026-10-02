import { assertEquals } from "@std/assert";
import {
  MOBILE_STREAM, RpcPeer, type ClientToServer, type ServerToClient, type SessionState, type Transport, type ToolObjectEvent,
} from "@pirc/api";
import { Registry } from "../core/registry.ts";
import { ClientConnection } from "../core/client-connection.ts";
import type { HostConnection } from "../core/host-connection.ts";
import { Runtime } from "../core/runtime.ts";
import { initialSummary } from "../core/summary.ts";

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

Deno.test("subscribe sends current state before patches, EOF unsubscribes, and late subscribers use HTTP", async () => {
  const registry = new Registry();
  const state = { instanceId: "i", hostId: "h", status: { streaming: true } } as SessionState;
  const command = "echo done" + " ".repeat(5000);
  const runtime = new Runtime({ seq: 0, state, live: null, tools: {}, toolDurations: {}, calls: {
    t: { type: "toolCall", id: "t", name: "bash", arguments: { command } },
  } });
  const host = { summary: initialSummary(state, 0), runtime, viewers: () => {} } as unknown as HostConnection;
  registry.register(host);
  const [serverTransport, browserTransport] = pair();
  const client = new ClientConnection(registry, serverTransport, { bufferedAmount: 0 } as WebSocket);
  const events: ToolObjectEvent[] = [];
  let current = false;
  let resyncs = 0;
  const browser = new RpcPeer<ServerToClient, ClientToServer>(browserTransport, { notifications: {
    "session.runtime": () => { current = true; },
    "tool.object": ({ event }) => { events.push(event); },
    "session.resync": () => { resyncs++; },
  } });
  try {
    await browser.request("session.attach", { instanceId: "i", stream: MOBILE_STREAM });
    assertEquals(current, true);
    await browser.request("tool.subscribe", { instanceId: "i", toolCallId: "t", subscriptionId: "new" });
    assertEquals(events[0].type, "snapshot");
    assertEquals(events[0].type === "snapshot" && events[0].value.arguments?.command, command);
    await browser.request("tool.unsubscribe", { instanceId: "i", toolCallId: "t", subscriptionId: "old" });
    assertEquals(client.toolSubscriptions.get("i")?.get("t"), "new");
    runtime.apply([{ seq: 1, op: "append", target: "entries", from: 0, items: [{
      index: 0, entry: { id: "r", parentId: null, timestamp: "", type: "message",
        message: { role: "toolResult", toolCallId: "t", toolName: "bash", isError: false,
          content: [{ type: "text", text: "done" }], timestamp: 1 } },
    }] }], (id, event) => registry.toolObject("i", id, event));
    // A subsequent RPC response is ordered after the queued object notifications.
    await browser.request("ping", {});
    assertEquals(events.map(event => event.type), ["snapshot", "patch", "end"]);
    assertEquals(client.toolSubscriptions.get("i")?.has("t"), false);
    assertEquals(resyncs, 0);
    await browser.request("tool.subscribe", { instanceId: "i", toolCallId: "t", subscriptionId: "late" });
    assertEquals(events.at(-1), { type: "unavailable" });
    assertEquals(client.toolSubscriptions.get("i")?.has("t"), false);
  } finally {
    browser.close();
    registry.unregister(host, "quit");
  }
});
