import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ServerToHost } from "../../api/src/host-protocol.ts";

export async function readFileChunk(cwd: string, { path, offset, length }: ServerToHost["requests"]["host.file"]["params"]): Promise<ServerToHost["requests"]["host.file"]["result"]> {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || length > 256 * 1024) {
    throw new Error("Invalid file range");
  }
  const absolute = resolve(cwd, path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path);
  const file = await open(absolute, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Not a regular file");
    const buffer = Buffer.alloc(Math.min(length, Math.max(0, stat.size - offset)));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
    return { path: absolute, size: stat.size, data: buffer.subarray(0, bytesRead).toString("base64") };
  } finally {
    await file.close();
  }
}
