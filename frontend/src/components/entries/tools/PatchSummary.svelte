<script lang="ts">
  import type { RedactedToolCall } from "@pirc/api";
  import ToolPath from "./ToolPath.svelte";
  import ChangeCounts from "./ChangeCounts.svelte";
  let { changes }: { changes?: RedactedToolCall["changes"] } = $props();
</script>
<ul class="tool-preview patch-files">
  {#each changes ?? [] as change}
    <li><ToolPath path={change.path} /> <ChangeCounts added={change.added} removed={change.removed} /></li>
  {/each}
</ul>
<style>
  .patch-files { list-style: none; margin: 0; padding: 0; }
  li { overflow: hidden; text-overflow: ellipsis; }
</style>
