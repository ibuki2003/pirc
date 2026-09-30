<script lang="ts">
  import "./GodMode.scss";
  import { sessions } from "../lib/sessions.svelte.ts";
  import SessionPane from "../components/SessionPane.svelte";
  import ConnectionBanner from "../components/ConnectionBanner.svelte";
  import TopAppBar, { Row, Section, Title } from "@smui/top-app-bar";
  import IconButton, { Icon } from "@smui/icon-button";
  import Dialog, { Title as DialogTitle, Content, Actions } from "@smui/dialog";
  import Button from "@smui/button";
  import Banner, { Label } from "@smui/banner";
  import { mdiArrowLeft, mdiArrowRight, mdiClose, mdiPlus } from "@mdi/js";

  let columns = $state<string[]>([]);
  let pickerOpen = $state(false);
  function add(instanceId: string) {
    if (!columns.includes(instanceId)) columns = [...columns, instanceId];
  }
  function move(instanceId: string, direction: -1 | 1) {
    const index = columns.indexOf(instanceId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    columns = next;
  }
  function replace(instanceId: string, successorId: string) {
    columns = columns.includes(successorId)
      ? columns.filter(id => id !== instanceId)
      : columns.map(id => id === instanceId ? successorId : id);
  }
  function basename(cwd: string) {
    return cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || cwd;
  }
</script>

<div class="god-mode">
  <TopAppBar variant="static" class="god-mode-bar">
    <Row>
      <Section align="start">
        <IconButton href="#/" aria-label="セッション一覧へ戻る">
          <Icon tag="svg" viewBox="0 0 24 24"><path d={mdiArrowLeft} /></Icon>
        </IconButton>
        <Title>God Mode</Title>
      </Section>
      <Section align="end" toolbar>
        <IconButton aria-label="セッションを追加" onclick={() => pickerOpen = true}>
          <Icon tag="svg" viewBox="0 0 24 24"><path d={mdiPlus} /></Icon>
        </IconButton>
      </Section>
    </Row>
  </TopAppBar>
  <ConnectionBanner />
  <Dialog bind:open={pickerOpen} class="god-mode-picker" aria-label="セッションを追加">
    <DialogTitle>セッションを追加</DialogTitle>
    <Content>
      {#if sessions.error}<p role="alert">{sessions.error}</p>{/if}
      {#if !sessions.items.length}<p>接続中のセッションはありません。</p>{/if}
      <div class="session-options">
        {#each sessions.items as session (session.instanceId)}
          <Button disabled={columns.includes(session.instanceId)} onclick={() => add(session.instanceId)}>
            <span class="session-option">
              <strong>{basename(session.cwd)}@{session.hostname}</strong>
              <span>{session.name || session.sessionId}</span>
              <small>{session.cwd}</small>
              <small>{session.sessionId}{#if columns.includes(session.instanceId)} · 追加済み{/if}</small>
            </span>
          </Button>
        {/each}
      </div>
    </Content>
    <Actions><Button onclick={() => pickerOpen = false}>閉じる</Button></Actions>
  </Dialog>
  {#if sessions.error}<Banner open>{#snippet label()}<Label>{sessions.error}</Label>{/snippet}</Banner>{/if}
  <main class="god-columns">
    {#if !columns.length}<p class="god-empty">＋ボタンからセッションを追加してください。</p>{/if}
    {#each columns as instanceId, index (instanceId)}
      <section class="god-column" aria-label={`セッション ${instanceId}`}>
        <SessionPane {instanceId} onswitch={id => replace(instanceId, id)}>
          {#snippet header(store)}
            {@const state = store.mirror?.state ?? sessions.items.find(item => item.instanceId === instanceId)}
            <TopAppBar variant="static" class="session-bar">
              <Row>
                <Section align="start">
                  <Title class="session-title">
                    <span class="column-heading" title={state ? `${state.cwd}@${state.hostname}` : instanceId}>
                      {state ? `${basename(state.cwd)}@${state.hostname}` : "セッション"}
                    </span>
                    <small title={state?.sessionId || instanceId}>{state?.sessionId || instanceId}</small>
                  </Title>
                </Section>
                <Section align="end" toolbar>
                  <IconButton aria-label="左へ移動" disabled={index === 0} onclick={() => move(instanceId, -1)}>
                    <Icon tag="svg" viewBox="0 0 24 24"><path d={mdiArrowLeft} /></Icon>
                  </IconButton>
                  <IconButton aria-label="右へ移動" disabled={index === columns.length - 1} onclick={() => move(instanceId, 1)}>
                    <Icon tag="svg" viewBox="0 0 24 24"><path d={mdiArrowRight} /></Icon>
                  </IconButton>
                  <IconButton aria-label="カラムを閉じる" onclick={() => columns = columns.filter(id => id !== instanceId)}>
                    <Icon tag="svg" viewBox="0 0 24 24"><path d={mdiClose} /></Icon>
                  </IconButton>
                </Section>
              </Row>
            </TopAppBar>
          {/snippet}
        </SessionPane>
      </section>
    {/each}
  </main>
</div>
