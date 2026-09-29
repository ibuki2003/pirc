import {
  type Notice,
  RPC_ERRORS,
  RpcError,
  type SessionSummary,
  type StreamOptions,
  type SyncOp,
} from "@pirc/api";
import { projectOps, streamKey } from "./projection.ts";
import type { HostConnection } from "./host-connection.ts";
import type { ClientConnection } from "./client-connection.ts";

export class Registry {
  private hosts = new Map<string, HostConnection>();
  private subscribers = new Set<ClientConnection>();
  private viewers = new Map<string, Set<ClientConnection>>();
  private offline = new Set<string>();
  private liveTypes = new Map<string, string[]>();
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
    if (!reason) {
      this.offline.add(id);
      this.changed();
      return;
    }
    this.offline.delete(id);
    this.liveTypes.delete(id);
    for (const client of this.viewers.get(id) ?? []) {
      if (reason) client.closed(id, reason, host.summary.hostId);
      client.forget(id);
    }
    this.viewers.delete(id);
    this.changed();
  }
  subscribe(client: ClientConnection): SessionSummary[] {
    this.subscribers.add(client);
    return this.list();
  }
  unsubscribe(client: ClientConnection): void {
    this.subscribers.delete(client);
  }
  attach(client: ClientConnection, id: string, stream: StreamOptions): void {
    this.host(id);
    let group = this.viewers.get(id);
    if (!group) this.viewers.set(id, group = new Set());
    group.add(client);
    client.streams.set(id, stream);
    this.viewerCount(id);
  }
  detach(client: ClientConnection, id: string): void {
    client.streams.delete(id);
    const group = this.viewers.get(id);
    group?.delete(client);
    if (group?.size === 0) this.viewers.delete(id);
    this.viewerCount(id);
  }
  remove(client: ClientConnection): void {
    this.unsubscribe(client);
    for (const id of [...client.streams.keys()]) this.detach(client, id);
  }
  viewerCount(id: string): void {
    this.hosts.get(id)?.viewers(this.viewers.get(id)?.size ?? 0);
  }
  fanout(id: string, ops: SyncOp[]): void {
    const projected = new Map<string, SyncOp[]>();
    const types = this.liveTypes.get(id) ?? [];
    for (const client of this.viewers.get(id) ?? []) {
      if (client.paused(id)) continue;
      const stream = client.streams.get(id);
      if (!stream) continue;
      const key = streamKey(stream);
      if (!projected.has(key)) {
        projected.set(key, projectOps(ops, stream, [...types]));
      }
      client.ops(id, projected.get(key)!);
    }
    for (const op of ops) {
      if (op.op === "set" && op.target === "live") {
        types.length = 0;
        types.push(...op.value?.content.map((b) => b.type) ?? []);
      }
      if (op.op === "set" && op.target === "live.content") {
        types[op.index] = op.value.type;
      }
    }
    this.liveTypes.set(id, types);
  }
  notice(id: string, notice: Notice): void {
    for (const client of this.viewers.get(id) ?? []) client.notice(id, notice);
  }
  changed(): void {
    if (this.changedTimer !== undefined) return;
    this.changedTimer = setTimeout(() => {
      this.changedTimer = undefined;
      const sessions = this.list();
      for (const client of this.subscribers) client.sessionsChanged(sessions);
    }, 500);
  }
}
