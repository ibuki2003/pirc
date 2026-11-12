import type { ProjectedEntry } from "@pirc/api";

export interface DisplayOptions {
  tools: boolean;
  thinking: boolean;
  system: boolean;
}

export const defaultDisplayOptions: Readonly<DisplayOptions> = { tools: true, thinking: true, system: true };

export function showEntry(item: ProjectedEntry, options: DisplayOptions): boolean {
  const entry = item.entry;
  if (entry.type === "redacted") return entry.role === "bashExecution" && options.tools;
  if (entry.type !== "message") return options.system;
  const message = entry.message;
  if (message.role === "toolResult") return false;
  if (message.role === "bashExecution") return options.tools;
  if (message.role === "system" && !options.system) return false;
  if (!("content" in message) || typeof message.content === "string") return true;
  return !message.content.length || message.content.some(block =>
    block.type === "thinking" ? options.thinking :
    block.type === "toolCall" ? options.tools : true);
}
