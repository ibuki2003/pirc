import {
  type ClientToServer,
  type CloseReason,
  type Notice,
  RpcPeer,
  type ServerToClient,
  type SessionSummary,
  type StreamOptions,
  type SyncOp,
  type Transport,
} from "@pirc/api";
import { validStream } from "./projection.ts";
import type { Registry } from "./registry.ts";

export class ClientConnection {
  readonly streams = new Map<string, StreamOptions>();
  readonly peer: RpcPeer<ClientToServer, ServerToClient>;
  private blocked = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private registry: Registry,
    transport: Transport,
    private socket: WebSocket,
  ) {
    const forward = <
      M extends
        | "host.abort"
        | "host.setModel"
        | "host.setThinkingLevel"
        | "host.setName"
        | "host.listModels"
        | "host.listCommands"
        | "host.completePath"
        | "host.listSessions",
    >(method: M, p: { instanceId: string }) => {
      const { instanceId, ...params } = p;
      return this.registry.host(instanceId).peer.request(
        method,
        params as never,
      );
    };
    this.peer = new RpcPeer(transport, {
      requests: {
        "sessions.subscribe": () => this.registry.subscribe(this),
        "sessions.unsubscribe": () => {
          this.registry.unsubscribe(this);
          return {};
        },
        "sessions.subscribeCompletions": () => {
          this.registry.subscribeCompletions(this);
          return {};
        },
        "sessions.unsubscribeCompletions": () => {
          this.registry.unsubscribeCompletions(this);
          return {};
        },
        "session.attach": ({ instanceId, stream }) => {
          this.checkStream(stream);
          this.registry.attach(this, instanceId, stream);
          return {};
        },
        "session.detach": ({ instanceId }) => {
          this.registry.detach(this, instanceId);
          return {};
        },
        "session.setStreamOptions": ({ instanceId, stream }) => {
          this.checkStream(stream);
          this.registry.host(instanceId);
          if (!this.streams.has(instanceId)) {
            throw new Error("Session not attached");
          }
          this.streams.set(instanceId, stream);
          this.resync(instanceId, "backpressure");
          return {};
        },
        "session.prompt": async ({ instanceId, ...params }) => {
          const requestId = crypto.randomUUID();
          await this.registry.host(instanceId).peer.request("host.prompt", {
            ...params,
            requestId,
          });
          return { requestId };
        },
        "session.compact": async ({ instanceId, instructions }) => {
          const requestId = crypto.randomUUID();
          await this.registry.host(instanceId).peer.request("host.compact", {
            requestId,
            instructions,
          });
          return { requestId };
        },
        "session.abort": (p) => forward("host.abort", p),
        "session.setModel": (p) => forward("host.setModel", p),
        "session.setThinkingLevel": (p) => forward("host.setThinkingLevel", p),
        "session.setName": (p) => forward("host.setName", p),
        "session.listModels": (p) => forward("host.listModels", p),
        "session.listCommands": (p) => forward("host.listCommands", p),
        "session.completePath": (p) => forward("host.completePath", p),
        "session.listSessions": (p) => forward("host.listSessions", p),
        "session.switchSession": async ({ instanceId, path }) => {
          const requestId = crypto.randomUUID();
          await this.registry.host(instanceId).peer.request("host.switchSession", { requestId, path });
          return { requestId };
        },
        ping: () => ({}),
      },
    });
    transport.onClose(() => this.disconnect());
  }
  private checkStream(stream: StreamOptions): void {
    if (!validStream(stream)) throw new Error("Invalid stream options");
  }
  paused(id: string): boolean {
    if (this.socket.bufferedAmount > 8 * 1024 * 1024) {
      this.socket.close(1013, "Backpressure");
      return true;
    }
    if (this.socket.bufferedAmount > 1024 * 1024) {
      this.blocked.add(id);
      if (this.timer === undefined) {
        this.timer = setInterval(() => this.drain(), 100);
      }
    }
    return this.blocked.has(id);
  }
  private drain(): void {
    if (this.socket.bufferedAmount > 8 * 1024 * 1024) {
      this.socket.close(1013, "Backpressure");
      return;
    }
    if (this.socket.bufferedAmount > 1024 * 1024) return;
    for (const id of this.blocked) {
      if (this.streams.has(id)) this.resync(id, "backpressure");
    }
    this.blocked.clear();
    clearInterval(this.timer);
    this.timer = undefined;
  }
  ops(instanceId: string, ops: SyncOp[]): void {
    if (ops.length) this.peer.notify("session.ops", { instanceId, ops });
  }
  notice(instanceId: string, notice: Notice): void {
    this.peer.notify("session.notice", { instanceId, ...notice });
  }
  resync(
    instanceId: string,
    reason: "host_reconnected" | "backpressure",
  ): void {
    this.peer.notify("session.resync", { instanceId, reason });
  }
  closed(instanceId: string, reason: CloseReason, hostId: string): void {
    this.peer.notify("session.closed", { instanceId, reason, hostId });
  }
  forget(id: string): void {
    this.streams.delete(id);
    this.blocked.delete(id);
  }
  sessionsChanged(sessions: SessionSummary[]): void {
    this.peer.notify("sessions.changed", { sessions });
  }
  completed(session: ServerToClient["notifications"]["session.completed"]): void {
    this.peer.notify("session.completed", session);
  }
  private disconnect(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.registry.remove(this);
  }
}
