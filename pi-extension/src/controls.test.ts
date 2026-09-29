import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { controls } from "./controls.ts";

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
    return controls({} as ExtensionAPI, ctx, () => {})["host.listModels"]!({});
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
