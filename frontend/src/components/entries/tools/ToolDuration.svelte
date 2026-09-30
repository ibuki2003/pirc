<script lang="ts">
  let { startedAt, durationMs }: { startedAt?: number; durationMs?: number } = $props();
  let now = $state(Date.now());
  $effect(() => {
    if (startedAt === undefined) return;
    now = Date.now();
    const timer = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(timer);
  });
  const elapsed = $derived(startedAt === undefined ? durationMs : Math.max(0, now - startedAt));
</script>
{#if elapsed !== undefined}
  <span class="tool-size" title={startedAt === undefined ? "所要時間" : "経過時間"}>{(elapsed / 1000).toFixed(startedAt === undefined ? 1 : 0)}s</span>
{/if}
