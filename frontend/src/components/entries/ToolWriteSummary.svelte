<script lang="ts">
  import type { RedactedToolCall } from "@pirc/api";
  let { path, change }: { path: string; change?: NonNullable<RedactedToolCall["changes"]>[number] } = $props();
</script>
<span class="tool-preview">{path}{#if change} (+{change.added ?? 0}){/if}</span>
