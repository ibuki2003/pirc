<script lang="ts">
  let { added, removed }: { added?: number; removed?: number } = $props();
</script>
{#if added !== undefined || removed !== undefined}
  <span class="change-counts">({#if added !== undefined}<span class="added">+{added}</span>{/if}{#if added !== undefined && removed !== undefined}{" "}{/if}{#if removed !== undefined}<span class="removed">-{removed}</span>{/if})</span>
{/if}
<style>
  .change-counts { white-space: nowrap; }
  .added { color: #16723a; }
  .removed { color: #b42332; }
  @media (prefers-color-scheme: dark) {
    .added { color: #7cdda0; }
    .removed { color: #ff9ca6; }
  }
</style>
