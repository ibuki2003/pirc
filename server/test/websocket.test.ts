import { assert, assertEquals } from "@std/assert";
import { once } from "node:events";
import type { IncomingMessage } from "node:http";
// @deno-types="@types/ws"
import WebSocket from "ws";
import { Registry } from "../core/registry.ts";
import { createPircServer } from "../ws/server.ts";
import { decodeFrame } from "@pirc/api";

Deno.test("WS negotiates context takeover, compresses repeated JSON, and accepts plain clients", async () => {
  const server = createPircServer(new Registry(), {
    port: 0,
    staticDir: "",
    allowedOrigins: new Set(["http://localhost"]),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const clients: WebSocket[] = [];
  try {
    const http = await fetch(`${url}/api/sessions`);
    assertEquals(http.status, 200);
    assertEquals(await http.json(), []);

    for (const compress of [true, false]) {
      const ws = new WebSocket(`${url}/api/ws`, {
        headers: { Origin: "http://localhost" },
        perMessageDeflate: compress,
      });
      clients.push(ws);
      const upgrade = once(ws, "upgrade");
      const open = once(ws, "open");
      const [response] = await upgrade as [IncomingMessage];
      await open;
      const extension = response.headers["sec-websocket-extensions"];
      if (compress) {
        assertEquals(extension, "permessage-deflate");
      } else {
        assertEquals(extension, undefined);
      }
      // A mostly incompressible string makes reuse of the *previous* message's
      // window observable, rather than merely compression within one message.
      const method = Array.from(
        crypto.getRandomValues(new Uint8Array(6000)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const sizes: number[] = [];
      for (let i = 0; i < 2; i++) {
        const before = response.socket.bytesRead;
        const reply = once(ws, "message");
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method }));
        const [data, binary] = await reply;
        assertEquals(binary, !compress);
        const decoded = await decodeFrame(
          binary ? new Uint8Array(data) : data.toString(),
        ) as { error: { message: string } };
        assertEquals(decoded.error.message, `Unknown method: ${method}`);
        sizes.push(response.socket.bytesRead - before);
      }
      if (compress) {
        assert(sizes[1] < sizes[0] / 4, `Dictionary was not reused: ${sizes}`);
      } else {
        assertEquals(sizes[1], sizes[0]);
        assert(sizes[0] < 12000);
      }
      const smallSizes: number[] = [];
      for (let i = 0; i < 2; i++) {
        const before = response.socket.bytesRead;
        const reply = once(ws, "message");
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "small-stream-update",
          }),
        );
        const [data, binary] = await reply;
        assertEquals(binary, false);
        assertEquals(JSON.parse(data.toString()).id, 2);
        smallSizes.push(response.socket.bytesRead - before);
      }
      if (compress) {
        assert(
          smallSizes[1] < smallSizes[0],
          `Small messages did not reuse the dictionary: ${smallSizes}`,
        );
      } else {
        assertEquals(smallSizes[1], smallSizes[0]);
      }
    }
    for (
      const [path, origin] of [
        ["/api/ws", "https://foreign.example"],
        ["/api/notify", "http://localhost"],
      ]
    ) {
      const rejected = new WebSocket(`${url}${path}`, {
        headers: { Origin: origin },
      });
      clients.push(rejected);
      const response = await new Promise<IncomingMessage>((resolve) => {
        rejected.on("error", () => {});
        rejected.once(
          "unexpected-response",
          (_request, response) => resolve(response),
        );
      });
      assertEquals(response.statusCode, 403);
      response.resume();
      rejected.terminate();
    }
  } finally {
    await Promise.all(
      clients.filter((ws) => ws.readyState === WebSocket.OPEN).map(
        async (ws) => {
          const closed = once(ws, "close");
          ws.close();
          await closed;
        },
      ),
    );
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});
