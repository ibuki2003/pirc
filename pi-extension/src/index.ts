import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Bridge } from "./bridge.ts";
import { config } from "./config.ts";
import { host } from "./host-id.ts";
import { savedSessions } from "./controls.ts";

export default function (pi: ExtensionAPI): void {
  let bridge: Bridge | undefined;
  let paused = false;
  const pendingSwitches = new Map<string, { path?: string; notice: (id: string, message: string) => void }>();
  const switchSession: ConstructorParameters<typeof Bridge>[3] = (requestId, path, notice) => {
    pendingSwitches.set(requestId, { path, notice });
    // Let the RPC response leave the old session before the switch closes its connection.
    setTimeout(() => {
      try { pi.sendUserMessage(`/pirc-session-switch ${requestId}`, { expandPromptTemplates: true }); }
      catch (error) {
        pendingSwitches.delete(requestId);
        notice(requestId, String(error));
      }
    }, 0);
  };
  pi.registerCommand("pirc-session-switch", {
    description: "pirc internal session switch",
    handler: async (requestId, ctx) => {
      const pending = pendingSwitches.get(requestId);
      if (!pending) return;
      pendingSwitches.delete(requestId);
      try {
        if (!ctx.isIdle()) throw new Error("生成中はセッションを切り替えられません");
        if (pending.path) {
          if (!(await savedSessions(ctx)).some(info => info.path === pending.path)) throw new Error("セッションが見つかりません");
          const result = await ctx.switchSession(pending.path);
          if (result.cancelled) throw new Error("セッションの切替が取り消されました");
        } else {
          const result = await ctx.newSession();
          if (result.cancelled) throw new Error("新しいセッションの作成が取り消されました");
        }
      } catch (error) { pending.notice(requestId, String(error)); }
    },
  });
  pi.on("session_start", (event, ctx) => {
    const { url, disabled } = config();
    if (!url || disabled || paused) return;
    const file = ctx.sessionManager.getSessionFile();
    const previous = event.reason === "reload" && file ? host().sessions.get(file) : undefined;
    if (file) host().sessions.delete(file);
    bridge = new Bridge(pi, ctx, url, switchSession, previous);
  });
  pi.on("session_shutdown", event => { bridge?.stop(event); bridge = undefined; });
  pi.on("message_start", event => bridge?.messageStart(event));
  pi.on("message_update", event => bridge?.messageUpdate(event));
  pi.on("message_end", event => bridge?.messageEnd(event.message.role));
  pi.on("tool_execution_start", event => bridge?.toolStart(event));
  pi.on("tool_execution_update", event => bridge?.toolUpdate(event));
  pi.on("tool_execution_end", event => bridge?.toolEnd(event));
  pi.on("agent_start", () => { bridge?.reconcile(); });
  pi.on("agent_end", () => { bridge?.reconcile(); });
  pi.on("turn_end", () => { bridge?.reconcile(); });
  pi.on("session_tree", () => { bridge?.reconcile(); });
  pi.on("model_select", () => { bridge?.reconcile(); });
  pi.on("thinking_level_select", () => { bridge?.reconcile(); });
  pi.on("session_info_changed", () => { bridge?.reconcile(); });
  pi.on("session_before_compact", () => { bridge?.state.setCompacting(true); });
  pi.on("session_compact", () => { bridge?.state.setCompacting(false); bridge?.reconcile(); });
  pi.on("session_compact_failed", event => {
    bridge?.state.setCompacting(false);
    bridge?.compactFailed(event.errorMessage ?? "Compaction failed");
  });
  pi.on("ui_prompt_start", event => bridge?.state.setPrompt({ kind: event.kind, title: event.title }));
  pi.on("ui_prompt_end", () => bridge?.state.setPrompt());
  pi.registerCommand("pirc", {
    description: "Show or toggle pirc connection",
    getArgumentCompletions: prefix => {
      const matches = ["pause", "resume"].filter(command => command.startsWith(prefix));
      return matches.length > 0 ? matches.map(command => ({ value: command, label: command })) : null;
    },
    handler: async (args, ctx) => {
      if (args.trim() === "pause") { paused = true; bridge?.stop({ type: "session_shutdown", reason: "quit" }); bridge = undefined; }
      else if (args.trim() === "resume") {
        paused = false;
        const { url, disabled } = config();
        if (url && !disabled && !bridge) bridge = new Bridge(pi, ctx, url, switchSession);
      }
      ctx.ui.notify(bridge?.describe() ?? (paused ? "pirc: paused" : "pirc: disabled"), "info");
    },
  });
}
