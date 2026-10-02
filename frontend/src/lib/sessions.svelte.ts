import type { SessionListing, SessionSummary } from "@pirc/api";
import { connection } from "./connection.svelte.ts";
import { http } from "./http.ts";

export class Sessions {
  items = $state<SessionSummary[]>([]);
  error = $state("");
  private epoch = 0;
  private previews = new Map<string, SessionSummary["messagePreview"]>();
  private previewRequest?: Promise<void>;
  private withPreview(item: SessionListing): SessionSummary {
    return { ...item, messagePreview: this.previews.get(item.instanceId) };
  }
  refreshPreviews(): Promise<void> {
    if (this.previewRequest) return this.previewRequest;
    this.previewRequest = http.listSessions().then(items => {
      this.previews = new Map(items.map(item => [item.instanceId, item.messagePreview]));
      this.items = connection.peer
        ? this.items.map(item => this.withPreview(item))
        : items;
    }).catch(error => { this.error = String(error); })
      .finally(() => { this.previewRequest = undefined; });
    return this.previewRequest;
  }
  start(): () => void {
    const off = connection.listen((params, method) => {
      if (method !== "sessions.changed") return;
      const { upsert, removed } = params as { upsert: SessionListing[]; removed: string[] };
      const items = new Map(this.items.map(item => [item.instanceId, item]));
      for (const id of removed) { items.delete(id); this.previews.delete(id); }
      for (const item of upsert) items.set(item.instanceId, this.withPreview(item));
      this.items = [...items.values()];
    });
    const stop = $effect.root(() => {
      $effect(() => {
        const peer = connection.peer;
        const generation = connection.generation;
        if (!peer) return;
        const epoch = ++this.epoch;
        void peer.request("sessions.subscribe", {}).then(items => {
          if (this.epoch === epoch) this.items = items.map(item => this.withPreview(item));
        }).catch(e => { if (this.epoch === epoch) this.error = String(e); });
        return () => { this.epoch++; void peer.request("sessions.unsubscribe", {}).catch(() => {}); };
      });
    });
    return () => { off(); stop(); };
  }
}
export const sessions = new Sessions();
