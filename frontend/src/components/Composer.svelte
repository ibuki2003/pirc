<script lang="ts">
  import "./Composer.scss";
  import type { ImageContent } from "@pirc/api";
  import { connection } from "../lib/connection.svelte.ts";
  import { resizeImage } from "../lib/image.ts";
  import Button from "@smui/button";
  let { instanceId, streaming }: { instanceId: string; streaming: boolean } = $props();
  let text = $state("");
  let images = $state<ImageContent[]>([]);
  let busy = $state(false);
  let error = $state("");
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
    } catch (e) { error = String(e); } finally { busy = false; }
  }
  async function abort() {
    // API Forward<"host.abort"> intersects Record<string, never> with instanceId.
    try { await connection.peer?.request("session.abort", { instanceId } as never); }
    catch (e) { error = String(e); }
  }
</script>
<div class="composer">
  {#if error}<div role="alert">{error}</div>{/if}
  <textarea bind:value={text} placeholder="メッセージを入力" onkeydown={e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(streaming ? "steer" : undefined); }
  }}></textarea>
  {#if images.length}<small>画像 {images.length} 枚 <button onclick={() => images = []}>削除</button></small>{/if}
  <div class="actions">
    <label class="button">画像を追加<input type="file" accept="image/*" multiple onchange={attach} hidden /></label>
    <Button disabled={busy || !connection.peer || (!text.trim() && !images.length)} onclick={() => send(streaming ? "steer" : undefined)}>{streaming ? "割り込む" : "送信"}</Button>
    {#if streaming}
      <button disabled={busy || !connection.peer || (!text.trim() && !images.length)} onclick={() => send("followUp")}>後で送信</button>
      <button onclick={abort}>中断</button>
    {/if}
  </div>
</div>
