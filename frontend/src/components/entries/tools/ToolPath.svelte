<script lang="ts">
  let { path }: { path: string } = $props();
  const basenameAt = $derived(path.lastIndexOf("/") + 1);
</script>
<span class="tool-path"><span class="directory">{path.slice(0, basenameAt)}</span>{path.slice(basenameAt)}</span>
<style>
  .tool-path { font-family: monospace; }
  .directory {
    color: #667085;
    @media (prefers-color-scheme: dark) { color: #aab5c5; }
  }
</style>
