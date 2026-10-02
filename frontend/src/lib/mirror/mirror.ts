import type { ProjectedEntry, SessionSnapshot, RuntimeSnapshot, SessionState, LiveMessage, LiveBlock, ToolProgress, SyncOp } from "@pirc/api";

export interface SessionMirror {
  entries: Map<number, ProjectedEntry>;
  entryIds: Map<string, number>;
  entryCount: number;
  leafId: string | null;
  seq: number;
  hasMoreBefore: boolean;
}
export class SyncMismatch extends Error {}
export function mergeEntries(mirror: SessionMirror, entries: ProjectedEntry[]): void {
  for (const item of entries) {
    mirror.entries.set(item.index, item);
    mirror.entryIds.set(item.entry.id, item.index);
  }
}
export function applySnapshot(previous: SessionMirror | null, snapshot: SessionSnapshot): SessionMirror {
  const mirror: SessionMirror = {
    entries: snapshot.mode === "delta" && previous ? new Map(previous.entries) : new Map(),
    entryIds: snapshot.mode === "delta" && previous ? new Map(previous.entryIds) : new Map(),
    entryCount: snapshot.entryCount,
    leafId: snapshot.leafId,
    seq: snapshot.seq,
    hasMoreBefore: snapshot.mode === "delta" && previous ? previous.hasMoreBefore : snapshot.hasMoreBefore,
  };
  mergeEntries(mirror, snapshot.entries);
  return mirror;
}
export function applyOps(mirror: SessionMirror, ops: SyncOp[]): SessionMirror {
  // Work on a copy: an invalid batch must never leave a half-applied mirror.
  const next: SessionMirror = {
    ...mirror, entries: new Map(mirror.entries), entryIds: new Map(mirror.entryIds),
  };
  for (const op of ops) {
    if (op.seq <= next.seq) continue;
    if (op.op === "reset") throw new SyncMismatch("History reset");
    if (op.seq !== next.seq + 1) throw new SyncMismatch(`History sequence gap: expected ${next.seq + 1}, got ${op.seq}`);
    if (op.op === "append" && op.target === "entries") {
      if (op.from !== next.entryCount) throw new SyncMismatch("Entry cursor mismatch");
      mergeEntries(next, op.items);
      next.entryCount += op.items.length;
      if (op.items.length) next.leafId = op.items.at(-1)!.entry.id;
    } else if (op.op === "set" && op.target === "leaf") next.leafId = op.value;
    next.seq = op.seq;
  }
  return next;
}

export interface RuntimeMirror {
  seq: number;
  state: SessionState;
  live: LiveMessage | null;
  tools: Map<string, ToolProgress>;
  toolDurations: Map<string, number>;
  calls: Map<string, Extract<LiveBlock, { type: "toolCall" }>>;
}
export function runtimeSnapshot(snapshot: RuntimeSnapshot): RuntimeMirror {
  return { ...snapshot, tools: new Map(Object.entries(snapshot.tools)),
    toolDurations: new Map(Object.entries(snapshot.toolDurations)), calls: new Map(Object.entries(snapshot.calls)) };
}
export function applyRuntimeOps(runtime: RuntimeMirror, ops: SyncOp[]): RuntimeMirror {
  const next = { ...runtime, tools: new Map(runtime.tools), toolDurations: new Map(runtime.toolDurations),
    calls: new Map(runtime.calls), live: runtime.live && { ...runtime.live, content: [...runtime.live.content] } };
  for (const op of ops) {
    if (op.seq <= next.seq) continue;
    if (op.op === "reset") throw new SyncMismatch("Runtime reset");
    if (op.seq !== next.seq + 1) throw new SyncMismatch(`Runtime sequence gap: expected ${next.seq + 1}, got ${op.seq}`);
    if (op.op === "set" && op.target === "state") next.state = op.value;
    else if (op.op === "set" && op.target === "live") next.live = op.value;
    else if (op.op === "set" && op.target === "call") next.calls.set(op.key, op.value);
    else if (op.op === "set" && op.target === "live.content") {
      if (!next.live || op.index > next.live.content.length) throw new SyncMismatch("Missing live block");
      next.live.content[op.index] = op.value;
      if (op.value.type === "toolCall") next.calls.set(op.value.id, op.value);
    } else if (op.op === "append" && op.target === "live.content") {
      const block = next.live?.content[op.index];
      if (!block || block.type === "toolCall") throw new SyncMismatch("Missing text block");
      next.live!.content[op.index] = block.type === "text"
        ? { ...block, text: block.text + op.text } : { ...block, thinking: block.thinking + op.text };
    } else if (op.op === "set" && op.target === "tool") {
      if (op.value) next.tools.set(op.key, op.value);
      else next.tools.delete(op.key);
    } else if (op.op === "set" && op.target === "toolDuration") next.toolDurations.set(op.key, op.value);
    else if (op.op === "append" && op.target === "entries") {
      for (const { entry } of op.items) {
        if (entry.type === "redacted" && entry.role === "toolResult" && entry.toolCallId) next.calls.delete(entry.toolCallId);
        else if (entry.type === "message" && entry.message.role === "toolResult") next.calls.delete(entry.message.toolCallId);
        else if (entry.type === "message" && entry.message.role === "assistant") {
          for (const block of entry.message.content) if (block.type === "toolCall") next.calls.set(block.id, block);
        }
      }
    }
    next.seq = op.seq;
  }
  if (!next.state.status.streaming && !next.live && !next.tools.size) next.calls.clear();
  return next;
}
export function computeBranch(mirror: SessionMirror): ProjectedEntry[] {
  const branch: ProjectedEntry[] = [];
  const visited = new Set<string>();
  let id = mirror.leafId;
  while (id && !visited.has(id)) {
    visited.add(id);
    const index = mirror.entryIds.get(id);
    const item = index === undefined ? undefined : mirror.entries.get(index);
    if (!item) break;
    branch.push(item);
    id = item.entry.parentId;
  }
  return branch.reverse();
}
export function missingAncestor(mirror: SessionMirror): string | null {
  const first = computeBranch(mirror)[0];
  return first ? first.entry.parentId : mirror.leafId;
}
