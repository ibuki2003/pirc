<script lang="ts">
  import type { ProjectedAssistantEntry, ProjectedEntry, RedactedToolCall } from "@pirc/api";
  import ToolBashSummary from "./ToolBashSummary.svelte";
  import ToolCallContent from "./ToolCallContent.svelte";
  import ToolEditSummary from "./ToolEditSummary.svelte";
  import ToolPatchSummary from "./ToolPatchSummary.svelte";
  import ToolReadSummary from "./ToolReadSummary.svelte";
  import ToolWriteSummary from "./ToolWriteSummary.svelte";

  type Call = Extract<ProjectedAssistantEntry["message"]["content"][number], { type: "toolCall" }>;
  let { calls, results, instanceId, entryId, expand }: {
    calls: Call[];
    results: ProjectedEntry[];
    instanceId: string;
    entryId: string;
    expand: (id: string) => Promise<void>;
  } = $props();
  let error = $state("");
  // Full-entry retrieval replaces the projected call; retain its server-computed summary.
  let projectedChanges = $state<(RedactedToolCall["changes"] | undefined)[]>([]);
  $effect(() => {
    const changes = calls.map(call => "changes" in call ? call.changes : undefined);
    if (changes.some(Boolean)) projectedChanges = changes;
  });
  const name = $derived(calls[0].name);
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
  const size = (value: number) => value >= 1024 ? `${Math.round(value / 1024)}K` : `${value}B`;
  async function load(id: string) {
    try { await expand(id); } catch (e) { error = String(e); }
  }
  function open() {
    if (calls.some(call => "redacted" in call && call.redacted && call.name !== "read")) void load(entryId);
    for (const result of toolResults.flat()) if (result.entry.type === "redacted") void load(result.entry.id);
  }
</script>
<details class="tool" class:tool-error={failed} ontoggle={e => { if (e.currentTarget.open) open(); }}>
  <summary>
    {#if name !== "bash"}<span class="tool-name">{name}</span>{/if}
    {#if name === "read"}
      <ToolReadSummary paths={calls.map(call => String(call.arguments?.path ?? ""))} />
    {:else if name === "edit"}
      <ToolEditSummary path={String(calls[0].arguments?.path ?? "")}
        change={("changes" in calls[0] ? calls[0].changes : projectedChanges[0])?.[0]} />
    {:else if name === "write"}
      <ToolWriteSummary path={String(calls[0].arguments?.path ?? "")}
        change={("changes" in calls[0] ? calls[0].changes : projectedChanges[0])?.[0]} />
    {:else if name === "apply_patch"}
      <ToolPatchSummary changes={"changes" in calls[0] ? calls[0].changes : projectedChanges[0]} />
    {:else if name === "bash"}
      <ToolBashSummary command={String(calls[0].arguments?.command ?? "")} />
    {/if}
    {#if showSize && bytes}<span class="tool-size">({size(bytes)})</span>{/if}
  </summary>
  {#each calls as call, i (call.id)}
    <ToolCallContent {call} results={toolResults[i]} {instanceId} />
  {/each}
  {#if error}<small role="alert">{error}</small>{/if}
</details>
