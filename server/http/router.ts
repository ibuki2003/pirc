import { RPC_ERRORS, RpcError } from "@pirc/api";
import type { Config } from "../config.ts";
import type { Registry } from "../core/registry.ts";
import { gzip, json } from "./compress.ts";
import { allowedOrigin } from "./origin.ts";
import { sessionRoute } from "./sessions.ts";
import { staticFile } from "./static.ts";
import { clientEndpoint } from "../ws/client-endpoint.ts";
import { hostEndpoint } from "../ws/host-endpoint.ts";

const sessionPattern = new URLPattern({ pathname: "/api/sessions/:iid/*" });
export function router(
  registry: Registry,
  config: Config,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/api/host" || url.pathname === "/api/ws") {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      if (
        url.pathname === "/api/ws" && !allowedOrigin(req, config.allowedOrigins)
      ) return new Response("Forbidden origin", { status: 403 });
      return url.pathname === "/api/host"
        ? hostEndpoint(req, registry)
        : clientEndpoint(req, registry);
    }
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
      try {
        if (url.pathname === "/api/sessions") return json(req, registry.list());
        const match = sessionPattern.exec(url);
        if (!match) return new Response("Not found", { status: 404 });
        return await sessionRoute(req, registry, match);
      } catch (error) {
        const status = error instanceof RpcError
          ? error.code === RPC_ERRORS.SESSION_NOT_FOUND
            ? 404
            : error.code === RPC_ERRORS.HOST_TIMEOUT
            ? 504
            : 502
          : error instanceof TypeError ||
              error instanceof Error &&
                /Invalid|Missing|Not an image/.test(error.message)
          ? 400
          : 502;
        const response = new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
          { status, headers: { "Content-Type": "application/json" } },
        );
        return gzip(req, response);
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    return staticFile(req, config.staticDir);
  };
}
