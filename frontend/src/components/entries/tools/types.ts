import type { Snippet } from "svelte";
import type { ProjectedEntry, RedactedToolCall, ToolProgress } from "@pirc/api";
import type { CachedToolObject } from "../../../lib/mirror/mirror-store.svelte.ts";

export const toolExpansionContext = Symbol("toolExpansion");
export interface ToolExpansion {
  ids: Set<string>;
  objects: Map<string, CachedToolObject>;
  canStreamTool: (id: string) => boolean;
}
export interface ToolDisplayCall {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  changes?: RedactedToolCall["changes"];
  results: ProjectedEntry[];
  progress?: ToolProgress;
  durationMs?: number;
}
export interface ToolDisplay {
  calls: ToolDisplayCall[];
  failed: boolean;
  bytes?: number;
  error?: string;
}
export interface ToolViewProps {
  calls: ToolDisplayCall[];
  changes: (RedactedToolCall["changes"] | undefined)[];
  failed: boolean;
  toggle: (open: boolean) => void;
  open: boolean;
  status: Snippet;
  output: Snippet<[number]>;
  error: Snippet;
}
