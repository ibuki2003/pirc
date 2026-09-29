<script lang="ts">
  import "./SessionView.scss";
  import { onMount, tick } from "svelte";
  import { MirrorStore } from "../lib/mirror/mirror-store.svelte.ts";
  import { sessions } from "../lib/sessions.svelte.ts";
  import StatusBar from "../components/StatusBar.svelte";
  import Transcript from "../components/Transcript.svelte";
  import Composer from "../components/Composer.svelte";
  import ModelPicker from "../components/ModelPicker.svelte";
  import ThinkingPicker from "../components/ThinkingPicker.svelte";
  let { instanceId }: { instanceId: string } = $props();
  let store = $derived(new MirrorStore(instanceId));
  let scrollElement = $state<HTMLDivElement | null>(null);
  let atBottom = true;
  let lastScrollHeight = 0;
  function trackScroll() {
    if (scrollElement) {
      const height = scrollElement.scrollHeight;
      if (height !== lastScrollHeight) {
        lastScrollHeight = height;
        if (atBottom) scrollElement.scrollTop = height;
        return;
      }
      atBottom = scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop <= 48;
    }
  }
  $effect(() => {
    const element = scrollElement;
    const transcript = element?.querySelector(".transcript");
    if (!element || !transcript) return;
    const observer = new ResizeObserver(() => {
      lastScrollHeight = element.scrollHeight;
      if (atBottom) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    observer.observe(transcript);
    return () => observer.disconnect();
  });
  $effect.pre(() => {
    const element = scrollElement;
    const mirror = store.mirror;
    if (!element || !mirror || !atBottom) return;
    void tick().then(() => {
      if (element.isConnected && atBottom) element.scrollTop = element.scrollHeight;
    });
  });
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
    <div class="status-bar">
      <ModelPicker {instanceId} sessionState={store.mirror.state} />
      <ThinkingPicker {instanceId} sessionState={store.mirror.state} />
      <StatusBar state={store.mirror.state} />
    </div>
    <div class="scroll" bind:this={scrollElement} onscroll={trackScroll}>
      <Transcript entries={store.branch} {instanceId} expand={id => store.expandEntry(id)}
        loadMore={() => store.loadAncestors()} hasMore={store.mirror.hasMoreBefore}
        live={store.mirror.live} tools={store.mirror.tools} streaming={store.mirror.state.status.streaming} />
    </div>
    {#each store.notices as notice}<div class="banner" role="alert">{notice.message}</div>{/each}
    {#if !store.closed}<Composer {instanceId} streaming={store.mirror.state.status.streaming} />{/if}
  {:else if store.loading}<p>セッションを読み込み中…</p>{/if}
</div>
