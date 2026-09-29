import type { SessionSummary } from "@pirc/api";
import { connection } from "./connection.svelte.ts";
import { http } from "./http.ts";

class Sessions {
  items = $state<SessionSummary[]>([]);
  error = $state("");
  private epoch = 0;
  start(): () => void {
    const off = connection.listen((params, method) => {
      if (method === "sessions.changed") this.items = (params as { sessions: SessionSummary[] }).sessions;
    });
    const stop = $effect.root(() => {
      $effect(() => {
        const peer = connection.peer;
        const generation = connection.generation;
        if (!peer) return;
        const epoch = ++this.epoch;
        void peer.request("sessions.subscribe", {}).then(items => {
          if (this.epoch === epoch) this.items = items;
        }).catch(e => { if (this.epoch === epoch) this.error = String(e); });
        return () => { this.epoch++; void peer.request("sessions.unsubscribe", {}).catch(() => {}); };
      });
    });
    void http.listSessions().then(items => { if (!connection.peer) this.items = items; }).catch(() => {});
    return () => { off(); stop(); };
  }
}
export const sessions = new Sessions();
