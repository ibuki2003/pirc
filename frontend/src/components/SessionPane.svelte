<script lang="ts">
  import "./SessionPane.scss";
  import { onMount, tick, type Snippet } from "svelte";
  import { MirrorStore } from "../lib/mirror/mirror-store.svelte.ts";
  import { sessions } from "../lib/sessions.svelte.ts";
  import { connection } from "../lib/connection.svelte.ts";
  import type { ClientToServer } from "@pirc/api";
  import Transcript from "./Transcript.svelte";
  import Composer from "./Composer.svelte";
  import TopAppBar, { Row, Section, Title } from "@smui/top-app-bar";
  import IconButton, { Icon } from "@smui/icon-button";
  import Menu from "@smui/menu";
  import List, { Item } from "@smui/list";
  import Banner, { Label } from "@smui/banner";
  import Dialog, { Title as DialogTitle, Content, Actions } from "@smui/dialog";
  import Checkbox from "@smui/checkbox";
  import FormField from "@smui/form-field";
  import Button from "@smui/button";
  import { mdiArrowLeft, mdiDotsVertical } from "@mdi/js";
  let { instanceId, header, onswitch }: {
    instanceId: string;
    header?: Snippet<[MirrorStore]>;
    onswitch: (instanceId: string) => void;
  } = $props();
  let store = $derived(new MirrorStore(instanceId));
  let scrollElement = $state<HTMLDivElement | null>(null);
  let atBottom = true;
  type SavedSession = ClientToServer["requests"]["session.listSessions"]["result"][number];
  let dialogOpen = $state(false);
  let modal = $state<"new" | "resume">("new");
  let saved = $state<SavedSession[]>([]);
  let cwdOnly = $state(true);
  let modalError = $state("");
  let loading = $state(false);
  let switching = $state(false);
  let switchRequested = $state(false);
  let menuOpen = $state(false);
  let canSwitch = $derived(!switchRequested && !store.mirror?.state.status.streaming);
  let visibleSessions = $derived(saved.filter(item => !cwdOnly || item.cwd === store.mirror?.state.cwd));
  async function openModal(kind: "new" | "resume") {
    modal = kind;
    modalError = "";
    cwdOnly = true;
    saved = [];
    dialogOpen = true;
    if (kind === "resume") {
      loading = true;
      try {
        saved = await connection.peer?.request("session.listSessions", { instanceId } as never) ?? [];
      } catch (error) { modalError = String(error); }
      finally { loading = false; }
    }
  }
  async function switchTo(path?: string) {
    switching = true;
    modalError = "";
    try {
      if (!connection.peer) throw new Error("接続されていません");
      await connection.peer.request("session.switchSession", { instanceId, path });
      switchRequested = true;
      dialogOpen = false;
    } catch (error) { modalError = String(error); }
    finally { switching = false; }
  }
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
  $effect(() => {
    if (switchRequested && successor) onswitch(successor.instanceId);
  });
</script>
<div class="view">
  {#if header}
    {@render header(store)}
  {:else}
  <TopAppBar variant="static" class="session-bar">
    <Row>
      <Section align="start">
        <IconButton href="#/" aria-label="セッション一覧へ戻る">
          <Icon tag="svg" viewBox="0 0 24 24"><path d={mdiArrowLeft} /></Icon>
        </IconButton>
        <Title class="session-title">
          <span class="session-heading">
            {#if store.mirror?.state.name}<span class="session-name" title={store.mirror.state.name}>{store.mirror.state.name}</span>{/if}
            {#if store.mirror?.state.name && store.mirror?.state.cwd}<span aria-hidden="true">·</span>{/if}
            {#if store.mirror?.state.cwd}
              <span class="session-cwd" title={store.mirror.state.cwd}>{store.mirror.state.cwd}</span>
            {:else if !store.mirror?.state.name}<span>セッション</span>{/if}
          </span>
          <small title={store.mirror?.state.sessionId || instanceId}>{store.mirror?.state.sessionId || instanceId}</small>
        </Title>
      </Section>
      {#if store.mirror && !store.closed}
        <Section align="end" toolbar>
          <div class="menu-anchor">
            <IconButton aria-label="セッション操作" aria-haspopup="menu" aria-expanded={menuOpen}
              onclick={() => menuOpen = !menuOpen}>
              <Icon tag="svg" viewBox="0 0 24 24"><path d={mdiDotsVertical} /></Icon>
            </IconButton>
            <Menu anchor anchorCorner="BOTTOM_END" bind:open={menuOpen} class="session-menu">
              <List>
                <Item disabled={!canSwitch} onclick={() => { if (canSwitch) void openModal("new"); }}>新規セッション</Item>
                <Item disabled={!canSwitch} onclick={() => { if (canSwitch) void openModal("resume"); }}>セッションを再開</Item>
              </List>
            </Menu>
          </div>
        </Section>
      {/if}
    </Row>
  </TopAppBar>
  {/if}
  <Dialog bind:open={dialogOpen} class="session-dialog" aria-label={modal === "new" ? "新しいセッション" : "セッションを再開"}>
    <DialogTitle>{modal === "new" ? "新しいセッション" : "セッションを再開"}</DialogTitle>
    <Content>
      {#if modal === "new"}
        <p>現在のセッションから切り替えて、空のセッションを開きますか？</p>
      {:else}
        <FormField><Checkbox bind:checked={cwdOnly} />{#snippet label()}現在の作業ディレクトリのみ{/snippet}</FormField>
        {#if loading}<p>セッションを読み込み中…</p>
        {:else if !visibleSessions.length}<p>該当するセッションはありません。</p>
        {:else}
          <div class="saved-sessions">
            {#each visibleSessions as item (item.path)}
              <button type="button" disabled={switching} onclick={() => void switchTo(item.path)}>
                <strong>{item.name || item.firstMessage || item.id}</strong>
                <small>{item.cwd || "作業ディレクトリ不明"} · {new Date(item.modified).toLocaleString()}</small>
              </button>
            {/each}
          </div>
        {/if}
      {/if}
      {#if modalError}<p role="alert">{modalError}</p>{/if}
    </Content>
    <Actions>
      <Button disabled={switching} onclick={() => dialogOpen = false}>キャンセル</Button>
      {#if modal === "new"}<Button disabled={switching} onclick={() => void switchTo()}>新規セッションを開く</Button>{/if}
    </Actions>
  </Dialog>
  {#if store.closed}
    <Banner open>
      {#snippet label()}<Label>このインスタンスは終了しました。
        {#if successor}<Button onclick={() => onswitch(successor!.instanceId)}>同じホストの新しいセッションへ</Button>{/if}
      </Label>{/snippet}
    </Banner>
  {/if}
  {#if store.error}<Banner open>{#snippet label()}<Label>{store.error}</Label>{/snippet}</Banner>{/if}
  {#each store.notices as notice}<Banner open>{#snippet label()}<Label>{notice.message}</Label>{/snippet}</Banner>{/each}
  {#if store.mirror}
    <div class="scroll" bind:this={scrollElement} onscroll={trackScroll}>
      <Transcript entries={store.branch} {instanceId} expand={id => store.expandEntry(id)}
        subscribeTool={(ids, expanded) => store.setToolExpanded(ids, expanded)}
        loadMore={() => store.loadAncestors()} hasMore={store.mirror.hasMoreBefore}
        live={store.mirror.live} tools={store.mirror.tools} toolDurations={store.mirror.toolDurations} streaming={store.mirror.state.status.streaming} />
    </div>
    {#if !store.closed}<Composer {instanceId} sessionState={store.mirror.state} streaming={store.mirror.state.status.streaming} />{/if}
  {:else if store.loading}<p>セッションを読み込み中…</p>{/if}
</div>
