<script lang="ts">
  import type { ProjectedAssistantEntry, ProjectedEntry, RedactedToolCall, ToolProgress } from "@pirc/api";
  import ToolCallView from "./ToolCallView.svelte";
  import type { ToolDisplay } from "./types";
  import { getContext } from "svelte";
  import { toolExpansionContext, type ToolExpansion } from "./types";

  type Call = Extract<ProjectedAssistantEntry["message"]["content"][number], { type: "toolCall" }>;
  let { calls, results, instanceId, entryId, expand, subscribeTool = () => {}, tools, toolDurations }: {
    calls: Call[];
    results: ProjectedEntry[];
    instanceId: string;
    entryId: string;
    expand: (id: string) => Promise<void>;
    subscribeTool?: (ids: string[], expanded: boolean) => void;
    tools: Map<string, ToolProgress>;
    toolDurations: Map<string, number>;
  } = $props();
  let error = $state("");
  const details = getContext<ToolExpansion | undefined>(toolExpansionContext);
  const pending = new Set<string>();
  // Full-entry retrieval replaces the projected call; retain its server-computed summary.
  let projectedChanges = $state<(RedactedToolCall["changes"] | undefined)[]>([]);
  $effect(() => {
    const changes = calls.map(call => "changes" in call ? call.changes : undefined);
    if (changes.some(Boolean)) projectedChanges = changes;
  });
  const toolResults = $derived(calls.map(call => results.filter(result =>
    (result.entry.type === "redacted" && result.entry.role === "toolResult" && result.entry.toolCallId === call.id) ||
    (result.entry.type === "message" && result.entry.message.role === "toolResult" && result.entry.message.toolCallId === call.id))));
  const bytes = $derived(calls.reduce((sum, call) => sum + ("redacted" in call ? call.originalBytes : 0), 0) +
    toolResults.flat().reduce((sum, result) => sum + (result.entry.type === "redacted" ? result.entry.originalBytes : 0), 0));
  const showSize = $derived(calls.every(call => "redacted" in call && call.redacted) &&
    toolResults.flat().every(result => result.entry.type === "redacted"));
  const failed = $derived(toolResults.flat().some(result =>
    result.entry.type === "redacted" ? result.entry.isError === true
      : result.entry.type === "message" && result.entry.message.role === "toolResult" && result.entry.message.isError));
  const display: ToolDisplay = $derived({
    calls: calls.map((call, i) => ({
      id: call.id, name: call.name, arguments: call.arguments,
      changes: "changes" in call ? call.changes : projectedChanges[i],
      results: toolResults[i], progress: tools.get(call.id),
      durationMs: toolDurations.get(call.id),
    })),
    failed, bytes: showSize ? bytes : undefined, error,
  });
  async function load(id: string) {
    if (pending.has(id)) return;
    pending.add(id);
    try { await expand(id); } catch (e) { error = String(e); }
    finally { pending.delete(id); }
  }
  function open() {
    for (const [index, call] of calls.entries()) {
      const object = details?.objects.get(call.id);
      if (object?.complete || details?.canStreamTool(call.id)) continue;
      if ("redacted" in call && call.redacted && call.name !== "read") void load(entryId);
      for (const result of toolResults[index]) if (result.entry.type === "redacted") void load(result.entry.id);
    }
  }
</script>
<ToolCallView {display} {instanceId} onopen={open} {subscribeTool} />
