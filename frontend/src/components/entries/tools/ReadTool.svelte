<script lang="ts">
  import ToolReadSummary from "./ReadSummary.svelte";
  import ToolPath from "./ToolPath.svelte";
  import type { ToolViewProps } from "./types";
  let { calls, failed, open, toggle, status, output, error }: ToolViewProps = $props();
</script>
<details class="tool" class:tool-error={failed} {open} ontoggle={e => toggle(e.currentTarget.open)}>
  <summary><span class="tool-name">read</span><ToolReadSummary paths={calls.map(call => String(call.arguments?.path ?? ""))} />{@render status()}</summary>
  {#each calls as call, i (call.id)}
    <h6><ToolPath path={String(call.arguments?.path ?? "")} /></h6>
    {#if call.arguments?.offset !== undefined || call.arguments?.limit !== undefined}
      <small class="muted-meta">{#if call.arguments.offset !== undefined}offset {String(call.arguments.offset)}{/if}{#if call.arguments.limit !== undefined} limit {String(call.arguments.limit)}{/if}</small>
    {/if}
    {@render output(i)}
  {/each}
  {@render error()}
</details>
