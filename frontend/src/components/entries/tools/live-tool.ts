import type { LiveBlock, ToolProgress } from "@pirc/api";
import type { ToolDisplay } from "./types";

export function liveToolDisplay(
  id: string,
  call: Extract<LiveBlock, { type: "toolCall" }> | null,
  progress?: ToolProgress,
): ToolDisplay {
  return {
    calls: [{
      id,
      name: call?.name ?? progress?.toolName ?? "",
      arguments: call?.arguments ?? (progress?.command === undefined ? undefined : { command: progress.command }),
      changes: call?.changes,
      results: [],
      progress,
    }],
    failed: false,
  };
}
