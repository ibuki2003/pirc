import {
  type HostToServer,
  PROTOCOL_VERSION,
  RPC_ERRORS,
  RpcError,
  RpcPeer,
  type ServerToHost,
  type SessionSummary,
  type Transport,
} from "@pirc/api";
import { initialSummary, updateSummary } from "./summary.ts";
import type { Registry } from "./registry.ts";

export class HostConnection {
  readonly peer: RpcPeer<HostToServer, ServerToHost>;
  summary!: SessionSummary;
  private registered = false;
  private closed = false;
  constructor(private registry: Registry, transport: Transport) {
    this.peer = new RpcPeer(transport, {
      requests: {
        "host.hello": ({ protocolVersion, state, entryCount }) => {
          if (this.registered) {
            throw new RpcError(
              RPC_ERRORS.INVALID_REQUEST,
              "Already registered",
            );
          }
          if (protocolVersion !== PROTOCOL_VERSION) {
            setTimeout(() => this.peer.close("Protocol mismatch"), 0);
            throw new RpcError(
              RPC_ERRORS.PROTOCOL_MISMATCH,
              "Protocol mismatch",
            );
          }
          this.summary = initialSummary(state, entryCount);
          this.registered = true;
          this.registry.register(this);
          return {};
        },
        ping: () => {
          if (!this.registered) {
            throw new RpcError(
              RPC_ERRORS.INVALID_REQUEST,
              "host.hello required",
            );
          }
          return {};
        },
      },
      notifications: {
        "host.close": ({ reason }) => {
          if (this.registered) this.registry.unregister(this, reason);
          this.close();
        },
        "session.ops": ({ ops }) => {
          if (!this.registered) {
            this.close();
            return;
          }
          this.summary = updateSummary(this.summary, ops);
          this.registry.fanout(this.summary.instanceId, ops);
          this.registry.changed();
        },
        "session.notice": (notice) => {
          if (this.registered) {
            this.registry.notice(this.summary.instanceId, notice);
          } else this.close();
        },
      },
    }, { timeoutMs: 15000 });
    transport.onClose(() => this.disconnect());
  }
  viewers(count: number): void {
    this.peer.notify("host.viewers", { count });
  }
  close(): void {
    this.peer.close();
    this.disconnect();
  }
  private disconnect(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.registered) this.registry.unregister(this);
  }
}
