import type { LiveBlock, LiveMessage, SessionState, ToolProgress } from "./model.ts";
import type { ProjectedEntry } from "./projection.ts";
export type SyncOp = { seq: number } & (
  | { op: "append"; target: "entries"; from: number; items: ProjectedEntry[] }
  | { op: "set"; target: "leaf"; value: string | null }
  | { op: "set"; target: "state"; value: SessionState }
  | { op: "set"; target: "live"; value: LiveMessage | null }
  | { op: "set"; target: "live.content"; index: number; value: LiveBlock }
  | { op: "append"; target: "live.content"; index: number; text: string }
  | { op: "set"; target: "tool"; key: string; value: ToolProgress | null }
  | { op: "reset" }
);
export type OpInput = SyncOp extends infer T ? T extends { seq: number } ? Omit<T, "seq"> : never : never;
export interface SessionSnapshot {
  seq: number;
  entryCount: number;
  lastEntryId: string | null;
  leafId: string | null;
  entries: ProjectedEntry[];
  hasMoreBefore: boolean;
  mode: "delta" | "full";
  state: SessionState;
  live: LiveMessage | null;
  tools: Record<string, ToolProgress>;
}
