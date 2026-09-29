import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { controls } from "./controls.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("host.listModels", () => {
  const models = [
    { provider: "a", id: "shared", name: "A", contextWindow: 100, reasoning: true },
    { provider: "b", id: "shared", name: "B", contextWindow: 200, reasoning: false },
  ];

  function list(scopedModels: typeof models) {
    const ctx = {
      modelRegistry: { getAvailable: () => models },
      scopedModels: scopedModels.map(model => ({ model })),
    } as unknown as ExtensionContext;
    return controls({} as ExtensionAPI, ctx, () => {}, () => {})["host.listModels"]!({});
  }

  it("marks only the scoped provider and model pair", () => {
    expect(list([models[1]!])).toEqual([
      { ...models[0], scoped: false },
      { ...models[1], scoped: true },
    ]);
  });

  it("keeps all available models when no scope is configured", () => {
    expect(list([])).toEqual(models.map(model => ({ ...model, scoped: false })));
  });
});

describe("host.completePath", () => {
  it("completes files and directories relative to the pi cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pirc-complete-"));
    try {
      await mkdir(join(cwd, "src"));
      await writeFile(join(cwd, "src", "file.ts"), "");
      await mkdir(join(cwd, "src", "nested"));
      await writeFile(join(cwd, "src", "nested", "deep.ts"), "");
      await writeFile(join(cwd, "src", "nested", "ignored.ts"), "");
      await writeFile(join(cwd, ".gitignore"), "src/nested/ignored.ts\n");
      await writeFile(join(cwd, ".hidden"), "");
      const complete = controls({} as ExtensionAPI, { cwd } as ExtensionContext, () => {}, () => {})["host.completePath"]!;
      expect(await complete({ prefix: "sr" })).toContainEqual({ path: "src/", directory: true });
      expect(await complete({ prefix: "src/fi" })).toContainEqual({ path: "src/file.ts", directory: false });
      expect(await complete({ prefix: "deep" })).toContainEqual({ path: "src/nested/deep.ts", directory: false });
      expect(await complete({ prefix: "ignored" })).toEqual([]);
      expect(await complete({ prefix: "**/*.ts" })).toContainEqual({ path: "src/nested/deep.ts", directory: false });
      expect(await complete({ prefix: "src/**/*.ts" })).toContainEqual({ path: "src/nested/deep.ts", directory: false });
      expect(await complete({ prefix: "missing/fi" })).toEqual([]);
      expect(await complete({ prefix: "" })).not.toContainEqual({ path: ".hidden", directory: false });
      expect(await complete({ prefix: ".h" })).toContainEqual({ path: ".hidden", directory: false });
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
});

describe("session controls", () => {
  it("forwards switch requests without sending a user turn", () => {
    const called: unknown[][] = [];
    const notice = () => {};
    const handlers = controls({ getCommands: () => [
      { name: "pirc-session-switch", source: "extension" },
      { name: "example", source: "extension" },
    ] } as ExtensionAPI, {} as ExtensionContext, notice,
    (...args) => { called.push(args); });
    expect(handlers["host.listCommands"]!({})).toEqual([{ name: "example", source: "extension" }]);
    expect(handlers["host.switchSession"]!({ requestId: "req", path: "/saved.jsonl" })).toEqual({});
    expect(called).toEqual([["req", "/saved.jsonl", notice]]);
  });
});
