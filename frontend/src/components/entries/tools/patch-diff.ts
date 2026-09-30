export interface PatchLine {
  kind: "added" | "removed" | "context" | "meta";
  text: string;
}
export interface PatchRow {
  left?: PatchLine;
  right?: PatchLine;
  meta?: PatchLine;
}

export function patchLines(patch: string): PatchLine[] {
  return patch.split(/\r?\n/).map(text => ({
    kind: text.startsWith("***") || text.startsWith("@@") ? "meta"
      : text.startsWith("+") ? "added"
      : text.startsWith("-") ? "removed"
      : text.startsWith(" ") ? "context" : "meta",
    text,
  }));
}

export function patchRows(lines: PatchLine[]): PatchRow[] {
  const rows: PatchRow[] = [];
  let removed: PatchLine[] = [];
  let added: PatchLine[] = [];
  function flush() {
    for (let i = 0; i < Math.max(removed.length, added.length); i++) {
      rows.push({ left: removed[i], right: added[i] });
    }
    removed = [];
    added = [];
  }
  for (const line of lines) {
    if (line.kind === "removed") {
      if (added.length) flush();
      removed.push(line);
    } else if (line.kind === "added") {
      added.push(line);
    } else {
      flush();
      rows.push(line.kind === "context" ? { left: line, right: line } : { meta: line });
    }
  }
  flush();
  return rows;
}
