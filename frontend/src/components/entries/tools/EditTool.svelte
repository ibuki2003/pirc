<script lang="ts">
  import ToolEditSummary from "./EditSummary.svelte";
  import ToolPath from "./ToolPath.svelte";
  import type { ToolViewProps } from "./types";
  let { calls, changes, failed, toggle, status, output, error }: ToolViewProps = $props();
</script>
<details class="tool" class:tool-error={failed} ontoggle={e => toggle(e.currentTarget.open)}>
  <summary><span class="tool-name">edit</span><ToolEditSummary path={String(calls[0].arguments?.path ?? "")} change={changes[0]?.[0]} />{@render status()}</summary>
  {#each calls as call, i (call.id)}
    <h6><ToolPath path={String(call.arguments?.path ?? "")} /></h6>
    {#if typeof call.arguments?.oldText === "string"}<small class="muted-meta">変更前</small><pre>{call.arguments.oldText}</pre>{/if}
    {#if typeof call.arguments?.newText === "string"}<small class="muted-meta">変更後</small><pre>{call.arguments.newText}</pre>{/if}
    {@render output(i)}
  {/each}
  {@render error()}
</details>
