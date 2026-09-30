<script lang="ts">
  import ToolPath from "./ToolPath.svelte";
  let { paths }: { paths: string[] } = $props();
</script>
<span class="tool-preview">{#each paths as path, index}{#if index}, {/if}<ToolPath {path} />{/each}</span>
