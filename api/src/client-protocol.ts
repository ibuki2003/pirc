import type { ServerToHost, CloseReason } from "./host-protocol.ts";
import type { Notice, SessionSummary } from "./model.ts";
import type { StreamOptions } from "./projection.ts";
import type { SyncOp } from "./sync.ts";
type HostRequests = ServerToHost["requests"];
type Forward<M extends keyof HostRequests> = {
  params: HostRequests[M]["params"] & { instanceId: string };
  result: HostRequests[M]["result"];
};
export interface ClientToServer {
  requests: {
    "sessions.subscribe": { params: Record<string, never>; result: SessionSummary[] };
    "sessions.unsubscribe": { params: Record<string, never>; result: Record<string, never> };
    "session.attach": { params: { instanceId: string; stream: StreamOptions }; result: Record<string, never> };
    "session.detach": { params: { instanceId: string }; result: Record<string, never> };
    "session.setStreamOptions": { params: { instanceId: string; stream: StreamOptions }; result: Record<string, never> };
    "session.prompt": { params: Omit<HostRequests["host.prompt"]["params"], "requestId"> & { instanceId: string }; result: { requestId: string } };
    "session.compact": { params: { instanceId: string; instructions?: string }; result: { requestId: string } };
    "session.abort": Forward<"host.abort">;
    "session.setModel": Forward<"host.setModel">;
    "session.setThinkingLevel": Forward<"host.setThinkingLevel">;
    "session.setName": Forward<"host.setName">;
    "session.listModels": Forward<"host.listModels">;
    "session.listCommands": Forward<"host.listCommands">;
    "session.completePath": Forward<"host.completePath">;
    ping: { params: Record<string, never>; result: Record<string, never> };
  };
  notifications: Record<string, never>;
}
export interface ServerToClient {
  requests: { ping: { params: Record<string, never>; result: Record<string, never> } };
  notifications: {
    "sessions.changed": { sessions: SessionSummary[] };
    "session.ops": { instanceId: string; ops: SyncOp[] };
    "session.notice": { instanceId: string } & Notice;
    "session.resync": { instanceId: string; reason: "host_reconnected" | "backpressure" };
    "session.closed": { instanceId: string; reason: CloseReason; hostId: string };
  };
}
