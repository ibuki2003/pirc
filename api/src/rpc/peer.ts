import { encodeFrame, orderedFrames } from "./codec.ts";
import { RPC_ERRORS, RpcError } from "./errors.ts";

export type MethodTable = Record<string, { params: unknown; result: unknown }>;
export interface Protocol {
  requests: MethodTable;
  notifications: Record<string, unknown>;
}
export interface Transport {
  /** Negotiated permessage-deflate; avoid compressing JSON twice. */
  websocketCompression?: boolean;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (data: string | Blob | ArrayBuffer | ArrayBufferView) => void): void;
  onClose(handler: () => void): void;
}
export type Handlers<L extends Protocol> = {
  requests?: { [M in keyof L["requests"]]?: (params: L["requests"][M]["params"]) => L["requests"][M]["result"] | Promise<L["requests"][M]["result"]> };
  notifications?: { [M in keyof L["notifications"]]?: (params: L["notifications"][M]) => void | Promise<void> };
};
type Pending = { resolve(value: unknown): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> };

export class RpcPeer<L extends Protocol, R extends Protocol> {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sendQueue: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private transport: Transport, private handlers: Handlers<L> = {}, private options: { timeoutMs?: number } = {}) {
    transport.onMessage(orderedFrames((message) => { void this.receive(message); }, () => this.close("Invalid frame")));
    transport.onClose(() => this.disconnect());
  }
  request<M extends keyof R["requests"] & string>(method: M, params: R["requests"][M]["params"]): Promise<R["requests"][M]["result"]> {
    if (this.closed) return Promise.reject(new Error("RPC peer closed"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(RPC_ERRORS.HOST_TIMEOUT, `RPC timeout: ${method}`));
      }, this.options.timeoutMs ?? 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  notify<M extends keyof R["notifications"] & string>(method: M, params: R["notifications"][M]): void {
    this.send({ jsonrpc: "2.0", method, params });
  }
  close(reason = "RPC peer closed"): void {
    if (this.closed) return;
    this.disconnect();
    this.transport.close(1000, reason);
  }
  private disconnect(): void {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("RPC peer closed"));
    }
    this.pending.clear();
  }
  private send(message: unknown): void {
    this.sendQueue = this.sendQueue.then(async () => {
      if (!this.closed) this.transport.send(await encodeFrame(message, this.transport.websocketCompression));
    }).catch(() => this.close("Send failed"));
  }
  private async receive(message: unknown): Promise<void> {
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    const m = message as Record<string, unknown>;
    if (m.jsonrpc !== "2.0") return;
    if (typeof m.method === "string") {
      const handler = m.id === undefined
        ? this.handlers.notifications?.[m.method]
        : this.handlers.requests?.[m.method];
      if (m.id === undefined) {
        if (handler) void Promise.resolve().then(() => (handler as (params: unknown) => unknown)(m.params)).catch(() => {});
        return;
      }
      if (typeof m.id !== "number") return;
      try {
        if (!handler) throw new RpcError(RPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${m.method}`);
        this.send({ jsonrpc: "2.0", id: m.id, result: await (handler as (params: unknown) => unknown)(m.params) });
      } catch (error) {
        const code = error instanceof RpcError ? error.code : RPC_ERRORS.INTERNAL_ERROR;
        this.send({ jsonrpc: "2.0", id: m.id, error: { code, message: error instanceof Error ? error.message : String(error) } });
      }
      return;
    }
    if (typeof m.id !== "number") return;
    const pending = this.pending.get(m.id);
    if (!pending) return;
    this.pending.delete(m.id);
    clearTimeout(pending.timer);
    if (m.error && typeof m.error === "object") {
      const error = m.error as { code?: number; message?: string };
      pending.reject(new RpcError(error.code ?? RPC_ERRORS.INTERNAL_ERROR, error.message ?? "RPC error"));
    } else pending.resolve(m.result);
  }
}
