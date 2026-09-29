import { WsClient, type RpcPeer, type ServerToClient, type ClientToServer, type ConnectionStatus } from "@pirc/api";

type Listener = (params: ServerToClient["notifications"][keyof ServerToClient["notifications"]], method: keyof ServerToClient["notifications"]) => void;
export class Connection {
  status = $state<ConnectionStatus>("disconnected");
  peer = $state<RpcPeer<ServerToClient, ClientToServer> | undefined>();
  generation = $state(0);
  private listeners = new Set<Listener>();
  private client = new WsClient<ServerToClient, ClientToServer>(
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`,
    {
      requests: { ping: () => ({}) },
      notifications: {
        "sessions.changed": p => this.emit(p, "sessions.changed"),
        "session.ops": p => this.emit(p, "session.ops"),
        "session.notice": p => this.emit(p, "session.notice"),
        "session.resync": p => this.emit(p, "session.resync"),
        "session.closed": p => this.emit(p, "session.closed"),
      },
    },
  );
  constructor() {
    this.client.onStatus = (status, peer) => {
      this.status = status;
      this.peer = peer;
      this.generation++;
    };
  }
  start(): void { this.client.start(); }
  stop(): void { this.client.stop(); }
  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(params: Parameters<Listener>[0], method: Parameters<Listener>[1]): void {
    for (const listener of this.listeners) listener(params, method);
  }
}
export const connection = new Connection();
