<script lang="ts">
  import type { RedactedToolCall } from "@pirc/api";
  import ToolPath from "./ToolPath.svelte";
  import ChangeCounts from "./ChangeCounts.svelte";
  let { path, change }: { path: string; change?: NonNullable<RedactedToolCall["changes"]>[number] } = $props();
</script>
<span class="tool-preview"><ToolPath {path} />{#if change} <ChangeCounts added={change.added ?? 0} removed={change.removed} />{/if}</span>
