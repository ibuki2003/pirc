import type { Message } from "./pi.ts";
import type { ToolProgress } from "./model.ts";

type ToolResult = Extract<Message, { role: "toolResult" }>;
export interface ToolObject {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  callEntryId?: string;
  content: ToolResult["content"];
  progress?: Omit<ToolProgress, "output">;
  result?: {
    index: number;
    id: string;
    parentId: string | null;
    timestamp: string;
    message: Omit<ToolResult, "content">;
  };
}
export type ObjectChange =
  | { op: "set"; path: (string | number)[]; value: unknown }
  | { op: "delete"; path: (string | number)[] }
  | { op: "array"; path: (string | number)[]; index: number; deleteCount: number; values: unknown[] }
  | { op: "splice"; path: (string | number)[]; start: number; deleteCount: number; text: string };
export type ToolObjectEvent =
  | { type: "snapshot"; revision: number; value: ToolObject }
  | { type: "patch"; from: number; revision: number; changes: ObjectChange[] }
  | { type: "end"; revision: number; entryId: string }
  | { type: "unavailable" };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Text splices preserve already-delivered prefixes, including strings nested in tool arguments.
export function objectChanges(before: unknown, after: unknown, path: (string | number)[] = []): ObjectChange[] {
  if (before === after) return [];
  if (typeof before === "string" && typeof after === "string") {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = 0;
    while (end < before.length - start && end < after.length - start &&
      before[before.length - end - 1] === after[after.length - end - 1]) end++;
    return [{ op: "splice", path, start, deleteCount: before.length - start - end,
      text: after.slice(start, after.length - end) }];
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.min(before.length, after.length);
    const changes = after.slice(0, length).flatMap((value, index) => objectChanges(before[index], value, [...path, index]));
    if (before.length !== after.length) changes.push({
      op: "array", path, index: length, deleteCount: before.length - length, values: after.slice(length),
    });
    return changes;
  }
  if (record(before) && record(after)) {
    const changes: ObjectChange[] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (after[key] === undefined) {
        if (before[key] !== undefined) changes.push({ op: "delete", path: [...path, key] });
      } else changes.push(...objectChanges(before[key], after[key], [...path, key]));
    }
    return changes;
  }
  return [{ op: "set", path, value: after }];
}

export function applyObjectChanges<T>(before: T, changes: ObjectChange[]): T {
  let value: unknown = structuredClone(before);
  for (const change of changes) {
    if (change.path.some(key => key === "__proto__" || key === "constructor" || key === "prototype")) {
      throw new Error("Invalid object path");
    }
    if (!change.path.length) {
      if (change.op === "set") value = structuredClone(change.value);
      else if (change.op === "array" && Array.isArray(value)) {
        value.splice(change.index, change.deleteCount, ...structuredClone(change.values));
      } else throw new Error("Invalid root change");
      continue;
    }
    let parent = value as Record<string | number, unknown>;
    for (const key of change.path.slice(0, -1)) {
      if (!parent || typeof parent !== "object") throw new Error("Missing object path");
      parent = parent[key] as typeof parent;
    }
    const key = change.path.at(-1)!;
    if (change.op === "set") parent[key] = structuredClone(change.value);
    else if (change.op === "delete") delete parent[key];
    else if (change.op === "array") {
      const array = parent[key];
      if (!Array.isArray(array) || change.index < 0 || change.deleteCount < 0 ||
        change.index + change.deleteCount > array.length) throw new Error("Invalid array splice");
      array.splice(change.index, change.deleteCount, ...structuredClone(change.values));
    } else {
      const text = parent[key];
      if (typeof text !== "string" || change.start < 0 || change.deleteCount < 0 ||
        change.start + change.deleteCount > text.length) throw new Error("Invalid text splice");
      parent[key] = text.slice(0, change.start) + change.text + text.slice(change.start + change.deleteCount);
    }
  }
  return value as T;
}
