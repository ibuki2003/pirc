<script lang="ts">
  let { paths }: { paths: string[] } = $props();
</script>
<span class="tool-preview">{paths.join(", ")}</span>
