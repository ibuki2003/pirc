import {
  type Notice,
  RPC_ERRORS,
  RpcError,
  type SessionSummary,
  type SessionListing,
  type StreamOptions,
  type SyncOp,
  type ToolObjectEvent,
  type ClientToServer,
} from "@pirc/api";
import { projectOps, streamKey } from "./projection.ts";
import type { HostConnection } from "./host-connection.ts";
import type { ClientConnection } from "./client-connection.ts";
import { sessionListing } from "./summary.ts";

export class Registry {
  private hosts = new Map<string, HostConnection>();
  private subscribers = new Map<ClientConnection, Map<string, string>>();
  private completionSubscribers = new Map<ClientConnection, {
    options: ClientToServer["requests"]["sessions.subscribeCompletions"]["params"];
    pending: Map<string, Set<ReturnType<typeof setTimeout>>>;
  }>();
  private viewers = new Map<string, Set<ClientConnection>>();
  private offline = new Set<string>();
  private lastActivity = new Map<string, number>();
  private changedTimer?: ReturnType<typeof setTimeout>;
  list(): SessionSummary[] {
    return [...this.hosts.values()].map((h) => h.summary);
  }
  host(id: string): HostConnection {
    const host = this.hosts.get(id);
    if (!host) {
      throw new RpcError(RPC_ERRORS.SESSION_NOT_FOUND, "Session not found");
    }
    return host;
  }
  register(host: HostConnection): void {
    const id = host.summary.instanceId;
    const previous = this.hosts.get(id);
    if (previous) {
      host.summary = {
        ...host.summary,
        connectedAt: previous.summary.connectedAt,
      };
      previous.close();
    }
    this.hosts.set(id, host);
    if (previous || this.offline.delete(id)) {
      for (const client of this.viewers.get(id) ?? []) {
        client.toolSubscriptions.delete(id);
        client.resync(id, "host_reconnected");
      }
    }
    this.viewerCount(id);
    this.changed();
  }
  unregister(
    host: HostConnection,
    reason?: import("@pirc/api").CloseReason,
  ): void {
    const id = host.summary.instanceId;
    if (this.hosts.get(id) !== host) return;
    this.hosts.delete(id);
    this.cancelCompletions(id);
    if (!reason) {
      this.offline.add(id);
      this.changed();
      return;
    }
    this.offline.delete(id);
    this.lastActivity.delete(id);
    for (const client of this.viewers.get(id) ?? []) {
      if (reason) client.closed(id, reason, host.summary.hostId);
      client.forget(id);
    }
    this.viewers.delete(id);
    this.changed();
  }
  subscribe(client: ClientConnection): SessionListing[] {
    const items = this.list().map(sessionListing);
    this.subscribers.set(client, new Map(items.map(item => [item.instanceId, JSON.stringify(item)])));
    return items;
  }
  unsubscribe(client: ClientConnection): void {
    this.subscribers.delete(client);
  }
  subscribeCompletions(client: ClientConnection, options: ClientToServer["requests"]["sessions.subscribeCompletions"]["params"]): void {
    for (const seconds of [options.activityWindowSeconds, options.delaySeconds]) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds * 1000 > 2147483647) {
        throw new Error("Completion timing must be between 0 and 2147483.647 seconds");
      }
    }
    this.unsubscribeCompletions(client);
    this.completionSubscribers.set(client, { options, pending: new Map() });
  }
  unsubscribeCompletions(client: ClientConnection): void {
    const subscription = this.completionSubscribers.get(client);
    if (subscription) {
      for (const timers of subscription.pending.values()) for (const timer of timers) clearTimeout(timer);
    }
    this.completionSubscribers.delete(client);
  }
  completed(session: Pick<SessionSummary, "instanceId" | "hostname" | "cwd" | "name">): void {
    const at = this.lastActivity.get(session.instanceId);
    for (const [client, { options, pending }] of this.completionSubscribers) {
      if (at !== undefined && Date.now() - at <= options.activityWindowSeconds * 1000 && options.activityWindowSeconds > 0) continue;
      if (options.delaySeconds === 0) {
        client.completed(session);
        continue;
      }
      let timers = pending.get(session.instanceId);
      if (!timers) pending.set(session.instanceId, timers = new Set());
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!timers.size) pending.delete(session.instanceId);
        client.completed(session);
      }, options.delaySeconds * 1000);
      timers.add(timer);
    }
  }
  private cancelCompletions(id: string): void {
    for (const { pending } of this.completionSubscribers.values()) {
      for (const timer of pending.get(id) ?? []) clearTimeout(timer);
      pending.delete(id);
    }
  }
  activity(id: string): void {
    this.host(id);
    this.lastActivity.set(id, Date.now());
    this.cancelCompletions(id);
  }
  attach(client: ClientConnection, id: string, stream: StreamOptions): void {
    this.host(id);
    let group = this.viewers.get(id);
    if (!group) this.viewers.set(id, group = new Set());
    group.add(client);
    client.streams.set(id, stream);
    client.toolSubscriptions.delete(id);
    client.runtime(id, this.host(id).runtime.snapshot());
    this.viewerCount(id);
  }
  detach(client: ClientConnection, id: string): void {
    client.streams.delete(id);
    client.toolSubscriptions.delete(id);
    const group = this.viewers.get(id);
    group?.delete(client);
    if (group?.size === 0) this.viewers.delete(id);
    this.viewerCount(id);
  }
  remove(client: ClientConnection): void {
    this.unsubscribe(client);
    this.unsubscribeCompletions(client);
    for (const id of [...client.streams.keys()]) this.detach(client, id);
  }
  viewerCount(id: string): void {
    this.hosts.get(id)?.viewers(this.viewers.get(id)?.size ?? 0);
  }
  fanout(id: string, ops: SyncOp[]): void {
    const projected = new Map<string, SyncOp[]>();
    for (const client of this.viewers.get(id) ?? []) {
      if (client.paused(id)) continue;
      const stream = client.streams.get(id);
      if (!stream) continue;
      const expanded = new Set(client.toolSubscriptions.get(id)?.keys());
      const key = streamKey(stream) + JSON.stringify([...expanded].sort());
      if (!projected.has(key)) {
        projected.set(key, projectOps(ops, stream, expanded));
      }
      client.ops(id, projected.get(key)!);
    }
  }
  toolObject(instanceId: string, toolCallId: string, event: ToolObjectEvent): void {
    for (const client of this.viewers.get(instanceId) ?? []) client.toolObject(instanceId, toolCallId, event);
  }
  notice(id: string, notice: Notice): void {
    for (const client of this.viewers.get(id) ?? []) client.notice(id, notice);
  }
  changed(): void {
    if (this.changedTimer !== undefined) return;
    this.changedTimer = setTimeout(() => {
      this.changedTimer = undefined;
      const items = this.list().map(sessionListing);
      const current = new Map(items.map(item => [item.instanceId, JSON.stringify(item)]));
      for (const [client, previous] of this.subscribers) {
        const upsert = items.filter(item => previous.get(item.instanceId) !== current.get(item.instanceId));
        const removed = [...previous.keys()].filter(id => !current.has(id));
        if (upsert.length || removed.length) client.sessionsChanged(upsert, removed);
        this.subscribers.set(client, current);
      }
    }, 500);
  }
}
