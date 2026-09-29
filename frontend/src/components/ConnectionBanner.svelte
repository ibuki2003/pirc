<script lang="ts">
  import { connection } from "../lib/connection.svelte.ts";
</script>
{#if connection.status !== "connected"}
  <div class="banner" role="status">サーバーに{connection.status === "connecting" ? "接続中…" : "接続できません。再接続を待っています。"}</div>
{/if}
