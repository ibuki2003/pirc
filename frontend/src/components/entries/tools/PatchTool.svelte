<script lang="ts">
  import ToolPatchSummary from "./PatchSummary.svelte";
  import PatchDiff from "./PatchDiff.svelte";
  import type { ToolViewProps } from "./types";
  let { calls, changes, failed, toggle, status, output, error }: ToolViewProps = $props();
</script>
<details class="tool" class:tool-error={failed} ontoggle={e => toggle(e.currentTarget.open)}>
  <summary><span class="tool-name">apply_patch</span><ToolPatchSummary changes={changes[0]} />{@render status()}</summary>
  {#each calls as call, i (call.id)}
    {#if typeof call.arguments?.patch === "string"}<PatchDiff patch={call.arguments.patch} />{/if}
    {@render output(i)}
  {/each}
  {@render error()}
</details>
