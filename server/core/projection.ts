import {
  type LiveBlock,
  type ProjectedAssistantEntry,
  type ProjectedEntry,
  type RedactedEntry,
  type RedactedToolCall,
  type SessionSnapshot,
  type StreamOptions,
  type SyncOp,
  type ToolProgress,
} from "@pirc/api";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASH_COMMAND_BYTES = 128;

function head(text: string, limit: number): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return text;
  return decoder.decode(bytes.subarray(0, limit)).replace(/\uFFFD$/, "");
}

function tail(text: string, limit: number): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return text;
  return decoder.decode(bytes.subarray(bytes.length - limit)).replace(/^\uFFFD/, "");
}

function lineCount(text: string): number {
  return text ? text.split(/\r?\n/).length - Number(text.endsWith("\n")) : 0;
}

function patchChanges(patch: string): NonNullable<RedactedToolCall["changes"]> {
  const files: NonNullable<RedactedToolCall["changes"]> = [];
  let section: "Update" | "Add" | "Delete" | undefined;
  for (const line of patch.split(/\r?\n/)) {
    const marker = /^\*\*\* (Update|Add|Delete) File: (.+)$/.exec(line);
    if (marker) {
      section = marker[1] as typeof section;
      files.push(section === "Delete" ? { path: marker[2] }
        : section === "Add" ? { path: marker[2], added: 0 }
        : { path: marker[2], added: 0, removed: 0 });
      continue;
    }
    if (line === "*** End of File" || line === "*** End Patch") { section = undefined; continue; }
    const file = files.at(-1);
    if (!file || section === "Delete" || !section) continue;
    if (line.startsWith("+")) file.added!++;
    else if (line.startsWith("-")) file.removed = (file.removed ?? 0) + 1;
  }
  return files;
}

function redactedCall(block: { id: string; name: string; arguments?: Record<string, unknown> }): RedactedToolCall {
  const name = block.name;
  const args = block.arguments;
  const base = { type: "toolCall" as const, id: block.id, name, redacted: true as const, originalBytes: encoder.encode(JSON.stringify(block)).length };
  if (args === undefined) return base;
  if (name === "read") return { ...base, arguments: args };
  if (name === "bash") {
    return {
      ...base,
      arguments: { command: head(String(args?.command ?? ""), BASH_COMMAND_BYTES) },
    };
  }
  if (name === "edit" || name === "write") {
    const path = String(args?.path ?? "");
    return {
      ...base,
      arguments: { path },
      changes: [{
        path,
        added: lineCount(String(name === "edit" ? args?.newText ?? "" : args?.content ?? "")),
        ...(name === "edit" ? { removed: lineCount(String(args?.oldText ?? "")) } : {}),
      }],
    };
  }
  if (name === "apply_patch") return { ...base, changes: patchChanges(String(args?.patch ?? "")) };
  return base;
}

export function projectEntry(item: ProjectedEntry, _options: StreamOptions): ProjectedEntry {
  const entry = item.entry;
  if (entry.type !== "message") return item;
  const message = entry.message;
  if (message.role === "toolResult") {
    const redacted: RedactedEntry = {
      type: "redacted",
      redacted: true,
      originalBytes: encoder.encode(JSON.stringify(entry)).length,
      id: entry.id,
      parentId: entry.parentId,
      timestamp: entry.timestamp,
      role: "toolResult",
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      ...(["bash", "edit", "write"].includes(message.toolName) ? { isError: message.isError } : {}),
    };
    return { index: item.index, entry: redacted };
  }
  if (message.role === "bashExecution") {
    return {
      index: item.index,
      entry: {
        type: "redacted",
        redacted: true,
        originalBytes: encoder.encode(JSON.stringify(entry)).length,
        id: entry.id,
        parentId: entry.parentId,
        timestamp: entry.timestamp,
        role: "bashExecution",
        command: head(message.command, BASH_COMMAND_BYTES),
        isError: message.cancelled || (message.exitCode !== undefined && message.exitCode !== 0),
      },
    };
  }
  if (message.role !== "assistant") return item;
  return {
    index: item.index,
    entry: {
      ...entry,
      message: {
        ...message,
        content: message.content.map((block) =>
          block.type === "toolCall"
            ? redactedCall(block)
            : block
        ),
      },
    } as ProjectedAssistantEntry,
  };
}

export function projectTool(value: ToolProgress, options: StreamOptions, id?: string): ToolProgress {
  const output = id && options.expandedToolCalls?.includes(id) ? value.output : tail(value.output, options.toolOutputBytes);
  return { ...value, output, truncatedHead: value.totalBytes > encoder.encode(output).length,
    ...(value.command !== undefined ? { command: head(value.command, BASH_COMMAND_BYTES) } : {}) };
}

function projectLiveBlock(value: LiveBlock, options: StreamOptions): LiveBlock {
  return value.type === "toolCall"
    ? options.expandedToolCalls?.includes(value.id) ? value : redactedCall(value) as LiveBlock
    : value;
}

export function projectOp(op: SyncOp, options: StreamOptions): SyncOp {
  if (op.op === "append" && op.target === "entries") {
    return { ...op, items: op.items.map((item) => projectEntry(item, options)) };
  }
  if (op.op === "set" && op.target === "live") {
    return {
      ...op,
      value: op.value && {
        ...op.value,
        content: op.value.content.map((block) => projectLiveBlock(block, options)),
      },
    };
  }
  if (op.op === "set" && op.target === "live.content") {
    return { ...op, value: projectLiveBlock(op.value, options) };
  }
  if (op.op === "set" && op.target === "tool") {
    return { ...op, value: op.value && projectTool(op.value, options, op.key) };
  }
  return op;
}

export function projectOps(ops: SyncOp[], options: StreamOptions): SyncOp[] {
  return ops.map((op) => projectOp(op, options));
}

export function projectSnapshot(snapshot: SessionSnapshot, options: StreamOptions): SessionSnapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.map((item) => projectEntry(item, options)),
    live: snapshot.live && {
      ...snapshot.live,
      content: snapshot.live.content.map((block) => projectLiveBlock(block, options)),
    },
    tools: Object.fromEntries(
      Object.entries(snapshot.tools).map(([id, tool]) => [id, projectTool(tool, options, id)]),
    ),
  };
}

export function streamKey(options: StreamOptions): string {
  return JSON.stringify(options);
}

export function validStream(value: StreamOptions): boolean {
  return Number.isSafeInteger(value?.toolOutputBytes) && value.toolOutputBytes >= 0 &&
    (value.expandedToolCalls === undefined ||
      (Array.isArray(value.expandedToolCalls) && value.expandedToolCalls.length <= 32 &&
        value.expandedToolCalls.every(id => typeof id === "string" && id.length <= 256)));
}
