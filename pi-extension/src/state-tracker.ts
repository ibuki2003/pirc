import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ModelRef, OpInput, SessionState, ThinkingLevel } from "../../api/src/index.ts";

export function modelRef(model: { provider: string; id: string; name: string; contextWindow: number; reasoning: boolean }): ModelRef {
  return { provider: model.provider, id: model.id, name: model.name, contextWindow: model.contextWindow, reasoning: model.reasoning };
}
const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export class StateTracker {
  private previous: string;
  private compacting = false;
  private uiPrompt: SessionState["status"]["uiPrompt"];
  constructor(private pi: ExtensionAPI, private ctx: ExtensionContext, private identity: Pick<SessionState, "instanceId" | "hostId" | "hostname" | "piVersion">, private push: (op: OpInput) => void) {
    this.previous = JSON.stringify(this.get());
  }
  get(): SessionState {
    const model = this.ctx.model;
    const usage = this.ctx.getContextUsage();
    return {
      ...this.identity, sessionId: this.ctx.sessionManager.getSessionId(),
      sessionFile: this.ctx.sessionManager.getSessionFile(), cwd: this.ctx.cwd,
      name: this.pi.getSessionName(), model: model && modelRef(model),
      thinkingLevel: this.pi.getThinkingLevel(),
      availableThinkingLevels: model ? getSupportedThinkingLevels(model) as ThinkingLevel[] : LEVELS,
      status: { streaming: !this.ctx.isIdle(), compacting: this.compacting, pendingMessages: this.ctx.hasPendingMessages(), uiPrompt: this.uiPrompt },
      contextUsage: usage && { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent },
    };
  }
  setCompacting(value: boolean): void { this.compacting = value; this.diff(); }
  setPrompt(value?: SessionState["status"]["uiPrompt"]): void { this.uiPrompt = value; this.diff(); }
  diff(): void {
    const state = this.get();
    const json = JSON.stringify(state);
    if (json !== this.previous) { this.previous = json; this.push({ op: "set", target: "state", value: state }); }
  }
}
