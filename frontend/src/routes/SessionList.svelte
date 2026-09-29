<script lang="ts">
  import { sessions } from "../lib/sessions.svelte.ts";
  import SessionCard from "../components/SessionCard.svelte";
  import type { SessionSummary } from "@pirc/api";
  let groups = $derived(sessions.items.reduce<Record<string, SessionSummary[]>>((groups, session) => {
    (groups[`${session.hostname} · ${session.cwd}`] ??= []).push(session);
    return groups;
  }, {}));
</script>
<main class="list">
  <h1>pirc <small>セッション</small></h1>
  {#if sessions.error}<p role="alert">{sessions.error}</p>{/if}
  {#if sessions.items.length === 0}<p>接続中のセッションはありません。</p>{/if}
  {#each Object.entries(groups) as [group, items]}
    <section><h2>{group}</h2><div class="cards">
      {#each items || [] as session (session.instanceId)}<SessionCard {session} />{/each}
    </div></section>
  {/each}
</main>
