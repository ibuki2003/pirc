import { contentType } from "@std/media-types";
import type { Registry } from "../core/registry.ts";

export async function fileResponse(
  req: Request,
  host: ReturnType<Registry["host"]>,
): Promise<Response> {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) throw new Error("Missing path");
  const file = await host.peer.request("host.file", {
    path,
    offset: 0,
    length: 0,
  });
  let offset = 0;
  let end = file.size - 1;
  let partial = false;
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.size}` },
      });
    }
    if (match[1]) {
      offset = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    } else {
      offset = Math.max(0, file.size - Number(match[2]));
    }
    if (
      !Number.isSafeInteger(offset) || !Number.isSafeInteger(end) ||
      offset > end || offset >= file.size
    ) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.size}` },
      });
    }
    partial = true;
  }
  const filename = file.path.split(/[\\/]/).at(-1)!;
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const headers = new Headers({
    "Content-Type": contentType(file.path.split(".").at(-1) ?? "") ??
      "application/octet-stream",
    "Content-Disposition":
      `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "Content-Length": String(Math.max(0, end - offset + 1)),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  if (partial) {
    headers.set("Content-Range", `bytes ${offset}-${end}/${file.size}`);
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset > end) {
        controller.close();
        return;
      }
      const chunk = await host.peer.request("host.file", {
        path: file.path,
        offset,
        length: Math.min(256 * 1024, end - offset + 1),
      });
      const bytes = Uint8Array.from(atob(chunk.data), (c) => c.charCodeAt(0));
      if (!bytes.length) throw new Error("File changed during transfer");
      offset += bytes.length;
      controller.enqueue(bytes);
    },
  });
  return new Response(body, { status: partial ? 206 : 200, headers });
}
