<script lang="ts">
  import "./Composer.scss";
  import type { ImageContent, SessionState } from "@pirc/api";
  import { connection } from "../lib/connection.svelte.ts";
  import { resizeImage } from "../lib/image.ts";
  import { completionToken, matchingCommands, type CompletionToken } from "../lib/completion.ts";
  import { enterMode } from "../lib/composer-keyboard.ts";
  import { tick } from "svelte";
  import Button from "@smui/button";
  import Banner, { Label } from "@smui/banner";
  import ModelPicker from "./ModelPicker.svelte";
  import StatusBar from "./StatusBar.svelte";
  let { instanceId, sessionState, streaming }: { instanceId: string; sessionState: SessionState; streaming: boolean } = $props();
  let text = $state("");
  let images = $state<ImageContent[]>([]);
  let busy = $state(false);
  let error = $state("");
  let editor: HTMLTextAreaElement;
  let token = $state<CompletionToken>();
  let candidates = $state<{ value: string; label: string; description?: string; directory?: boolean }[]>([]);
  let highlighted = $state(0);
  let commands: { name: string; description?: string }[] | undefined;
  let commandInstance = "";
  let revision = 0;
  async function updateCompletion() {
    const current = completionToken(text, editor.selectionStart);
    const request = ++revision;
    token = current;
    candidates = [];
    highlighted = 0;
    if (!current || !connection.peer) return;
    try {
      if (current.kind === "command") {
        if (commandInstance !== instanceId) { commandInstance = instanceId; commands = undefined; }
        const loaded = commands ?? await connection.peer.request("session.listCommands", { instanceId } as never);
        if (request !== revision) return;
        commands = loaded;
        candidates = matchingCommands(commands, current.prefix).map(command => ({
          value: "/" + command.name + " ", label: "/" + command.name, description: command.description,
        }));
      } else {
        const paths = await connection.peer.request("session.completePath", { instanceId, prefix: current.prefix });
        if (request !== revision) return;
        candidates = paths.map(path => ({
          value: "@" + path.path + (path.directory ? "" : " "),
          label: path.path, directory: path.directory,
        }));
      }
    } catch (e) {
      if (request === revision) error = String(e);
    }
  }
  async function choose(index: number) {
    const item = candidates[index];
    if (!token || !item) return;
    const cursor = token.start + item.value.length;
    text = text.slice(0, token.start) + item.value + text.slice(token.end);
    revision++;
    token = undefined;
    candidates = [];
    await tick();
    editor.focus();
    editor.setSelectionRange(cursor, cursor);
    if (item.directory) void updateCompletion();
  }
  async function attach(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    try {
      images = [...images, ...await Promise.all([...input.files || []].map(resizeImage))];
      input.value = "";
    } catch (e) { error = String(e); }
  }
  async function send(deliverAs?: "steer" | "followUp") {
    if (busy || (!text.trim() && !images.length)) return;
    busy = true;
    error = "";
    try {
      await connection.peer?.request("session.prompt", { instanceId, text, images, deliverAs });
      text = ""; images = [];
      revision++; token = undefined; candidates = [];
    } catch (e) { error = String(e); } finally { busy = false; }
  }
  async function abort() {
    // API Forward<"host.abort"> intersects Record<string, never> with instanceId.
    try { await connection.peer?.request("session.abort", { instanceId } as never); }
    catch (e) { error = String(e); }
  }
</script>
<div class="composer">
  {#if error}<Banner open>{#snippet label()}<Label>{error}</Label>{/snippet}</Banner>{/if}
  <div class="composer-input">
  <textarea bind:this={editor} bind:value={text} placeholder="メッセージを入力" enterkeyhint="enter"
    oninput={() => void updateCompletion()} onclick={() => void updateCompletion()}
    onfocus={() => void updateCompletion()}
    onkeyup={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) void updateCompletion(); }}
    onkeydown={e => {
    const mode = enterMode(e, window.matchMedia("(pointer: coarse)").matches);
    if (mode === "composition") return;
    if (token && candidates.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        highlighted = (highlighted + (e.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length;
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && mode === "shortcut")) {
        e.preventDefault(); void choose(highlighted); return;
      }
    }
    if (e.key === "Escape" && token) {
      e.preventDefault(); revision++; token = undefined; candidates = []; return;
    }
    if (e.key === "Enter" && !e.shiftKey && mode === "shortcut") { e.preventDefault(); void send(streaming ? "steer" : undefined); }
  }}></textarea>
  {#if token && candidates.length}
    <div class="composer-completions" role="listbox" aria-label={token.kind === "command" ? "コマンド候補" : "パス候補"}>
      {#each candidates as item, index (item.value)}
        <button type="button" role="option" aria-selected={index === highlighted} class:highlighted={index === highlighted}
          onmousedown={e => e.preventDefault()} onclick={() => void choose(index)}>
          <span>{item.label}</span>{#if item.description}<small>{item.description}</small>{/if}
        </button>
      {/each}
    </div>
  {/if}
  </div>
  {#if images.length}<small>画像 {images.length} 枚 <Button onclick={() => images = []}>削除</Button></small>{/if}
  <div class="actions">
    <ModelPicker {instanceId} {sessionState} />
    <StatusBar state={sessionState} />
    <label class="button">画像を追加<input type="file" accept="image/*" multiple onchange={attach} hidden /></label>
    <div class="send-actions">
      {#if streaming}
        <Button onclick={abort}>中断</Button>
        <Button disabled={busy || !connection.peer || (!text.trim() && !images.length)} onclick={() => send("followUp")}>後で送信</Button>
      {/if}
      <Button disabled={busy || !connection.peer || (!text.trim() && !images.length)} onclick={() => send(streaming ? "steer" : undefined)}>{streaming ? "割り込む" : "送信"}</Button>
    </div>
  </div>
</div>
