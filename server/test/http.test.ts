import { assertEquals } from "@std/assert";
import { router } from "../http/router.ts";
import { Registry } from "../core/registry.ts";
import { initialSummary } from "../core/summary.ts";
import type { HostConnection } from "../core/host-connection.ts";
import type { SessionState } from "@pirc/api";

Deno.test("HTTP sync forwards cursor and projects with query stream", async () => {
  const registry = new Registry();
  const state: SessionState = {
    instanceId: "i",
    hostId: "h",
    hostname: "box",
    piVersion: "1",
    sessionId: "s",
    cwd: "/",
    availableThinkingLevels: [],
    status: { streaming: false, compacting: false, pendingMessages: false },
  };
  let params: unknown;
  const host = {
    summary: initialSummary(state, 1),
    viewers: () => {},
    peer: {
      request: (_method: string, p: unknown) => {
        params = p;
        return Promise.resolve({
          seq: 3,
          entryCount: 1,
          lastEntryId: "e",
          leafId: "e",
          hasMoreBefore: false,
          mode: "delta",
          state,
          live: null,
          tools: {}, toolDurations: {},
          entries: [{
            index: 0,
            entry: {
              type: "message",
              id: "e",
              parentId: null,
              timestamp: "",
              message: {
                role: "toolResult",
                content: [{ type: "text", text: "long" }],
              },
            },
          }],
        });
      },
    },
  } as unknown as HostConnection;
  registry.register(host);
  const handle = router(registry, {
    port: 8787,
    staticDir: "",
    allowedOrigins: new Set(),
  });
  const response = await handle(
    new Request(
      "http://localhost:8787/api/sessions/i/sync?since=0&branchLimit=7",
    ),
  );
  assertEquals(response.status, 200);
  assertEquals(params, { since: 0, branchLimit: 7 });
  const body = await response.json();
  assertEquals(body.entries[0].entry, {
    type: "redacted", redacted: true, id: "e", parentId: null, timestamp: "",
    originalBytes: new TextEncoder().encode(JSON.stringify({
      type: "message", id: "e", parentId: null, timestamp: "",
      message: { role: "toolResult", content: [{ type: "text", text: "long" }] },
    })).length,
    role: "toolResult",
  });
  registry.unregister(host, "quit");
});

Deno.test("browser Origin cannot bypass /api/ws through /api/notify", async () => {
  const handle = router(new Registry(), {
    port: 8787,
    staticDir: "",
    allowedOrigins: new Set(),
  });
  for (const [path, origin] of [
    ["/api/notify", "http://localhost:8787"],
    ["/api/notify", "https://foreign.example"],
    ["/api/ws", ""],
  ]) {
    const headers = new Headers({ upgrade: "websocket" });
    if (origin) headers.set("origin", origin);
    const response = await handle(new Request(`http://localhost:8787${path}`, { headers }));
    assertEquals(response.status, 403);
  }
});
