<script lang="ts">
  import { onMount } from "svelte";
  import { MirrorStore } from "../lib/mirror/mirror-store.svelte.ts";
  import { sessions } from "../lib/sessions.svelte.ts";
  import StatusBar from "../components/StatusBar.svelte";
  import Transcript from "../components/Transcript.svelte";
  import LiveMessage from "../components/LiveMessage.svelte";
  import Composer from "../components/Composer.svelte";
  import ModelPicker from "../components/ModelPicker.svelte";
  import ThinkingPicker from "../components/ThinkingPicker.svelte";
  let { instanceId }: { instanceId: string } = $props();
  let store = $derived(new MirrorStore(instanceId));
  onMount(() => {
    store.start();
    return () => store.stop();
  });
  let successor = $derived(store.closed && store.mirror
    ? sessions.items.find(s => s.hostId === store.mirror!.state.hostId && s.instanceId !== instanceId)
    : undefined);
</script>
<div class="view">
  <nav><a href="#/">← セッション一覧</a><strong>{store.mirror?.state.name || store.mirror?.state.sessionId || instanceId}</strong></nav>
  {#if store.closed}<div class="banner" role="status">このインスタンスは終了しました。
    {#if successor}<a href={`#/s/${encodeURIComponent(successor.instanceId)}`}>同じホストの新しいセッションへ</a>{/if}
  </div>{/if}
  {#if store.error}<p role="alert">{store.error}</p>{/if}
  {#if store.mirror}
    <StatusBar state={store.mirror.state} />
    <div class="pickers"><ModelPicker {instanceId} /><ThinkingPicker {instanceId} sessionState={store.mirror.state} /></div>
    <div class="scroll">
      <Transcript entries={store.branch} {instanceId} expand={id => store.expandEntry(id)}
        loadMore={() => store.loadAncestors()} hasMore={store.mirror.hasMoreBefore} />
      <LiveMessage live={store.mirror.live} tools={store.mirror.tools} />
    </div>
    {#each store.notices as notice}<div class="banner" role="alert">{notice.message}</div>{/each}
    {#if !store.closed}<Composer {instanceId} streaming={store.mirror.state.status.streaming} />{/if}
  {:else if store.loading}<p>セッションを読み込み中…</p>{/if}
</div>
