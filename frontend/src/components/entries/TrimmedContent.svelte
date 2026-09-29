<script lang="ts">
  import type { Snippet } from "svelte";
  let { onexpand, bytes, children }: { onexpand: () => Promise<void>; bytes: number; children: Snippet } = $props();
  let busy = $state(false);
  let error = $state("");
  async function expand(event: Event) {
    if (!(event.currentTarget as HTMLDetailsElement).open || busy) return;
    busy = true;
    try { await onexpand(); } catch (e) { error = String(e); } finally { busy = false; }
  }
</script>
<details ontoggle={expand}>
  <summary>全文を表示 ({bytes} bytes){busy ? " 読み込み中…" : ""}</summary>
  {@render children()}
</details>
{#if error}<small role="alert">{error}</small>{/if}
