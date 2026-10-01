import type { Snippet } from "svelte";
import type { ProjectedEntry, RedactedToolCall, ToolProgress } from "@pirc/api";

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
  status: Snippet;
  output: Snippet<[number]>;
  error: Snippet;
}
