import type { MessageStartEvent, MessageUpdateEvent, ToolExecutionStartEvent, ToolExecutionUpdateEvent, ToolExecutionEndEvent } from "@earendil-works/pi-coding-agent";
import type { LiveBlock, LiveMessage, OpInput, ToolProgress } from "../../api/src/index.ts";

export class LiveTracker {
  private live: LiveMessage | null = null;
  private tools = new Map<string, ToolProgress>();
  private lastToolUpdate = new Map<string, number>();
  constructor(private push: (op: OpInput) => void) {}
  snapshot(): { live: LiveMessage | null; tools: Record<string, ToolProgress> } {
    return { live: this.live && { ...this.live, content: this.live.content.map(b => ({ ...b })) }, tools: Object.fromEntries(this.tools) };
  }
  start(event: MessageStartEvent): void {
    if (event.message.role !== "assistant") return;
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
    } else if (update.type === "toolcall_start" || update.type === "toolcall_end") {
      const call = update.partial.content[i];
      if (call?.type !== "toolCall") return;
      const block: LiveBlock = { type: "toolCall", id: call.id, name: call.name,
        ...(update.type === "toolcall_end" ? { arguments: call.arguments } : {}) };
      this.live.content[i] = block;
      this.push({ op: "set", target: "live.content", index: i, value: { ...block } });
    }
  }
  end(): void { if (this.live) { this.live = null; this.push({ op: "set", target: "live", value: null }); } }
  toolStart(event: ToolExecutionStartEvent): void {
    const value: ToolProgress = { toolName: event.toolName, startedAt: Date.now(), output: "", totalBytes: 0, truncatedHead: false };
    this.tools.set(event.toolCallId, value);
    this.push({ op: "set", target: "tool", key: event.toolCallId, value });
  }
  toolUpdate(event: ToolExecutionUpdateEvent): void {
    const previous = this.tools.get(event.toolCallId);
    if (!previous) return;
    const output = typeof event.partialResult?.content === "string" ? event.partialResult.content :
      Array.isArray(event.partialResult?.content) ? event.partialResult.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n") : "";
    const bytes = Buffer.byteLength(output);
    const tail = Buffer.from(output).subarray(Math.max(0, bytes - 16384)).toString("utf8");
    const value = { ...previous, output: tail, totalBytes: bytes, truncatedHead: bytes > 16384 };
    this.tools.set(event.toolCallId, value);
    const now = Date.now();
    if (now - (this.lastToolUpdate.get(event.toolCallId) ?? 0) >= 250) {
      this.lastToolUpdate.set(event.toolCallId, now);
      this.push({ op: "set", target: "tool", key: event.toolCallId, value });
    }
  }
  toolEnd(event: ToolExecutionEndEvent): void {
    this.tools.delete(event.toolCallId);
    this.lastToolUpdate.delete(event.toolCallId);
    this.push({ op: "set", target: "tool", key: event.toolCallId, value: null });
  }
}
