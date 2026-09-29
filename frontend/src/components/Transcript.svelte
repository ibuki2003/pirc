<script lang="ts">
  import type { ProjectedEntry } from "@pirc/api";
  import EntryView from "./entries/EntryView.svelte";
  let { entries, instanceId, expand, loadMore, hasMore }: {
    entries: ProjectedEntry[]; instanceId: string; expand: (id: string) => Promise<void>;
    loadMore: () => Promise<void>; hasMore: boolean
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
        previousWasSettings = false;
        if (!(entry.type === "redacted" && entry.role === "toolResult") &&
            !(entry.type === "message" && entry.message.role === "toolResult")) rows.push({ kind: "entry", item });
      }
    }
    return rows;
  });
</script>
<div class="transcript">
  {#if hasMore}<button disabled={loading} onclick={older}>古い履歴を読み込む</button>{/if}
  {#each rows as row (row.kind === "entry" ? row.item.entry.id : row.id)}
    {#if row.kind === "settings"}
      <small class="muted-meta settings-change">
        {#if row.model && row.thinking}{row.model} {row.thinking}
        {:else if row.model}model: {row.model}
        {:else}thinking: {row.thinking}{/if}
      </small>
    {:else}
      <EntryView item={row.item} results={entries} {instanceId} {expand} />
    {/if}
  {/each}
</div>
