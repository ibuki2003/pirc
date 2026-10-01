import {
  FULL_STREAM,
  MOBILE_STREAM,
  RPC_ERRORS,
  RpcError,
  type StreamOptions,
} from "@pirc/api";
import {
  projectEntry,
  projectSnapshot,
  validStream,
} from "../core/projection.ts";
import type { Registry } from "../core/registry.ts";
import { json } from "./compress.ts";

function integer(value: string | null, fallback?: number): number {
  if (value === null && fallback !== undefined) return fallback;
  const n = Number(value);
  if (value === null || !/^\d+$/.test(value) || !Number.isSafeInteger(n)) {
    throw new Error("Invalid integer");
  }
  return n;
}
function stream(query: URLSearchParams): StreamOptions {
  const profile = query.get("profile");
  if (profile && profile !== "mobile" && profile !== "full") {
    throw new Error("Invalid profile");
  }
  const base = profile === "full" ? FULL_STREAM : MOBILE_STREAM;
  const options = {
    toolOutputBytes: integer(
      query.get("toolOutputBytes"),
      base.toolOutputBytes,
    ),
    ...(query.has("expandedToolCalls") ? { expandedToolCalls: JSON.parse(query.get("expandedToolCalls")!) } : {}),
  };
  if (!validStream(options)) throw new Error("Invalid stream");
  return options;
}
function getPath(value: string): (string | number)[] {
  if (!value.startsWith("/")) throw new Error("Invalid pointer");
  return value.slice(1).split("/").map((part) =>
    part.replace(/~1/g, "/").replace(/~0/g, "~")
  ).map((part) => /^\d+$/.test(part) ? Number(part) : part);
}
export async function sessionRoute(
  req: Request,
  registry: Registry,
  match: URLPatternResult,
): Promise<Response> {
  const url = new URL(req.url);
  const id = decodeURIComponent(match.pathname.groups.iid!);
  const host = registry.host(id);
  const path = url.pathname;
  const entryMatch = new URLPattern({
    pathname: "/api/sessions/:iid/entries/:eid",
  }).exec(url);
  const blobMatch = new URLPattern({
    pathname: "/api/sessions/:iid/entries/:eid/blob",
  }).exec(url);
  if (entryMatch || blobMatch) {
    const entryId = decodeURIComponent(
      (blobMatch ?? entryMatch)!.pathname.groups.eid!,
    );
    const entry = await host.peer.request("host.entry", { entryId });
    if (!blobMatch) return json(req, entry);
    const pointer = url.searchParams.get("path");
    if (!pointer) throw new Error("Missing path");
    const keys = getPath(pointer);
    let node: unknown = entry.entry;
    for (const key of keys) {
      if (
        key === "__proto__" || key === "constructor" || key === "prototype" ||
        !node || typeof node !== "object"
      ) throw new Error("Invalid path");
      node = (node as Record<string, unknown>)[key];
    }
    const parent = keys.slice(0, -1).reduce<unknown>(
      (obj, key) =>
        obj && typeof obj === "object"
          ? (obj as Record<string, unknown>)[key]
          : undefined,
      entry.entry,
    );
    if (
      keys.at(-1) !== "data" || !parent || typeof parent !== "object" ||
      (parent as { type?: string }).type !== "image" || typeof node !== "string"
    ) throw new Error("Not an image");
    const image = parent as { mimeType: string };
    if (!/^image\/[a-z0-9.+-]+$/i.test(image.mimeType)) {
      throw new Error("Invalid image MIME");
    }
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(node), (c) => c.charCodeAt(0));
    } catch {
      throw new Error("Invalid image data");
    }
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }
  const options = stream(url.searchParams);
  if (path.endsWith("/sync")) {
    const since = url.searchParams.has("since")
      ? integer(url.searchParams.get("since"))
      : undefined;
    const branchLimit = integer(url.searchParams.get("branchLimit"), 100);
    const snapshot = await host.peer.request("host.sync", {
      since,
      branchLimit,
    });
    return json(req, projectSnapshot(snapshot, options));
  }
  if (path.endsWith("/branch")) {
    const leafId = url.searchParams.get("leaf");
    if (!leafId) throw new Error("Missing leaf");
    const result = await host.peer.request("host.branch", {
      leafId,
      limit: integer(url.searchParams.get("limit"), 100),
    });
    return json(req, {
      ...result,
      entries: result.entries.map((item) => projectEntry(item, options)),
    });
  }
  throw new RpcError(RPC_ERRORS.METHOD_NOT_FOUND, "Endpoint not found");
}
