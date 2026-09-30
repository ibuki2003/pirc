<script lang="ts">
  import { connection } from "../lib/connection.svelte.ts";
  import Banner, { Label } from "@smui/banner";
</script>
{#if connection.status !== "connected"}
  <Banner open>{#snippet label()}<Label>サーバーに{connection.status === "connecting" ? "接続中…" : "接続できません。再接続を待っています。"}</Label>{/snippet}</Banner>
{/if}
