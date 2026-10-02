import {
  objectChanges,
  type LiveBlock,
  type RuntimeSnapshot,
  type SyncOp,
  type ToolObject,
  type ToolObjectEvent,
} from "@pirc/api";

type Call = Extract<LiveBlock, { type: "toolCall" }>;

// Rebuildable, session-scoped state. Only unresolved tool objects retain their full payload.
export class Runtime {
  private current: RuntimeSnapshot;
  readonly objects = new Map<string, { revision: number; value: ToolObject }>();
  constructor(snapshot: RuntimeSnapshot) {
    this.current = structuredClone(snapshot);
    if (!snapshot.state.status.streaming && !snapshot.live && !Object.keys(snapshot.tools).length) this.current.calls = {};
    for (const call of Object.values(this.current.calls)) {
      const progress = snapshot.tools[call.id];
      this.objects.set(call.id, { revision: 0, value: {
        id: call.id, name: call.name, arguments: structuredClone(call.arguments), content: [],
        ...(progress ? { content: [{ type: "text", text: progress.output }],
          progress: this.progress(progress) } : {}),
      } });
    }
  }
  snapshot(): RuntimeSnapshot { return structuredClone(this.current); }
  get sequence(): number { return this.current.seq; }
  private progress(value: RuntimeSnapshot["tools"][string]): ToolObject["progress"] {
    const { output: _, ...metadata } = value;
    return { ...metadata, truncatedHead: false };
  }
  private update(id: string, value: ToolObject, emit: (id: string, event: ToolObjectEvent) => void): void {
    const previous = this.objects.get(id);
    const changes = previous && objectChanges(previous.value, value);
    if (changes?.length === 0) return;
    const revision = (previous?.revision ?? 0) + 1;
    this.objects.set(id, { revision, value });
    emit(id, previous
      ? { type: "patch", from: previous.revision, revision, changes: changes! }
      : { type: "snapshot", revision, value });
  }
  private call(call: Call, emit: (id: string, event: ToolObjectEvent) => void, entryId?: string): void {
    this.current.calls[call.id] = structuredClone(call);
    const previous = this.objects.get(call.id)?.value;
    this.update(call.id, {
      ...previous, id: call.id, name: call.name, arguments: structuredClone(call.arguments),
      content: previous?.content ?? [], ...(entryId ? { callEntryId: entryId } : {}),
    }, emit);
  }
  apply(ops: SyncOp[], emit: (id: string, event: ToolObjectEvent) => void): void {
    for (const op of ops) {
      if (op.seq <= this.current.seq) continue;
      if (op.seq !== this.current.seq + 1) throw new Error("Host sequence gap");
      if (op.op === "set") {
        if (op.target === "state") this.current.state = op.value;
        else if (op.target === "live") this.current.live = structuredClone(op.value);
        else if (op.target === "live.content") {
          if (!this.current.live) throw new Error("Missing live message");
          this.current.live.content[op.index] = structuredClone(op.value);
          if (op.value.type === "toolCall") this.call(op.value, emit);
        } else if (op.target === "call") this.call(op.value, emit);
        else if (op.target === "toolDuration") this.current.toolDurations[op.key] = op.value;
        else if (op.target === "tool") {
          const previous = this.objects.get(op.key)?.value;
          if (op.value) {
            this.current.tools[op.key] = structuredClone(op.value);
            this.update(op.key, {
              ...previous, id: op.key, name: op.value.toolName,
              content: [{ type: "text", text: op.value.output }], progress: this.progress(op.value),
            }, emit);
          } else {
            delete this.current.tools[op.key];
            // Execution-end is not EOF. Keep content until the persisted result arrives.
          }
        }
      } else if (op.op === "append" && op.target === "live.content") {
        const block = this.current.live?.content[op.index];
        if (block?.type === "text") block.text += op.text;
        else if (block?.type === "thinking") block.thinking += op.text;
        else throw new Error("Missing live text");
      } else if (op.op === "append" && op.target === "entries") {
        for (const item of op.items) {
          const entry = item.entry;
          if (entry.type !== "message") continue;
          if (entry.message.role === "assistant") {
            for (const block of entry.message.content) {
              if (block.type === "toolCall") this.call(block, emit, entry.id);
            }
          } else if (entry.message.role === "toolResult") {
            const id = entry.message.toolCallId;
            const previous = this.objects.get(id)?.value;
            const { content, ...message } = entry.message;
            this.update(id, {
              id, name: entry.message.toolName, arguments: previous?.arguments,
              callEntryId: previous?.callEntryId, content: structuredClone(content),
              result: { index: item.index, id: entry.id, parentId: entry.parentId,
                timestamp: entry.timestamp, message },
            }, emit);
            emit(id, { type: "end", revision: this.objects.get(id)!.revision, entryId: entry.id });
            this.objects.delete(id);
            delete this.current.calls[id];
          }
        }
      }
      this.current.seq = op.seq;
    }
    if (!this.current.state.status.streaming && !this.current.live && !Object.keys(this.current.tools).length) {
      // Aborted, unexecuted calls have no stable tool result: release them without claiming EOF.
      for (const id of this.objects.keys()) emit(id, { type: "unavailable" });
      this.objects.clear();
      this.current.calls = {};
    }
  }
}
