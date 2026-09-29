import { MOBILE_STREAM, type StreamOptions, type SyncOp, type Notice, type SessionSnapshot } from "@pirc/api";
import { connection } from "../connection.svelte.ts";
import { http } from "../http.ts";
import { watchVisibility } from "../visibility.ts";
import { applyOps, applySnapshot, computeBranch, mergeEntries, missingAncestor, type SessionMirror } from "./mirror.ts";

export class MirrorStore {
  mirror = $state<SessionMirror | null>(null);
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
        if (this.buffering) this.buffer.push(...ops);
        else if (this.mirror) this.apply(ops);
      } else if (method === "session.resync") this.scheduleSync();
      else if (method === "session.closed") { this.closed = true; this.attached = false; }
      else if (method === "session.notice") this.notices = [...this.notices, params as Notice];
    });
    this.unwatch = watchVisibility(() => {
      this.hidden = true;
      this.epoch++;
      this.buffering = false;
      this.buffer = [];
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
        else { this.epoch++; this.attached = false; this.buffering = false; this.buffer = []; }
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
        this.attached = true;
      }
      if (epoch !== this.epoch) return;
      const delta = !forceFull && this.mirror !== null;
      let snapshot: SessionSnapshot;
      try {
        snapshot = await this.http.getSync(this.instanceId, {
          since: delta ? this.mirror!.entryCount : undefined,
          stream: this.stream,
        });
        if (epoch !== this.epoch) return;
        // An invalid delta must be retried as a full snapshot.
        const next = applyOps(applySnapshot(this.mirror, snapshot), this.buffer.filter(op => op.seq > snapshot.seq));
        this.mirror = next;
      } catch (error) {
        if (!delta || epoch !== this.epoch) throw error;
        snapshot = await this.http.getSync(this.instanceId, { stream: this.stream });
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
    catch { this.scheduleSync(); }
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
      const result = await this.http.getBranch(this.instanceId, ancestor, 100, this.stream);
      if (epoch !== this.epoch || !this.mirror) return;
      const copy = { ...this.mirror, entries: new Map(this.mirror.entries), entryIds: new Map(this.mirror.entryIds) };
      mergeEntries(copy, result.entries);
      copy.hasMoreBefore = result.hasMoreBefore;
      this.mirror = copy;
    } catch (error) { this.error = String(error); }
    finally { this.ancestorPending = false; }
  }
  get branch() { return this.mirror ? computeBranch(this.mirror) : []; }
  async expandEntry(entryId: string): Promise<void> {
    const result = await this.http.getEntry(this.instanceId, entryId);
    if (!this.mirror) return;
    const copy = { ...this.mirror, entries: new Map(this.mirror.entries), entryIds: new Map(this.mirror.entryIds) };
    mergeEntries(copy, [{ ...result }]);
    this.mirror = copy;
  }
  async setStream(stream: StreamOptions): Promise<void> {
    this.stream = stream;
    await connection.peer?.request("session.setStreamOptions", { instanceId: this.instanceId, stream });
    this.scheduleSync();
  }
}
