import type { ImageContent, SessionEntry, ThinkingLevel } from "./pi.ts";
import type { ModelRef, Notice, SessionState } from "./model.ts";
import type { ProjectedEntry } from "./projection.ts";
import type { SessionSnapshot, SyncOp } from "./sync.ts";
export type CloseReason = "quit" | "reload" | "new" | "resume" | "fork";
export interface TreeNode {
  id: string; parentId: string | null; type: string; role?: string; label?: string; timestamp: string; preview: string;
}
export interface HostToServer {
  requests: {
    "host.hello": { params: { protocolVersion: number; state: SessionState; entryCount: number }; result: Record<string, never> };
    ping: { params: Record<string, never>; result: Record<string, never> };
  };
  notifications: {
    "host.close": { reason: CloseReason; targetSessionFile?: string };
    "session.ops": { ops: SyncOp[] };
    "session.notice": Notice;
  };
}
export interface ServerToHost {
  requests: {
    "host.sync": { params: { since?: number; branchLimit: number }; result: SessionSnapshot };
    "host.branch": { params: { leafId: string; limit: number }; result: { entries: ProjectedEntry[]; hasMoreBefore: boolean } };
    "host.entry": { params: { entryId: string }; result: { index: number; entry: SessionEntry } };
    "host.tree": { params: Record<string, never>; result: TreeNode[] };
    "host.prompt": { params: { requestId: string; text: string; images?: ImageContent[]; deliverAs?: "steer" | "followUp" }; result: Record<string, never> };
    "host.abort": { params: Record<string, never>; result: Record<string, never> };
    "host.setModel": { params: { provider: string; id: string }; result: { ok: boolean } };
    "host.setThinkingLevel": { params: { level: ThinkingLevel }; result: Record<string, never> };
    "host.compact": { params: { requestId: string; instructions?: string }; result: Record<string, never> };
    "host.setName": { params: { name: string }; result: Record<string, never> };
    "host.listModels": { params: Record<string, never>; result: (ModelRef & { scoped: boolean })[] };
    "host.listCommands": { params: Record<string, never>; result: { name: string; description?: string; source: string }[] };
    "host.completePath": { params: { prefix: string }; result: { path: string; directory: boolean }[] };
    ping: { params: Record<string, never>; result: Record<string, never> };
  };
  notifications: { "host.viewers": { count: number } };
}
