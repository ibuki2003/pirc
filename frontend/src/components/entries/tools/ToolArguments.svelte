<script lang="ts">
  let { args }: { args: unknown } = $props();
</script>
{#if args !== null && typeof args === "object" && !Array.isArray(args)}
  <div class="tool-arguments">
    {#each Object.entries(args) as [key, value] (key)}
      <span class="tool-argument-key">{key}</span>
      <pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    {/each}
  </div>
{:else if args !== undefined}
  <pre>{JSON.stringify(args, null, 2)}</pre>
{/if}
