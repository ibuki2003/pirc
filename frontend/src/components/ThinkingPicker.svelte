<script lang="ts">
  import "./Picker.scss";
  import type { SessionState } from "@pirc/api";
  import Textfield from "@smui/textfield";
  import { connection } from "../lib/connection.svelte.ts";
  let { instanceId, sessionState }: { instanceId: string; sessionState: SessionState } = $props();
  let open = $state(false);
  let error = $state("");
  async function change(level: SessionState["availableThinkingLevels"][number]) {
    open = false;
    try { await connection.peer?.request("session.setThinkingLevel", { instanceId, level }); }
    catch (e) { error = String(e); }
  }
</script>
<div class="picker thinking-picker" onfocusout={e => {
  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) open = false;
}}>
  <Textfield label="思考" variant="outlined" suffix="▾" value={sessionState.thinkingLevel || "off"}
    input$readonly input$onfocus={() => open = true}
    input$onkeydown={e => {
      if (e.key === "Escape") { open = false; (e.currentTarget as HTMLInputElement).blur(); }
    }} />
  {#if open}
    <div class="picker-options">
      {#each sessionState.availableThinkingLevels as level}
        <button type="button" class="picker-option" onclick={() => change(level)}>{level}</button>
      {/each}
    </div>
  {/if}
  {#if error}<small role="alert">{error}</small>{/if}
</div>
