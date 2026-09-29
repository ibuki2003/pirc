import { ClientConnection } from "../core/client-connection.ts";
import type { Registry } from "../core/registry.ts";
import { upgrade } from "./host-endpoint.ts";

export function clientEndpoint(req: Request, registry: Registry): Response {
  const { response, socket, transport } = upgrade(req);
  new ClientConnection(registry, transport, socket);
  return response;
}
