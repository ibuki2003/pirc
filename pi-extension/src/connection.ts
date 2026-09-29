import { WsClient, PROTOCOL_VERSION, type RpcPeer, type Handlers } from "../../api/src/index.ts";
import type { HostToServer, ServerToHost } from "../../api/src/host-protocol.ts";
import type { SessionState } from "../../api/src/model.ts";

export class Connection {
  private client: WsClient<ServerToHost, HostToServer>;
  private peer?: RpcPeer<ServerToHost, HostToServer>;
  private ready = false;
  private active = true;
  private generation = 0;
  constructor(url: string, handlers: Handlers<ServerToHost>, private state: () => SessionState, private count: () => number,
    private status: (state: "connecting" | "connected" | "disconnected") => void) {
    // A queued RPC frame can still be dispatched after session_shutdown. Never invoke
    // handlers that capture the old extension context once that session has ended.
    const guarded: Handlers<ServerToHost> = {
      requests: Object.fromEntries(Object.entries(handlers.requests ?? {}).map(([method, handler]) =>
        [method, (params: never) => {
          if (!this.active) throw new Error("Session is closed");
          return handler(params);
        }])) as Handlers<ServerToHost>["requests"],
      notifications: Object.fromEntries(Object.entries(handlers.notifications ?? {}).map(([method, handler]) =>
        [method, (params: never) => { if (this.active) return handler(params); }])) as Handlers<ServerToHost>["notifications"],
    };
    this.client = new WsClient(url, guarded);
    this.client.onStatus = (status, peer) => {
      if (!this.active) return;
      this.ready = false;
      const generation = ++this.generation;
      this.peer = peer;
      this.status(status === "connected" ? "connecting" : status);
      if (peer) {
        try {
          void peer.request("host.hello", { protocolVersion: PROTOCOL_VERSION, state: this.state(), entryCount: this.count() })
            .then(() => { if (this.active && generation === this.generation) { this.ready = true; this.status("connected"); } })
            .catch(() => { if (this.active && generation === this.generation) peer.close("Hello failed"); });
        } catch {
          peer.close("Hello failed");
        }
      }
    };
  }
  start(): void { this.client.start(); }
  stop(): void {
    this.active = false;
    this.ready = false;
    ++this.generation;
    this.client.onStatus = undefined;
    this.client.stop();
  }
  notify<M extends keyof HostToServer["notifications"] & string>(method: M, params: HostToServer["notifications"][M]): void {
    if (this.active && this.ready) this.peer?.notify(method, params);
  }
  close(reason: HostToServer["notifications"]["host.close"]): void {
    if (!this.active) return;
    // Queue host.close before disabling normal traffic and callbacks.
    if (this.ready) this.peer?.notify("host.close", reason);
    this.active = false;
    this.ready = false;
    ++this.generation;
    this.client.onStatus = undefined;
    // RpcPeer serializes frames asynchronously; allow the queued close notification to leave first.
    setTimeout(() => this.stop(), 100);
  }
}
