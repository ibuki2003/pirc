import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { Handlers } from "../../api/src/index.ts";
import type { ServerToHost } from "../../api/src/host-protocol.ts";
import { modelRef } from "./state-tracker.ts";

const execFileAsync = promisify(execFile);

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
    "host.completePath": async ({ prefix }) => {
      if (prefix.length > 1024 || /\s/.test(prefix)) return [];
      const globAt = prefix.search(/[*?[\]]/);
      const glob = globAt !== -1;
      const slash = glob ? prefix.lastIndexOf("/", globAt) : prefix.lastIndexOf("/");
      const base = prefix.slice(0, slash + 1);
      const part = prefix.slice(slash + 1);
      const directory = resolve(ctx.cwd, base === "~/" || base.startsWith("~/") ? homedir() + base.slice(1) : base);
      try {
        if (!(await stat(directory)).isDirectory()) return [];
        const { stdout } = await execFileAsync("fd", [
          glob ? "--glob" : "--fixed-strings", "--ignore-case", "--no-require-git",
          ...(part.startsWith(".") || base.includes("/.") ? ["--hidden"] : []),
          "--exclude", ".git",
          "--type", "f", "--type", "d", "--max-results", "200",
          "--base-directory", directory, part,
        ], { cwd: ctx.cwd, timeout: 2000, maxBuffer: 1024 * 1024 });
        return stdout.trimEnd().split("\n").filter(Boolean)
          .map(path => ({ path: base + path, directory: path.endsWith("/") }))
          .sort((a, b) => {
            const aName = a.path.slice(base.length).replace(/\/$/, "").split("/").at(-1)!.toLowerCase();
            const bName = b.path.slice(base.length).replace(/\/$/, "").split("/").at(-1)!.toLowerCase();
            return Number(bName.startsWith(part.toLowerCase())) - Number(aName.startsWith(part.toLowerCase()))
              || Number(b.directory) - Number(a.directory)
              || a.path.length - b.path.length || a.path.localeCompare(b.path);
          })
          .slice(0, 20);
      } catch (error) {
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
        throw error;
      }
    },
  };
}
