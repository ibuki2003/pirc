<script lang="ts">
  import "./Picker.scss";
  import type { ModelRef, SessionState } from "@pirc/api";
  import Button from "@smui/button";
  import Dialog, { Title, Content, Actions } from "@smui/dialog";
  import Slider from "@smui/slider";
  import Textfield from "@smui/textfield";
  import { connection } from "../lib/connection.svelte.ts";

  let { instanceId, sessionState }: { instanceId: string; sessionState: SessionState } = $props();
  let models = $state<(ModelRef & { scoped: boolean })[]>([]);
  let filter = $state("");
  let open = $state(false);
  let loading = $state(false);
  let switching = $state(false);
  let highlighted = $state(0);
  let error = $state("");
  let thinkingIndex = $state(0);
  $effect(() => {
    thinkingIndex = Math.max(0, sessionState.availableThinkingLevels.indexOf(sessionState.thinkingLevel ?? "off"));
  });
  let visible = $derived(models.filter(model => filter
    ? `${model.provider} ${model.id} ${model.name ?? ""}`.toLowerCase().includes(filter.toLowerCase())
    : model.scoped));

  async function load() {
    open = true;
    error = "";
    filter = "";
    models = [];
    highlighted = 0;
    loading = true;
    try { models = await connection.peer?.request("session.listModels", { instanceId } as never) || []; }
    catch (e) { error = String(e); }
    finally { loading = false; }
  }
  async function choose(model: ModelRef) {
    switching = true;
    error = "";
    try {
      const result = await connection.peer?.request("session.setModel", { instanceId, provider: model.provider, id: model.id });
      if (result && !result.ok) error = "モデルを切り替えられませんでした";
    } catch (e) { error = String(e); }
    finally { switching = false; }
  }
  async function changeThinking(index: number) {
    const level = sessionState.availableThinkingLevels[index];
    if (!level) return;
    switching = true;
    error = "";
    try { await connection.peer?.request("session.setThinkingLevel", { instanceId, level }); }
    catch (e) {
      error = String(e);
      thinkingIndex = Math.max(0, sessionState.availableThinkingLevels.indexOf(sessionState.thinkingLevel ?? "off"));
    }
    finally { switching = false; }
  }
</script>
<Button variant="text" class="model-trigger" onclick={() => void load()}>
  {sessionState.model?.name || sessionState.model?.id || "モデル未設定"} · {sessionState.thinkingLevel || "off"}
</Button>
<Dialog bind:open class="model-dialog" aria-label="モデルと思考">
  <Title>モデルと思考</Title>
  <Content>
    <Textfield label="モデルを検索" variant="outlined" bind:value={filter} input$autocomplete="off"
      input$oninput={() => highlighted = 0}
      input$onkeydown={e => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          highlighted = Math.max(0, Math.min(visible.length - 1, highlighted + (e.key === "ArrowDown" ? 1 : -1)));
        }
        if (e.key === "Enter" && visible[highlighted]) {
          e.preventDefault();
          void choose(visible[highlighted]);
        }
      }} />
    {#if loading}<p>モデルを読み込み中…</p>
    {:else if !visible.length}<p>該当するモデルはありません。</p>
    {:else}
      <div class="model-options">
        {#each visible as model, index (`${model.provider}\0${model.id}`)}
          <button type="button" disabled={switching} class:highlighted={index === highlighted}
            aria-current={sessionState.model?.provider === model.provider && sessionState.model?.id === model.id ? "true" : undefined}
            onclick={() => void choose(model)}>
            <span>{model.name || model.id}</span><small>{model.provider} / {model.id}</small>
          </button>
        {/each}
      </div>
    {/if}
    {#if sessionState.availableThinkingLevels.length > 1}
      <div class="thinking-control">
        <label for="thinking-level">思考レベル: {sessionState.availableThinkingLevels[thinkingIndex]}</label>
        <Slider discrete tickMarks min={0} max={sessionState.availableThinkingLevels.length - 1} step={1}
          bind:value={thinkingIndex} disabled={switching}
          style={`--thinking-label: "${sessionState.availableThinkingLevels[thinkingIndex]}";`}
          input$id="thinking-level"
          valueToAriaValueTextFn={value => sessionState.availableThinkingLevels[value] ?? ""}
          onSMUISliderChange={e => void changeThinking(e.detail.value)} />
      </div>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </Content>
  <Actions><Button onclick={() => open = false}>閉じる</Button></Actions>
</Dialog>
