<script lang="ts">
  import ToolWriteSummary from "./WriteSummary.svelte";
  import type { ToolViewProps } from "./types";
  let { calls, changes, failed, open, status, output, error }: ToolViewProps = $props();
</script>
<details class="tool" class:tool-error={failed} ontoggle={e => { if (e.currentTarget.open) open(); }}>
  <summary><span class="tool-name">write</span><ToolWriteSummary path={String(calls[0].arguments?.path ?? "")} change={changes[0]?.[0]} />{@render status()}</summary>
  {#each calls as call, i (call.id)}
    <h6>{String(call.arguments?.path ?? "")}</h6>
    {#if typeof call.arguments?.content === "string"}<pre>{call.arguments.content}</pre>{/if}
    {@render output(i)}
  {/each}
  {@render error()}
</details>
