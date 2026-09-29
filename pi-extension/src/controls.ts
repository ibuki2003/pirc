import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Handlers } from "../../api/src/index.ts";
import type { ServerToHost } from "../../api/src/host-protocol.ts";
import { modelRef } from "./state-tracker.ts";

export function controls(pi: ExtensionAPI, ctx: ExtensionContext, notice: (requestId: string, message: string) => void): NonNullable<Handlers<ServerToHost>["requests"]> {
  return {
    "host.prompt": ({ requestId, text, images, deliverAs }) => {
      try {
        pi.sendUserMessage(images?.length ? [{ type: "text", text }, ...images] : text,
          { deliverAs: deliverAs ?? (!ctx.isIdle() ? "steer" : undefined), expandPromptTemplates: true });
      } catch (error) { notice(requestId, String(error)); }
      return {};
    },
    "host.abort": () => { ctx.abort(); return {}; },
    "host.setModel": async ({ provider, id }) => {
      const model = ctx.modelRegistry.find(provider, id);
      return { ok: model ? await pi.setModel(model) : false };
    },
    "host.setThinkingLevel": ({ level }) => { pi.setThinkingLevel(level); return {}; },
    "host.compact": ({ requestId, instructions }) => {
      ctx.compact({ customInstructions: instructions, onError: error => notice(requestId, error.message) });
      return {};
    },
    "host.setName": ({ name }) => { pi.setSessionName(name); return {}; },
    "host.listModels": () => {
      const scoped = new Set(ctx.scopedModels.map(({ model }) => `${model.provider}\0${model.id}`));
      return ctx.modelRegistry.getAvailable().map(model => ({
        ...modelRef(model),
        scoped: scoped.has(`${model.provider}\0${model.id}`),
      }));
    },
    "host.listCommands": () => pi.getCommands().map(({ name, description, source }) => ({ name, description, source })),
  };
}
