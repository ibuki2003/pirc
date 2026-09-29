import type { OpInput, SyncOp } from "../../api/src/index.ts";

export class Outbox {
  private pending: SyncOp[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private seq: number, private reconcile: () => void, private send: (ops: SyncOp[]) => void) {}
  get sequence(): number { return this.seq; }
  push(op: OpInput): void {
    const last = this.pending.at(-1);
    if (last?.op === "append" && last.target === "live.content" && op.op === "append" && op.target === "live.content" && last.index === op.index) {
      last.text += op.text; return;
    }
    if (last?.op === "set" && last.target === "live.content" && op.op === "append" && op.target === "live.content" && last.index === op.index) {
      if (last.value.type === "text") { last.value.text += op.text; return; }
      if (last.value.type === "thinking") { last.value.thinking += op.text; return; }
    }
    if (last?.op === "set" && op.op === "set" && last.target === op.target &&
      (last.target === "leaf" || last.target === "state" || last.target === "live" ||
        (last.target === "tool" && op.target === "tool" && last.key === op.key) ||
        (last.target === "live.content" && op.target === "live.content" && last.index === op.index))) {
      this.pending[this.pending.length - 1] = { ...op, seq: last.seq } as SyncOp;
      return;
    }
    this.pending.push({ ...op, seq: ++this.seq } as SyncOp);
    this.timer ??= setTimeout(() => this.flush(), 100);
  }
  flush(): void {
    clearTimeout(this.timer); this.timer = undefined;
    this.reconcile();
    if (this.pending.length) this.send(this.pending.splice(0));
  }
  stop(): void { clearTimeout(this.timer); this.timer = undefined; this.pending = []; }
}
