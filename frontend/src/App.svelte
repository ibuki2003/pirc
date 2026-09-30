<script lang="ts">
  import { onMount } from "svelte";
  import { connection } from "./lib/connection.svelte.ts";
  import { sessions } from "./lib/sessions.svelte.ts";
  import { router } from "./lib/router.svelte.ts";
  import ConnectionBanner from "./components/ConnectionBanner.svelte";
  import SessionList from "./routes/SessionList.svelte";
  import SessionView from "./routes/SessionView.svelte";
  import GodMode from "./routes/GodMode.svelte";
  onMount(() => {
    connection.start();
    const stop = sessions.start();
    return () => { stop(); connection.stop(); };
  });
</script>
{#if router.godMode}
  <GodMode />
{:else if router.instanceId}
  {#key router.instanceId}<SessionView instanceId={router.instanceId} />{/key}
{:else}<ConnectionBanner /><SessionList />{/if}
