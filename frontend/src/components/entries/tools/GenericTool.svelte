<script lang="ts">
  import ToolArguments from "./ToolArguments.svelte";
  import type { ToolViewProps } from "./types";
  let { calls, failed, open, toggle, status, output, error }: ToolViewProps = $props();
</script>
<details class="tool" class:tool-error={failed} {open} ontoggle={e => toggle(e.currentTarget.open)}>
  <summary><span class="tool-name tool-preview">{calls[0].name}</span>{@render status()}</summary>
  {#each calls as call, i (call.id)}
    <ToolArguments args={call.arguments} />
    {@render output(i)}
  {/each}
  {@render error()}
</details>
