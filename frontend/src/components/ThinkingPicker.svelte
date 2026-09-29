<script lang="ts">
  import type { SessionState } from "@pirc/api";
  import { connection } from "../lib/connection.svelte.ts";
  let { instanceId, sessionState }: { instanceId: string; sessionState: SessionState } = $props();
  let error = $state("");
  async function change(event: Event) {
    const level = (event.currentTarget as HTMLSelectElement).value as SessionState["availableThinkingLevels"][number];
    try { await connection.peer?.request("session.setThinkingLevel", { instanceId, level }); }
    catch (e) { error = String(e); }
  }
</script>
<label>思考 <select value={sessionState.thinkingLevel || "off"} onchange={change}>
  {#each sessionState.availableThinkingLevels as level}<option value={level}>{level}</option>{/each}
</select></label>
{#if error}<small role="alert">{error}</small>{/if}
