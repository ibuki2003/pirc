import type { MessageStartEvent, MessageUpdateEvent, ToolExecutionStartEvent, ToolExecutionUpdateEvent, ToolExecutionEndEvent } from "@earendil-works/pi-coding-agent";
import type { LiveBlock, LiveMessage, OpInput, ToolProgress } from "../../api/src/index.ts";

export class LiveTracker {
  private live: LiveMessage | null = null;
  private tools = new Map<string, ToolProgress>();
  private calls = new Map<string, Extract<LiveBlock, { type: "toolCall" }>>();
  private lastToolUpdate = new Map<string, number>();
  private pendingCalls = new Map<number, Extract<LiveBlock, { type: "toolCall" }>>();
  private callTimer?: ReturnType<typeof setTimeout>;
  constructor(private push: (op: OpInput) => void, private durations = new Map<string, number>()) {}
  snapshot(): Pick<import("../../api/src/index.ts").RuntimeSnapshot, "live" | "tools" | "toolDurations" | "calls"> {
    return { live: this.live && { ...this.live, content: this.live.content.map(b => ({ ...b })) },
      tools: Object.fromEntries(this.tools), toolDurations: Object.fromEntries(this.durations),
      calls: Object.fromEntries(this.calls) };
  }
  start(event: MessageStartEvent): void {
    if (event.message.role !== "assistant") return;
    this.clearCalls();
    this.live = { provider: event.message.provider, model: event.message.model, startedAt: event.message.timestamp, content: [] };
    this.push({ op: "set", target: "live", value: { ...this.live, content: [] } });
  }
  update(event: MessageUpdateEvent): void {
    if (!this.live) return;
    const update = event.assistantMessageEvent;
    const i = "contentIndex" in update ? update.contentIndex : -1;
    if (update.type === "text_start" || update.type === "thinking_start") {
      const block: LiveBlock = update.type === "text_start" ? { type: "text", text: "" } : { type: "thinking", thinking: "" };
      this.live.content[i] = block;
      this.push({ op: "set", target: "live.content", index: i, value: { ...block } });
    } else if (update.type === "text_delta" || update.type === "thinking_delta") {
      const block = this.live.content[i];
      if (block?.type === "text") block.text += update.delta;
      else if (block?.type === "thinking") block.thinking += update.delta;
      this.push({ op: "append", target: "live.content", index: i, text: update.delta });
    } else if (update.type === "toolcall_start" || update.type === "toolcall_delta" || update.type === "toolcall_end") {
      const call = update.type === "toolcall_end" ? update.toolCall : update.partial.content[i];
      if (call?.type !== "toolCall") return;
      const block: LiveBlock = { type: "toolCall", id: call.id, name: call.name,
        ...(update.type !== "toolcall_start" ? { arguments: call.arguments } : {}) };
      if (update.type === "toolcall_delta") {
        this.pendingCalls.set(i, block);
        this.callTimer ??= setTimeout(() => this.flushCalls(), 250);
      } else {
        this.pendingCalls.delete(i);
        this.live.content[i] = block;
        this.calls.set(block.id, block);
        this.push({ op: "set", target: "live.content", index: i, value: { ...block } });
      }
    }
  }
  private flushCalls(): void {
    this.callTimer = undefined;
    for (const [index, block] of this.pendingCalls) {
      if (!this.live) break;
      this.live.content[index] = block;
      this.calls.set(block.id, block);
      this.push({ op: "set", target: "live.content", index, value: block });
    }
    this.pendingCalls.clear();
  }
  private clearCalls(): void {
    clearTimeout(this.callTimer);
    this.callTimer = undefined;
    this.pendingCalls.clear();
  }
  end(): void { if (this.live) { this.clearCalls(); this.live = null; this.push({ op: "set", target: "live", value: null }); } }
  stop(): void { this.clearCalls(); }
  toolStart(event: ToolExecutionStartEvent): void {
    const call: Extract<LiveBlock, { type: "toolCall" }> = {
      type: "toolCall", id: event.toolCallId, name: event.toolName, arguments: event.args,
    };
    this.calls.set(call.id, call);
    this.push({ op: "set", target: "call", key: call.id, value: call });
    const value: ToolProgress = { toolName: event.toolName, startedAt: Date.now(), output: "", totalBytes: 0, truncatedHead: false,
      ...(event.toolName === "bash" ? { command: String(event.args?.command ?? "") } : {}) };
    this.tools.set(event.toolCallId, value);
    this.push({ op: "set", target: "tool", key: event.toolCallId, value });
  }
  toolUpdate(event: ToolExecutionUpdateEvent): void {
    const previous = this.tools.get(event.toolCallId);
    if (!previous) return;
    const output = typeof event.partialResult?.content === "string" ? event.partialResult.content :
      Array.isArray(event.partialResult?.content) ? event.partialResult.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n") : "";
    const bytes = Buffer.byteLength(output);
    const value = { ...previous, output, totalBytes: bytes, truncatedHead: false };
    this.tools.set(event.toolCallId, value);
    const now = Date.now();
    if (now - (this.lastToolUpdate.get(event.toolCallId) ?? 0) >= 250) {
      this.lastToolUpdate.set(event.toolCallId, now);
      this.push({ op: "set", target: "tool", key: event.toolCallId, value });
    }
  }
  toolEnd(event: ToolExecutionEndEvent): void {
    const tool = this.tools.get(event.toolCallId);
    if (tool?.toolName === "bash") {
      const duration = Math.max(0, Date.now() - tool.startedAt);
      this.durations.set(event.toolCallId, duration);
      this.push({ op: "set", target: "toolDuration", key: event.toolCallId, value: duration });
    }
    this.tools.delete(event.toolCallId);
    this.lastToolUpdate.delete(event.toolCallId);
    this.push({ op: "set", target: "tool", key: event.toolCallId, value: null });
  }
  committed(id: string): void { this.calls.delete(id); }
  pruneIdle(): void { if (!this.live && !this.tools.size) this.calls.clear(); }
}
