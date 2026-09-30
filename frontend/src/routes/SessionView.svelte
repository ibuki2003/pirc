<script lang="ts">
  import SessionPane from "../components/SessionPane.svelte";
  import ConnectionBanner from "../components/ConnectionBanner.svelte";
  let { instanceId }: { instanceId: string } = $props();
</script>
<div class="session-view">
  <ConnectionBanner />
  <SessionPane {instanceId} onswitch={id => location.hash = `#/s/${encodeURIComponent(id)}`} />
</div>

<style>
  .session-view { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
  .session-view :global(.view) { flex: 1; min-height: 0; }
</style>
