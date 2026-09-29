import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { OpInput, ProjectedEntry } from "../../api/src/index.ts";

export class EntryTracker {
  private cursor: number;
  private lastId: string | null;
  private leaf: string | null;
  constructor(private ctx: ExtensionContext, private push: (op: OpInput) => void) {
    const entries = ctx.sessionManager.getEntries();
    this.cursor = entries.length;
    this.lastId = entries.at(-1)?.id ?? null;
    this.leaf = ctx.sessionManager.getLeafId();
  }
  get count(): number { return this.ctx.sessionManager.getEntries().length; }
  reconcile(): void {
    const entries = this.ctx.sessionManager.getEntries();
    if (this.cursor > entries.length || (this.cursor > 0 && entries[this.cursor - 1]?.id !== this.lastId)) {
      this.push({ op: "reset" });
      this.cursor = entries.length;
    }
    let appended: string | undefined;
    if (entries.length > this.cursor) {
      const items: ProjectedEntry[] = entries.slice(this.cursor).map((entry, offset) => ({ index: this.cursor + offset, entry }));
      this.push({ op: "append", target: "entries", from: this.cursor, items });
      appended = items.at(-1)?.entry.id;
      this.cursor = entries.length;
    }
    const leaf = this.ctx.sessionManager.getLeafId();
    if (leaf !== (appended ?? this.leaf)) this.push({ op: "set", target: "leaf", value: leaf });
    this.leaf = leaf;
    this.lastId = entries.at(-1)?.id ?? null;
  }
  branch(leafId: string, limit: number): { entries: ProjectedEntry[]; hasMoreBefore: boolean } {
    const all = this.ctx.sessionManager.getEntries();
    if (!all.some(e => e.id === leafId)) throw new Error("Entry not found");
    const branch = this.ctx.sessionManager.getBranch(leafId);
    const start = Math.max(0, branch.length - limit);
    const indices = new Map(all.map((entry, index) => [entry.id, index]));
    return { entries: branch.slice(start).map(entry => ({ index: indices.get(entry.id)!, entry })), hasMoreBefore: start > 0 };
  }
  snapshot(since: number | undefined, branchLimit: number): Pick<import("../../api/src/index.ts").SessionSnapshot, "entryCount" | "lastEntryId" | "leafId" | "entries" | "hasMoreBefore" | "mode"> {
    const all = this.ctx.sessionManager.getEntries();
    const delta = since !== undefined && since >= 0 && since <= all.length;
    const selected = delta
      ? all.slice(since).map((entry, offset) => ({ index: since + offset, entry }))
      : this.branchForSnapshot(branchLimit, all);
    return {
      entryCount: all.length, lastEntryId: all.at(-1)?.id ?? null,
      leafId: this.ctx.sessionManager.getLeafId(), entries: selected,
      hasMoreBefore: !delta && this.ctx.sessionManager.getBranch().length > selected.length,
      mode: delta ? "delta" : "full",
    };
  }
  private branchForSnapshot(limit: number, all: ReturnType<ExtensionContext["sessionManager"]["getEntries"]>): ProjectedEntry[] {
    const indices = new Map(all.map((entry, index) => [entry.id, index]));
    return this.ctx.sessionManager.getBranch().slice(-limit).map(entry => ({ index: indices.get(entry.id)!, entry }));
  }
  entry(id: string): { index: number; entry: import("../../api/src/index.ts").SessionEntry } {
    const all = this.ctx.sessionManager.getEntries();
    const index = all.findIndex(e => e.id === id);
    if (index < 0) throw new Error("Entry not found");
    return { index, entry: all[index] };
  }
}
