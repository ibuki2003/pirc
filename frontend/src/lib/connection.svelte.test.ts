// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import type { Handlers, ServerToClient, RuntimeSnapshot } from "@pirc/api";

const mock = vi.hoisted(() => ({ handlers: undefined as Handlers<ServerToClient> | undefined }));
vi.mock("@pirc/api", async importOriginal => ({
  ...await importOriginal<typeof import("@pirc/api")>(),
  WsClient: class {
    constructor(_url: string, handlers: Handlers<ServerToClient>) { mock.handlers = handlers; }
    start() {}
    stop() {}
  },
}));

import { Connection } from "./connection.svelte.ts";

test("forwards every server notification through the actual connection listener", () => {
  const connection = new Connection();
  const listener = vi.fn();
  const off = connection.listen(listener);
  const notifications = {
    "sessions.changed": { upsert: [], removed: [] },
    "session.completed": { instanceId: "i", hostname: "h", cwd: "/" },
    "session.ops": { instanceId: "i", ops: [] },
    "session.runtime": { instanceId: "i", snapshot: { seq: 0 } as RuntimeSnapshot },
    "tool.object": { instanceId: "i", toolCallId: "t", subscriptionId: "s", event: { type: "unavailable" as const } },
    "session.notice": { instanceId: "i", level: "info" as const, message: "notice" },
    "session.resync": { instanceId: "i", reason: "backpressure" as const },
    "session.closed": { instanceId: "i", reason: "quit" as const, hostId: "h" },
  } satisfies ServerToClient["notifications"];
  // Completion notifications belong to the separate completion subscription client.
  const { "session.completed": _, ...sessionNotifications } = notifications;
  for (const [method, params] of Object.entries(sessionNotifications)) {
    const handler = mock.handlers?.notifications?.[method as keyof typeof sessionNotifications];
    expect(handler, method).toBeDefined();
    (handler as (params: unknown) => void)(params);
    expect(listener).toHaveBeenLastCalledWith(params, method);
  }
  off();
  mock.handlers?.notifications?.["session.runtime"]?.(notifications["session.runtime"]);
  expect(listener).toHaveBeenCalledTimes(Object.keys(sessionNotifications).length);
});
