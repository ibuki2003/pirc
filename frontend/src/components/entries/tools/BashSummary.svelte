<script lang="ts">
  let { command }: { command: string } = $props();
</script>
<span class="tool-preview">{command}</span>
<style>
  .tool-preview { font-family: monospace; }
</style>
