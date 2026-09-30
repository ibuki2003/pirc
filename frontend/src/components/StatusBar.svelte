<script lang="ts">
  import type { SessionState } from "@pirc/api";
  import LinearProgress from "@smui/linear-progress";
  let { state }: { state: SessionState } = $props();
</script>
<div class="status-details">
  {#if state.contextUsage?.percent != null}
    <span class="context-usage">
      context {Math.round(state.contextUsage.percent)}%
      <LinearProgress progress={Math.min(1, Math.max(0, state.contextUsage.percent / 100))} aria-label="コンテキスト使用率" />
    </span>
  {/if}
  {#if state.status.compacting}<span>圧縮中</span>{/if}
  {#if state.status.pendingMessages}<span>待機中のメッセージあり</span>{/if}
  {#if state.status.uiPrompt}<span>pi の TUI で操作待ち: {state.status.uiPrompt.title || state.status.uiPrompt.kind}</span>{/if}
</div>
