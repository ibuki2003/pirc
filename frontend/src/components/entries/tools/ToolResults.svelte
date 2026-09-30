<script lang="ts">
  import type { ProjectedEntry } from "@pirc/api";
  import BlobImage from "../BlobImage.svelte";

  let { results, instanceId }: {
    results: ProjectedEntry[];
    instanceId: string;
  } = $props();
</script>
{#each results as result (result.entry.id)}
  {#if result.entry.type === "redacted"}
    {#if result.entry.isError}<small class="muted-meta">エラー</small>{/if}
  {:else if result.entry.type === "message" && result.entry.message.role === "toolResult"}
    {#each result.entry.message.content as output, j}
      {#if output.type === "text"}<pre>{output.text}</pre>
      {:else if output.type === "image"}<BlobImage {instanceId} entryId={result.entry.id} path={["message", "content", j, "data"]} />{/if}
    {/each}
  {/if}
{/each}
