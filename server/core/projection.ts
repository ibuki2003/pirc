import {
  FULL_STREAM,
  type LiveBlock,
  type ProjectedEntry,
  type SessionSnapshot,
  type StreamOptions,
  type SyncOp,
  type ToolProgress,
  type Trim,
} from "@pirc/api";

const encoder = new TextEncoder();
const size = (text: string) => encoder.encode(text).length;
function cut(text: string, limit: number, tail = false): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return text;
  const part = tail
    ? bytes.subarray(bytes.length - limit)
    : bytes.subarray(0, limit);
  return new TextDecoder("utf-8", { fatal: false }).decode(part).replace(
    /^\uFFFD|\uFFFD$/g,
    "",
  );
}
function projectValue(
  value: unknown,
  options: StreamOptions,
  trims: Trim[],
  path: (string | number)[],
  mode: "text" | "json" | "thinking" | "tail",
): unknown {
  if (typeof value === "string") {
    const limit = mode === "thinking" && !options.thinking
      ? 0
      : options.maxTextBytes;
    if (size(value) <= limit) return value;
    trims.push({
      path,
      kind: mode === "json" ? "json" : "text",
      originalBytes: size(value),
    });
    return cut(value, limit, mode === "tail");
  }
  if (Array.isArray(value)) {
    return value.map((item, i) =>
      projectValue(item, options, trims, [...path, i], mode)
    );
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = projectValue(item, options, trims, [...path, key], mode);
    }
    return result;
  }
  return value;
}
function projectContent(
  content: unknown,
  options: StreamOptions,
  trims: Trim[],
  path: (string | number)[],
  trimText = false,
): unknown {
  if (!Array.isArray(content)) return content;
  return content.map((block, i) => {
    if (!block || typeof block !== "object") return block;
    const b = block as Record<string, unknown>;
    const p = [...path, i];
    if (b.type === "image" && typeof b.data === "string") {
      trims.push({
        path: [...p, "data"],
        kind: "image",
        originalBytes: Math.floor(b.data.length * 3 / 4),
        mimeType: String(b.mimeType),
      });
      return { ...b, data: "" };
    }
    if (b.type === "thinking") {
      return {
        ...b,
        thinking: projectValue(
          b.thinking,
          options,
          trims,
          [...p, "thinking"],
          "thinking",
        ),
      };
    }
    if (b.type === "text") {
      return trimText
        ? {
          ...b,
          text: projectValue(b.text, options, trims, [...p, "text"], "text"),
        }
        : b;
    }
    if (b.type === "toolCall") {
      return {
        ...b,
        arguments: projectValue(b.arguments, options, trims, [
          ...p,
          "arguments",
        ], "json"),
      };
    }
    return b;
  });
}
export function projectEntry(
  item: ProjectedEntry,
  options: StreamOptions,
): ProjectedEntry {
  const entry = item.entry;
  const trims: Trim[] = [];
  const data = { ...entry } as Record<string, unknown>;
  if (entry.type === "message") {
    const message = { ...entry.message } as Record<string, unknown>;
    const role = message.role;
    if (role === "toolResult") {
      message.content = projectContent(message.content, options, trims, [
        "message",
        "content",
      ], true);
    } else if (role === "assistant" || role === "user") {
      message.content = projectContent(message.content, options, trims, [
        "message",
        "content",
      ]);
    } else if (role === "bashExecution") {
      message.output = projectValue(message.output, options, trims, [
        "message",
        "output",
      ], "tail");
    } else {message.content = projectContent(message.content, options, trims, [
        "message",
        "content",
      ]);}
    data.message = message;
  } else if (entry.type === "custom_message") {
    data.content = typeof entry.content === "string"
      ? projectValue(entry.content, options, trims, ["content"], "text")
      : projectContent(entry.content, options, trims, ["content"], true);
    data.details = projectValue(
      entry.details,
      options,
      trims,
      ["details"],
      "json",
    );
  } else if (entry.type === "custom") {
    data.data = projectValue(entry.data, options, trims, ["data"], "json");
  }
  return {
    index: item.index,
    entry: data as unknown as typeof entry,
    ...(trims.length ? { trims } : {}),
  };
}
export function projectTool(
  value: ToolProgress,
  options: StreamOptions,
): ToolProgress {
  return { ...value, output: cut(value.output, options.toolOutputBytes, true) };
}
function projectLiveBlock(value: LiveBlock, options: StreamOptions): LiveBlock {
  if (value.type === "thinking") {
    const trims: Trim[] = [];
    const thinking = projectValue(
      value.thinking,
      options,
      trims,
      ["thinking"],
      "thinking",
    ) as string;
    return { ...value, thinking, ...(trims.length ? { trims } : {}) };
  }
  if (value.type === "toolCall" && value.arguments) {
    const trims: Trim[] = [];
    const args = projectValue(
      value.arguments,
      options,
      trims,
      ["arguments"],
      "json",
    ) as Record<string, unknown>;
    return { ...value, arguments: args, ...(trims.length ? { trims } : {}) };
  }
  return value;
}
export function projectOp(op: SyncOp, options: StreamOptions): SyncOp | null {
  if (op.op === "append" && op.target === "entries") {
    return {
      ...op,
      items: op.items.map((item) => projectEntry(item, options)),
    };
  }
  if (op.op === "set" && op.target === "live") {
    return {
      ...op,
      value: op.value && {
        ...op.value,
        content: op.value.content.map((b) => projectLiveBlock(b, options)),
      },
    };
  }
  if (op.op === "set" && op.target === "live.content") {
    if (!options.thinking && op.value.type === "thinking") return null;
    return { ...op, value: projectLiveBlock(op.value, options) };
  }
  if (op.op === "set" && op.target === "tool") {
    return { ...op, value: op.value && projectTool(op.value, options) };
  }
  return op;
}
export function projectOps(
  ops: SyncOp[],
  options: StreamOptions,
  types: string[] = [],
): SyncOp[] {
  // Track block types within the batch, including a freshly started live message.
  return ops.flatMap((op) => {
    if (op.op === "set" && op.target === "live") {
      types = op.value?.content.map((b) => b.type) ?? [];
    }
    if (op.op === "set" && op.target === "live.content") {
      types[op.index] = op.value.type;
    }
    if (
      op.op === "append" && op.target === "live.content" && !options.thinking &&
      types[op.index] === "thinking"
    ) return [];
    const result = projectOp(op, options);
    return result ? [result] : [];
  });
}
export function projectSnapshot(
  snapshot: SessionSnapshot,
  options: StreamOptions,
): SessionSnapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.map((item) => projectEntry(item, options)),
    live: snapshot.live &&
      {
        ...snapshot.live,
        content: snapshot.live.content.map((b) => projectLiveBlock(b, options)),
      },
    tools: Object.fromEntries(
      Object.entries(snapshot.tools).map((
        [id, tool],
      ) => [id, projectTool(tool, options)]),
    ),
  };
}
export function streamKey(options: StreamOptions): string {
  return JSON.stringify(options);
}
export function validStream(value: StreamOptions): boolean {
  return typeof value?.thinking === "boolean" &&
    [value.maxTextBytes, value.toolOutputBytes].every((n) =>
      Number.isSafeInteger(n) && n >= 0
    );
}
export { FULL_STREAM };
