<script lang="ts">
  import type { RedactedToolCall } from "@pirc/api";
  let { changes }: { changes?: RedactedToolCall["changes"] } = $props();
  function counts(change: NonNullable<RedactedToolCall["changes"]>[number]): string {
    const values = [
      change.added === undefined ? "" : `+${change.added}`,
      change.removed === undefined ? "" : `-${change.removed}`,
    ].filter(Boolean).join(" ");
    return values ? ` (${values})` : "";
  }
</script>
<span class="tool-preview">
  {#each changes ?? [] as change, index}
    {#if index}, {/if}{change.path}{counts(change)}
  {/each}
</span>
