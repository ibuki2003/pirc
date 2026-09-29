<script lang="ts">
  let { onexpand, bytes }: { onexpand: () => Promise<void>; bytes: number } = $props();
  let busy = $state(false);
  let error = $state("");
  async function expand() {
    busy = true;
    try { await onexpand(); } catch (e) { error = String(e); } finally { busy = false; }
  }
</script>
<button disabled={busy} onclick={expand}>全文を表示 ({bytes} bytes)</button>
{#if error}<small role="alert">{error}</small>{/if}
