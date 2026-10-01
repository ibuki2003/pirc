<script lang="ts">
  import ToolBashSummary from "./BashSummary.svelte";
  import ToolArguments from "./ToolArguments.svelte";
  import ToolDuration from "./ToolDuration.svelte";
  import type { ToolViewProps } from "./types";
  let { calls, failed, toggle, status, output, error }: ToolViewProps = $props();
</script>
<details class="tool" class:tool-error={failed} ontoggle={e => toggle(e.currentTarget.open)}>
  <summary><ToolBashSummary command={String(calls[0].arguments?.command ?? "")} /><ToolDuration startedAt={calls[0].progress?.startedAt} durationMs={calls[0].durationMs} />{@render status()}</summary>
  {#each calls as call, i (call.id)}
    <ToolArguments args={call.arguments} />
    {@render output(i)}
  {/each}
  {@render error()}
</details>
