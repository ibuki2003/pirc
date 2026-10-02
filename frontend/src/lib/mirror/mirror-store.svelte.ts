import { MOBILE_STREAM, applyObjectChanges, type ProjectedEntry, type ToolObject, type ToolObjectEvent,
  type RuntimeSnapshot, type StreamOptions, type SyncOp, type Notice, type SessionSnapshot } from "@pirc/api";
import { SvelteSet } from "svelte/reactivity";
import { connection } from "../connection.svelte.ts";
import { http } from "../http.ts";
import { watchVisibility } from "../visibility.ts";
import { applyOps, applySnapshot, applyRuntimeOps, runtimeSnapshot, computeBranch, mergeEntries, missingAncestor,
  SyncMismatch, type RuntimeMirror, type SessionMirror } from "./mirror.ts";

export interface CachedToolObject { value: ToolObject; revision: number; complete: boolean }
// Subscription IDs only distinguish subscriptions on this browser's connections; they are not credentials.
let nextSubscriptionId = 0;

export class MirrorStore {
  mirror = $state<SessionMirror | null>(null);
  runtime = $state<RuntimeMirror | null>(null);
  objects = $state(new Map<string, CachedToolObject>());
  private details = $state(new Map<string, ProjectedEntry>());
  private detailPending = new Map<string, Promise<void>>();
  private expanded = new Set<string>();
  private subscriptions = new Map<string, string>();
  private unavailable = new SvelteSet<string>();
  private runtimeReady = false;
  loading = $state(true);
  error = $state("");
  notices = $state<Notice[]>([]);
  closed = $state(false);
  stream = $state<StreamOptions>({ ...MOBILE_STREAM });
  private http = http;
  private epoch = 0;
  private buffering = false;
  private buffer: SyncOp[] = [];
  private attached = false;
  private hidden = false;
  private pending = false;
  private stopped = false;
  private ancestorPending = false;
  private off?: () => void;
  private unwatch?: () => void;
  private stopEffect?: () => void;
  constructor(readonly instanceId: string) {}
  start(): void {
    this.stopped = false;
    this.off = connection.listen((params, method) => {
      if (!("instanceId" in params) || params.instanceId !== this.instanceId) return;
      if (method === "session.ops") {
        const ops = (params as { ops: SyncOp[] }).ops;
        if (this.runtimeReady && this.runtime) {
          try {
            this.runtime = applyRuntimeOps(this.runtime, ops);
          }
          catch (error) {
            if (!(error instanceof SyncMismatch)) throw error;
            console.warn("Runtime mirror resync", error);
            this.attached = false; this.runtimeReady = false; this.scheduleSync(); return;
          }
          for (const id of this.expanded) this.subscribeTool(id);
        }
        if (this.buffering) this.buffer.push(...ops);
        else if (this.mirror) this.apply(ops);
      } else if (method === "session.runtime") {
        this.runtime = runtimeSnapshot((params as { snapshot: RuntimeSnapshot }).snapshot);
        this.runtimeReady = true;
        this.subscriptions.clear();
        this.unavailable.clear();
        this.objects = new Map([...this.objects].filter(([, object]) => object.complete));
        for (const id of this.expanded) this.subscribeTool(id);
      } else if (method === "tool.object") {
        const { toolCallId, subscriptionId, event } = params as {
          toolCallId: string; subscriptionId: string; event: ToolObjectEvent;
        };
        if (this.subscriptions.get(toolCallId) === subscriptionId) this.objectEvent(toolCallId, event);
      } else if (method === "session.resync") {
        console.warn("Server requested resync", params);
        this.attached = false;
        this.runtimeReady = false;
        this.subscriptions.clear();
        this.scheduleSync();
      }
      else if (method === "session.closed") {
        this.closed = true; this.attached = false; this.runtimeReady = false; this.subscriptions.clear();
      }
      else if (method === "session.notice") this.notices = [...this.notices, params as Notice];
    });
    this.unwatch = watchVisibility(() => {
      this.hidden = true;
      this.epoch++;
      this.buffering = false;
      this.buffer = [];
      this.runtimeReady = false;
      this.subscriptions.clear();
      if (this.attached) void connection.peer?.request("session.detach", { instanceId: this.instanceId }).catch(() => {});
      this.attached = false;
    }, () => { if (this.hidden) { this.hidden = false; this.scheduleSync(); } });
    this.stopEffect = $effect.root(() => {
      $effect(() => {
        const peer = connection.peer;
        const generation = connection.generation;
        // Run outside the effect: sync() reads reactive mirror/stream fields
        // before its first await, but they must not become effect dependencies.
        if (peer && !this.hidden) queueMicrotask(() => {
          if (connection.peer === peer && connection.generation === generation && !this.hidden) this.scheduleSync();
        });
        else { this.epoch++; this.attached = false; this.runtimeReady = false;
          this.subscriptions.clear(); this.buffering = false; this.buffer = []; }
      });
    });
  }
  stop(): void {
    this.stopped = true;
    this.epoch++;
    if (this.attached) void connection.peer?.request("session.detach", { instanceId: this.instanceId }).catch(() => {});
    this.off?.(); this.unwatch?.(); this.stopEffect?.();
  }
  private scheduleSync(): void {
    if (this.pending) { this.epoch++; return; }
    void this.sync();
  }
  private async sync(forceFull = false): Promise<void> {
    const peer = connection.peer;
    if (!peer || this.hidden || this.closed || this.stopped) return;
    const epoch = ++this.epoch;
    this.pending = true;
    this.loading = !this.mirror;
    this.error = "";
    this.buffering = true;
    this.buffer = [];
    try {
      if (!this.attached) {
        await peer.request("session.attach", { instanceId: this.instanceId, stream: this.stream });
        if (epoch !== this.epoch) {
          await peer.request("session.detach", { instanceId: this.instanceId });
          this.runtimeReady = false;
          return;
        }
        this.attached = true;
      }
      if (epoch !== this.epoch) return;
      const delta = !forceFull && this.mirror !== null;
      let snapshot: SessionSnapshot;
      try {
        snapshot = await this.http.getSync(this.instanceId, {
          since: delta ? this.mirror!.entryCount : undefined,
        });
        if (epoch !== this.epoch) return;
        // An invalid delta must be retried as a full snapshot.
        const next = applyOps(applySnapshot(this.mirror, snapshot), this.buffer.filter(op => op.seq > snapshot.seq));
        this.mirror = next;
      } catch (error) {
        if (!delta || epoch !== this.epoch) throw error;
        snapshot = await this.http.getSync(this.instanceId);
        if (epoch !== this.epoch) return;
        this.mirror = applyOps(applySnapshot(this.mirror, snapshot), this.buffer.filter(op => op.seq > snapshot.seq));
      }
      if (epoch !== this.epoch) return;
      this.buffer = [];
      this.buffering = false;
      this.loading = false;
      void this.loadAncestors();
    } catch (error) {
      if (epoch === this.epoch) {
        this.buffering = false;
        this.buffer = [];
        this.error = String(error);
        this.loading = false;
      }
    } finally {
      this.pending = false;
      if (epoch !== this.epoch && connection.peer && !this.hidden && !this.closed && !this.stopped) this.scheduleSync();
    }
  }
  private apply(ops: SyncOp[]): void {
    if (!this.mirror) return;
    try { this.mirror = applyOps(this.mirror, ops); void this.loadAncestors(); }
    catch (error) {
      if (!(error instanceof SyncMismatch)) throw error;
      console.warn("History mirror resync", error);
      this.attached = false; this.runtimeReady = false; this.scheduleSync();
    }
  }
  async loadAncestors(): Promise<void> {
    if (this.ancestorPending) return;
    const current = this.mirror;
    if (!current) return;
    const ancestor = missingAncestor(current);
    if (!ancestor) return;
    const epoch = this.epoch;
    this.ancestorPending = true;
    try {
      const result = await this.http.getBranch(this.instanceId, ancestor, 100);
      if (epoch !== this.epoch || !this.mirror) return;
      const copy = { ...this.mirror, entries: new Map(this.mirror.entries), entryIds: new Map(this.mirror.entryIds) };
      mergeEntries(copy, result.entries);
      copy.hasMoreBefore = result.hasMoreBefore;
      this.mirror = copy;
    } catch (error) { this.error = String(error); }
    finally { this.ancestorPending = false; }
  }
  get branch() {
    return this.mirror ? computeBranch(this.mirror).map(item => this.details.get(item.entry.id) ?? item) : [];
  }
  expandEntry(entryId: string): Promise<void> {
    if (this.details.has(entryId)) return Promise.resolve();
    const pending = this.detailPending.get(entryId);
    if (pending) return pending;
    const request = this.http.getEntry(this.instanceId, entryId).then(result => {
      if (!this.stopped) this.details = new Map(this.details).set(entryId, result);
    }).finally(() => this.detailPending.delete(entryId));
    this.detailPending.set(entryId, request);
    return request;
  }
  async setStream(stream: StreamOptions): Promise<void> {
    this.stream = stream;
    await connection.peer?.request("session.setStreamOptions", { instanceId: this.instanceId, stream });
  }
  setToolExpanded(ids: string[], expanded: boolean): void {
    for (const id of ids) {
      if (expanded) {
        this.expanded.add(id);
        this.subscribeTool(id);
      } else {
        this.expanded.delete(id);
        const subscriptionId = this.subscriptions.get(id);
        this.subscriptions.delete(id);
        if (subscriptionId) void connection.peer?.request("tool.unsubscribe",
          { instanceId: this.instanceId, toolCallId: id, subscriptionId }).catch(error => { this.error = String(error); });
        if (!this.objects.get(id)?.complete) {
          const objects = new Map(this.objects);
          objects.delete(id);
          this.objects = objects;
        }
      }
    }
  }
  canStreamTool(id: string): boolean {
    return !this.unavailable.has(id) && (this.runtime?.calls.has(id) === true || this.runtime?.tools.has(id) === true);
  }
  private subscribeTool(id: string): void {
    if (!this.runtimeReady || !this.canStreamTool(id) || this.objects.get(id)?.complete || this.subscriptions.has(id)) return;
    const subscriptionId = String(++nextSubscriptionId);
    this.subscriptions.set(id, subscriptionId);
    void connection.peer?.request("tool.subscribe", { instanceId: this.instanceId, toolCallId: id, subscriptionId })
      .catch(error => {
        if (this.subscriptions.get(id) !== subscriptionId) return;
        this.subscriptions.delete(id);
        this.unavailable.add(id);
        this.error = String(error);
      });
  }
  private objectEvent(id: string, event: ToolObjectEvent): void {
    const objects = new Map(this.objects);
    const previous = objects.get(id);
    if (event.type === "snapshot") objects.set(id, { value: event.value, revision: event.revision, complete: false });
    else if (event.type === "unavailable") {
      objects.delete(id);
      this.unavailable.add(id);
      this.subscriptions.delete(id);
    } else {
      try {
        if (!previous) throw new Error("Missing tool snapshot");
        if (event.type === "patch") {
          if (previous.revision !== event.from) throw new Error("Tool revision mismatch");
          objects.set(id, { value: applyObjectChanges(previous.value, event.changes), revision: event.revision, complete: false });
        } else {
          if (previous.revision !== event.revision || previous.value.result?.id !== event.entryId) {
            throw new Error("Incomplete tool EOF");
          }
          objects.set(id, { ...previous, complete: true });
          this.subscriptions.delete(id);
        }
      } catch {
        objects.delete(id);
        this.objects = objects;
        this.subscriptions.delete(id);
        this.subscribeTool(id);
        return;
      }
    }
    this.objects = objects;
  }
}
