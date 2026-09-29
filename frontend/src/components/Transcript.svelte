<script lang="ts">
  import type { ProjectedEntry } from "@pirc/api";
  import EntryView from "./entries/EntryView.svelte";
  let { entries, instanceId, expand, loadMore, hasMore }: {
    entries: ProjectedEntry[]; instanceId: string; expand: (id: string) => Promise<void>;
    loadMore: () => Promise<void>; hasMore: boolean
  } = $props();
  let loading = $state(false);
  async function older() { loading = true; try { await loadMore(); } finally { loading = false; } }
</script>
<div class="transcript">
  {#if hasMore}<button disabled={loading} onclick={older}>古い履歴を読み込む</button>{/if}
  {#each entries as item (item.entry.id)}
    {#if !(item.entry.type === "message" && item.entry.message.role === "toolResult")}
      <EntryView {item} results={entries} {instanceId} {expand} />
    {/if}
  {/each}
</div>
