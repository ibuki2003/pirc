<script lang="ts">
  import "./Transcript.scss";
  import type { LiveMessage, ProjectedEntry, ToolProgress } from "@pirc/api";
  import EntryView from "./entries/EntryView.svelte";
  import LiveMessageView from "./LiveMessage.svelte";
  let { entries, instanceId, expand, loadMore, hasMore, live, tools, toolDurations, streaming }: {
    entries: ProjectedEntry[]; instanceId: string; expand: (id: string) => Promise<void>;
    loadMore: () => Promise<void>; hasMore: boolean;
    live: LiveMessage | null; tools: Map<string, ToolProgress>; streaming: boolean;
    toolDurations: Map<string, number>;
  } = $props();
  let loading = $state(false);
  async function older() { loading = true; try { await loadMore(); } finally { loading = false; } }
  let rows = $derived.by(() => {
    const rows: ({ kind: "entry"; item: ProjectedEntry } | { kind: "settings"; id: string; model?: string; thinking?: string })[] = [];
    let previousWasSettings = false;
    for (const item of entries) {
      const entry = item.entry;
      if (entry.type === "model_change" || entry.type === "thinking_level_change") {
        const last = rows.at(-1);
        const row = previousWasSettings && last?.kind === "settings" ? last : { kind: "settings" as const, id: entry.id, model: undefined as string | undefined, thinking: undefined as string | undefined };
        if (last !== row) rows.push(row);
        if (entry.type === "model_change") row.model = `${entry.provider}/${entry.modelId}`;
        else row.thinking = entry.thinkingLevel;
        previousWasSettings = true;
      } else {
        if (entry.type === "redacted" ? entry.role !== "bashExecution"
          : entry.type === "message" ? entry.message.role === "toolResult"
          : entry.type === "custom_message" ? !entry.display
          : !["compaction", "branch_summary", "session_info", "label"].includes(entry.type)) continue;
        previousWasSettings = false;
        rows.push({ kind: "entry", item });
      }
    }
    return rows;
  });
  function roleOf(row: (typeof rows)[number] | undefined): string | undefined {
    if (row?.kind !== "entry") return undefined;
    const entry = row.item.entry;
    return entry.type === "message" ? entry.message.role : undefined;
  }
  const visibleToolCalls = $derived(new Set(rows.flatMap(row => {
    if (row.kind !== "entry" || row.item.entry.type !== "message" || row.item.entry.message.role !== "assistant") return [];
    return row.item.entry.message.content.flatMap(block => block.type === "toolCall" ? [block.id] : []);
  })));
</script>
<div class="transcript">
  {#if hasMore}<button disabled={loading} onclick={older}>古い履歴を読み込む</button>{/if}
  {#each rows as row, index (row.kind === "entry" ? row.item.entry.id : row.id)}
    {#if row.kind === "settings"}
      <small class="muted-meta settings-change">
        {#if row.model && row.thinking}{row.model} {row.thinking}
        {:else if row.model}model: {row.model}
        {:else}thinking: {row.thinking}{/if}
      </small>
    {:else}
      <EntryView item={row.item} results={entries} {instanceId} {expand} {tools} {toolDurations}
        showHeader={roleOf(row) === undefined || roleOf(row) !== roleOf(rows[index - 1])} />
    {/if}
  {/each}
  <LiveMessageView {live} {tools} {visibleToolCalls} {instanceId} showHeader={roleOf(rows.at(-1)) !== "assistant"} />
  {#if streaming}
    <div class="streaming-dots" role="status" aria-label="生成中">
      <span></span><span></span><span></span>
    </div>
  {/if}
</div>
