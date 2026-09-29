import { hostname } from "node:os";
import type { ExtensionAPI, ExtensionContext, SessionShutdownEvent } from "@earendil-works/pi-coding-agent";
import type { Handlers, OpInput, SessionSnapshot } from "../../api/src/index.ts";
import type { ServerToHost } from "../../api/src/host-protocol.ts";
import { Connection } from "./connection.ts";
import { controls } from "./controls.ts";
import { EntryTracker } from "./entry-tracker.ts";
import { host } from "./host-id.ts";
import { LiveTracker } from "./live-tracker.ts";
import { Outbox } from "./outbox.ts";
import { StateTracker } from "./state-tracker.ts";

export class Bridge {
  private outbox: Outbox;
  private entries: EntryTracker;
  readonly live: LiveTracker;
  readonly state: StateTracker;
  private connection: Connection;
  private poll: ReturnType<typeof setInterval>;
  private stopped = false;
  private viewers = 0;
  private status: "connecting" | "connected" | "disconnected" = "disconnected";
  readonly instanceId: string;
  constructor(private pi: ExtensionAPI, private ctx: ExtensionContext, url: string, previous?: { instanceId: string; seq: number }) {
    this.instanceId = previous?.instanceId ?? crypto.randomUUID();
    const push = (op: OpInput) => this.outbox.push(op);
    this.entries = new EntryTracker(ctx, push);
    this.live = new LiveTracker(push);
    this.state = new StateTracker(pi, ctx, { instanceId: this.instanceId, hostId: host().hostId, hostname: hostname(), piVersion: "0.87.1" }, push);
    this.outbox = new Outbox(previous?.seq ?? 0, () => this.reconcile(), ops => this.connection.notify("session.ops", { ops }));
    const handlers: Handlers<ServerToHost> = {
      requests: {
        "host.sync": ({ since, branchLimit }): SessionSnapshot => {
          this.outbox.flush();
          return { ...this.entries.snapshot(since, branchLimit), seq: this.outbox.sequence,
            state: this.state.get(), ...this.live.snapshot() };
        },
        "host.branch": ({ leafId, limit }) => this.entries.branch(leafId, limit),
        "host.entry": ({ entryId }) => this.entries.entry(entryId),
        "host.tree": () => this.ctx.sessionManager.getEntries().map(entry => ({
          id: entry.id, parentId: entry.parentId, type: entry.type,
          role: entry.type === "message" ? entry.message.role : undefined,
          label: this.ctx.sessionManager.getLabel(entry.id), timestamp: entry.timestamp,
          preview: entry.type === "message" ? JSON.stringify(entry.message).slice(0, 120) : entry.type,
        })),
        ...controls(pi, ctx, (requestId, message) => this.connection.notify("session.notice", { level: "error", message, requestId })),
        ping: () => ({}),
      },
      notifications: { "host.viewers": ({ count }) => { this.viewers = count; this.footer(); } },
    };
    this.connection = new Connection(url, handlers, () => this.state.get(), () => this.entries.count, status => {
      this.status = status; this.footer();
    });
    this.connection.start();
    this.poll = setInterval(() => { if (!this.stopped) this.outbox.flush(); }, 1000);
  }
  reconcile(): void { this.entries.reconcile(); this.state.diff(); }
  footer(): void {
    if (this.stopped) return;
    if (this.ctx.mode === "tui") this.ctx.ui.setStatus("pirc", `pirc: ${this.status} · ${this.viewers} viewers`);
  }
  describe(): string { return `pirc: ${this.status}, ${this.viewers} viewers`; }
  messageStart(event: Parameters<LiveTracker["start"]>[0]): void { this.live.start(event); this.state.diff(); }
  messageUpdate(event: Parameters<LiveTracker["update"]>[0]): void { this.live.update(event); }
  messageEnd(role: string): void { if (role === "assistant") this.live.end(); this.state.diff(); }
  toolStart(event: Parameters<LiveTracker["toolStart"]>[0]): void { this.live.toolStart(event); }
  toolUpdate(event: Parameters<LiveTracker["toolUpdate"]>[0]): void { this.live.toolUpdate(event); }
  toolEnd(event: Parameters<LiveTracker["toolEnd"]>[0]): void { this.live.toolEnd(event); }
  compactFailed(message: string): void { this.connection.notify("session.notice", { level: "error", message }); }
  stop(event: SessionShutdownEvent): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.poll);
    this.outbox.flush();
    if (event.reason === "reload") {
      const file = this.ctx.sessionManager.getSessionFile();
      if (file) host().sessions.set(file, { instanceId: this.instanceId, seq: this.outbox.sequence });
    }
    this.connection.close({ reason: event.reason, targetSessionFile: event.targetSessionFile });
    this.outbox.stop();
    // Accessing the context is only valid during session_shutdown itself.
    if (this.ctx.mode === "tui") this.ctx.ui.setStatus("pirc", undefined);
  }
}
