import type { Transport } from "@pirc/api";
import { HostConnection } from "../core/host-connection.ts";
import type { Registry } from "../core/registry.ts";

export function upgrade(
  req: Request,
): { response: Response; socket: WebSocket; transport: Transport } {
  const { response, socket } = Deno.upgradeWebSocket(req, { idleTimeout: 60 });
  const transport: Transport = {
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    onMessage: (handler) =>
      socket.addEventListener("message", (event) => handler(event.data)),
    onClose: (handler) => socket.addEventListener("close", handler),
  };
  return { response, socket, transport };
}
export function hostEndpoint(req: Request, registry: Registry): Response {
  const { response, transport } = upgrade(req);
  new HostConnection(registry, transport);
  return response;
}
