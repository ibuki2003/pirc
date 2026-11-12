import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readFileChunk } from "./files.ts";

test("files resolve against the session cwd and preserve binary bytes across chunks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pirc-files-"));
  try {
    const path = join(cwd, "画像.bin");
    await writeFile(path, Buffer.from([0, 255, 128, 10]));
    const metadata = await readFileChunk(cwd, { path: "画像.bin", offset: 0, length: 0 });
    expect(metadata).toEqual({ path, size: 4, data: "" });
    const chunk = await readFileChunk("/", { path: metadata.path, offset: 1, length: 2 });
    expect(Buffer.from(chunk.data, "base64")).toEqual(Buffer.from([255, 128]));
    await expect(readFileChunk(cwd, { path: ".", offset: 0, length: 1 })).rejects.toThrow("Not a regular file");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
