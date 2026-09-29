<script lang="ts">
  import type { ModelRef } from "@pirc/api";
  import { connection } from "../lib/connection.svelte.ts";
  let { instanceId }: { instanceId: string } = $props();
  let models = $state<ModelRef[]>([]);
  let selected = $state("");
  let error = $state("");
  async function load() {
    try { models = await connection.peer?.request("session.listModels", { instanceId } as never) || []; }
    catch (e) { error = String(e); }
  }
  async function choose() {
    const [provider, id] = selected.split("\0");
    if (!provider || !id) return;
    try {
      const result = await connection.peer?.request("session.setModel", { instanceId, provider, id });
      if (result && !result.ok) error = "モデルを切り替えられませんでした";
    } catch (e) { error = String(e); }
  }
</script>
<label>モデル <select bind:value={selected} onfocus={load} onchange={choose}>
  <option value="">選択</option>
  {#each models as model}<option value={`${model.provider}\0${model.id}`}>{model.name || `${model.provider}/${model.id}`}</option>{/each}
</select></label>
{#if error}<small role="alert">{error}</small>{/if}
