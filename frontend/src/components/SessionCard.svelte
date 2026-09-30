<script lang="ts">
  import "./SessionCard.scss";
  import type { SessionSummary } from "@pirc/api";
  import Card from "@smui/card";
  let { session }: { session: SessionSummary } = $props();
</script>
<Card class="session-card"><a href={`#/s/${encodeURIComponent(session.instanceId)}`}>
  <strong>{session.name || session.sessionId}</strong>
  {#if session.status.streaming}<span class="active">● 生成中</span>{/if}
  <small>{session.model?.name || session.model?.id || "モデル未設定"} · {session.entryCount} entries</small>
  {#if session.lastUserText}<p>{session.lastUserText}</p>{/if}
</a></Card>
