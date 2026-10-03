import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
// @deno-types="@types/ws"
import { WebSocketServer } from "ws";
import { MAX_MESSAGE_BYTES, type Transport } from "@pirc/api";
import type { Config } from "../config.ts";
import type { Registry } from "../core/registry.ts";
import { ClientConnection } from "../core/client-connection.ts";
import { HostConnection } from "../core/host-connection.ts";
import { router } from "../http/router.ts";

function request(message: IncomingMessage): Request {
  const headers = new Headers();
  for (let i = 0; i < message.rawHeaders.length; i += 2) {
    headers.append(message.rawHeaders[i], message.rawHeaders[i + 1]);
  }
  return new Request(
    new URL(message.url ?? "/", `http://${headers.get("host") ?? "localhost"}`),
    { method: message.method, headers },
  );
}

async function respond(
  response: Response,
  output: ServerResponse,
): Promise<void> {
  output.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    await pipeline(Readable.from(response.body), output);
  } else {
    output.end();
  }
}

export function createPircServer(registry: Registry, config: Config) {
  const handle = router(registry, config);
  const server = createServer((input, output) => {
    void handle(request(input)).then((response) => respond(response, output))
      .catch((error) => {
        console.error("HTTP request failed", error);
        if (!output.headersSent) output.writeHead(500);
        output.end();
      });
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    // Keep the sliding window across messages, including small streaming updates.
    perMessageDeflate: {
      serverNoContextTakeover: false,
      clientNoContextTakeover: false,
      concurrencyLimit: 4,
    },
  });
  server.on("upgrade", (input, socket, head) => {
    let upgraded = false;
    const accept = router(registry, config, (req) => {
      wss.handleUpgrade(input, socket, head, (ws) => {
        upgraded = true;
        let alive = true;
        ws.on("pong", () => {
          alive = true;
        });
        const heartbeat = setInterval(() => {
          if (!alive) {
            ws.terminate();
            return;
          }
          alive = false;
          ws.ping();
        }, 30_000);
        ws.on("close", () => clearInterval(heartbeat));
        const transport: Transport = {
          websocketCompression: ws.extensions.split(",").includes(
            "permessage-deflate",
          ),
          send: (data) => ws.send(data),
          close: (code, reason) => ws.close(code, reason),
          onMessage: (handler) =>
            ws.on("message", (data, binary) => {
              handler(
                binary ? new Uint8Array(data as Buffer) : data.toString(),
              );
            }),
          onClose: (handler) => ws.on("close", handler),
        };
        ws.on("error", (error) => console.error("WebSocket failed", error));
        if (new URL(req.url).pathname === "/api/host") {
          new HostConnection(registry, transport);
        } else {
          new ClientConnection(registry, transport, ws);
        }
      });
      return new Response(null);
    });
    void accept(request(input)).then(async (response) => {
      if (upgraded || socket.destroyed) return;
      // An Upgrade request for a non-WS route must never serve regular content.
      const status = response.status >= 400 ? response.status : 404;
      socket.end(
        `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
      await response.body?.cancel();
    }).catch((error) => {
      console.error("WebSocket upgrade failed", error);
      socket.destroy();
    });
  });
  server.on("close", () => wss.close());
  return server;
}
