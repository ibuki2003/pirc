import { RpcPeer, type Handlers, type Protocol, type Transport } from "../rpc/peer.ts";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
export class WsClient<L extends Protocol, R extends Protocol> {
  private socket: WebSocket | undefined;
  private peer: RpcPeer<L, R> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
  private attempts = 0;
  onStatus?: (status: ConnectionStatus, peer?: RpcPeer<L, R>) => void;
  constructor(private url: string, private handlers: Handlers<L>, private WebSocketClass: typeof WebSocket = WebSocket) {}
  start(): void { if (!this.stopped) return; this.stopped = false; this.connect(); }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeat);
    this.peer?.close();
    this.socket?.close();
    this.peer = undefined;
    this.onStatus?.("disconnected");
  }
  get current(): RpcPeer<L, R> | undefined { return this.peer; }
  private connect(): void {
    if (this.stopped) return;
    this.onStatus?.("connecting");
    const socket = new this.WebSocketClass(this.url);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      if (this.stopped) { socket.close(); return; }
      this.attempts = 0;
      const transport: Transport = {
        send: (data) => socket.send(data),
        close: (code, reason) => socket.close(code, reason),
        onMessage: (handler) => socket.addEventListener("message", (event) => handler(event.data)),
        onClose: (handler) => socket.addEventListener("close", handler),
      };
      this.peer = new RpcPeer<L, R>(transport, this.handlers);
      this.onStatus?.("connected", this.peer);
      this.heartbeat = setInterval(() => {
        void this.peer?.request("ping" as keyof R["requests"] & string, {} as R["requests"][keyof R["requests"]]["params"])
          .catch(() => socket.close());
      }, 20000);
    });
    const disconnected = () => {
      if (this.socket !== socket) return;
      clearInterval(this.heartbeat);
      this.peer?.close();
      this.peer = undefined;
      this.socket = undefined;
      this.onStatus?.("disconnected");
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.connect(), Math.min(30000, 500 * 2 ** this.attempts++));
    };
    socket.addEventListener("close", disconnected);
    socket.addEventListener("error", () => socket.close());
  }
}
