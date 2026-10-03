import {
  type ClientToServer,
  type CloseReason,
  type Notice,
  RpcPeer,
  type ServerToClient,
  type SessionSummary,
  type SessionListing,
  type StreamOptions,
  type SyncOp,
  type Transport,
  type ToolObjectEvent,
  type RuntimeSnapshot,
} from "@pirc/api";
import { validStream } from "./projection.ts";
import { projectRuntime } from "./projection.ts";
import type { Registry } from "./registry.ts";

export class ClientConnection {
  readonly streams = new Map<string, StreamOptions>();
  readonly toolSubscriptions = new Map<string, Map<string, string>>();
  readonly peer: RpcPeer<ClientToServer, ServerToClient>;
  private blocked = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private registry: Registry,
    transport: Transport,
    private socket: Pick<WebSocket, "bufferedAmount" | "close">,
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
          this.toolSubscriptions.delete(instanceId);
          this.runtime(instanceId, this.registry.host(instanceId).runtime.snapshot());
          return {};
        },
        "tool.subscribe": ({ instanceId, toolCallId, subscriptionId }) => {
          if (!this.streams.has(instanceId)) throw new Error("Session not attached");
          if (!toolCallId || toolCallId.length > 256 || !subscriptionId || subscriptionId.length > 256) {
            throw new Error("Invalid tool subscription");
          }
          let subscriptions = this.toolSubscriptions.get(instanceId);
          if (!subscriptions) this.toolSubscriptions.set(instanceId, subscriptions = new Map());
          subscriptions.set(toolCallId, subscriptionId);
          const object = this.registry.host(instanceId).runtime.objects.get(toolCallId);
          this.toolObject(instanceId, toolCallId, object
            ? { type: "snapshot", revision: object.revision, value: object.value }
            : { type: "unavailable" });
          return {};
        },
        "tool.unsubscribe": ({ instanceId, toolCallId, subscriptionId }) => {
          const subscriptions = this.toolSubscriptions.get(instanceId);
          if (subscriptions?.get(toolCallId) === subscriptionId) subscriptions.delete(toolCallId);
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
      if (this.streams.has(id)) {
        this.toolSubscriptions.delete(id);
        this.resync(id, "backpressure");
      }
    }
    this.blocked.clear();
    clearInterval(this.timer);
    this.timer = undefined;
  }
  ops(instanceId: string, ops: SyncOp[]): void {
    if (ops.length) this.peer.notify("session.ops", { instanceId, ops });
  }
  runtime(instanceId: string, snapshot: RuntimeSnapshot): void {
    const stream = this.streams.get(instanceId);
    if (stream) this.peer.notify("session.runtime", { instanceId, snapshot: projectRuntime(snapshot, stream) });
  }
  toolObject(instanceId: string, toolCallId: string, event: ToolObjectEvent): void {
    const subscriptions = this.toolSubscriptions.get(instanceId);
    const subscriptionId = subscriptions?.get(toolCallId);
    if (!subscriptionId || this.paused(instanceId)) return;
    this.peer.notify("tool.object", { instanceId, toolCallId, subscriptionId, event });
    if (event.type === "end" || event.type === "unavailable") subscriptions!.delete(toolCallId);
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
    this.toolSubscriptions.delete(id);
    this.blocked.delete(id);
  }
  sessionsChanged(upsert: SessionListing[], removed: string[]): void {
    this.peer.notify("sessions.changed", { upsert, removed });
  }
  completed(session: ServerToClient["notifications"]["session.completed"]): void {
    this.peer.notify("session.completed", session);
  }
  private disconnect(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.registry.remove(this);
  }
}
