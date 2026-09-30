<script lang="ts">
  import ToolArguments from "./ToolArguments.svelte";
  import type { ToolViewProps } from "./types";
  let { calls, failed, open, status, output, error }: ToolViewProps = $props();
</script>
<details class="tool" class:tool-error={failed} ontoggle={e => { if (e.currentTarget.open) open(); }}>
  <summary><span class="tool-name">{calls[0].name}</span>{@render status()}</summary>
  {#each calls as call, i (call.id)}
    <ToolArguments args={call.arguments} />
    {@render output(i)}
  {/each}
  {@render error()}
</details>
