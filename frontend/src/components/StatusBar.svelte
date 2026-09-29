<script lang="ts">
  import type { SessionState } from "@pirc/api";
  let { state }: { state: SessionState } = $props();
</script>
<div class="status-bar">
  <span>{state.model?.name || state.model?.id || "モデルなし"}</span>
  <span>{state.thinkingLevel || "off"}</span>
  {#if state.contextUsage?.percent != null}<span>context {Math.round(state.contextUsage.percent)}%</span>{/if}
  {#if state.status.streaming}<span class="active">● 生成中</span>{/if}
  {#if state.status.compacting}<span>圧縮中</span>{/if}
  {#if state.status.pendingMessages}<span>待機中のメッセージあり</span>{/if}
  {#if state.status.uiPrompt}<span>pi の TUI で操作待ち: {state.status.uiPrompt.title || state.status.uiPrompt.kind}</span>{/if}
</div>
