<script lang="ts">
  import "./Picker.scss";
  import type { ModelRef, SessionState } from "@pirc/api";
  import Textfield from "@smui/textfield";
  import { connection } from "../lib/connection.svelte.ts";
  let { instanceId, sessionState }: { instanceId: string; sessionState: SessionState } = $props();
  let models = $state<(ModelRef & { scoped: boolean })[]>([]);
  let value = $state("");
  let filter = $state("");
  let open = $state(false);
  let highlighted = $state(0);
  let error = $state("");
  let visible = $derived(models.filter(model => filter
    ? model.id.toLowerCase().includes(filter.toLowerCase())
    : model.scoped));
  $effect(() => {
    value = sessionState.model?.id ?? "";
  });
  async function load() {
    open = true;
    filter = "";
    highlighted = 0;
    try { models = await connection.peer?.request("session.listModels", { instanceId } as never) || []; }
    catch (e) { error = String(e); }
  }
  async function choose(model: ModelRef) {
    open = false;
    value = model.id;
    try {
      const result = await connection.peer?.request("session.setModel", { instanceId, provider: model.provider, id: model.id });
      if (result && !result.ok) {
        error = "モデルを切り替えられませんでした";
        value = sessionState.model?.id ?? "";
      }
    } catch (e) { error = String(e); value = sessionState.model?.id ?? ""; }
  }
  function close() {
    if (open) value = sessionState.model?.id ?? "";
    open = false;
  }
</script>
<div class="picker" onfocusout={e => {
  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
}}>
  <Textfield label="モデル" variant="outlined" suffix="▾" bind:value
    input$autocomplete="off" input$onfocus={e => { e.currentTarget.select(); void load(); }}
    input$oninput={e => { filter = e.currentTarget.value; highlighted = 0; open = true; }}
    input$onkeydown={e => {
      if (e.key === "Escape") { close(); (e.currentTarget as HTMLInputElement).blur(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open = true;
        highlighted = Math.max(0, Math.min(visible.length - 1, highlighted + (e.key === "ArrowDown" ? 1 : -1)));
      }
      if (e.key === "Enter" && open && visible[highlighted]) {
        e.preventDefault();
        void choose(visible[highlighted]);
        (e.currentTarget as HTMLInputElement).blur();
      }
    }} />
  {#if open}
    <div class="picker-options">
      {#each visible as model, index (`${model.provider}\0${model.id}`)}
        <button type="button" class:highlighted={index === highlighted} class="picker-option" onclick={() => choose(model)}>
          <span>{model.id}</span><small>{model.provider}</small>
        </button>
      {/each}
    </div>
  {/if}
  {#if error}<small role="alert">{error}</small>{/if}
</div>
