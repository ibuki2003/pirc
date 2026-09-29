<script lang="ts">
  import { http } from "../../lib/http.ts";
  let { instanceId, entryId, path }: { instanceId: string; entryId: string; path: (string | number)[] } = $props();
  let url = $derived(http.entryBlobUrl(instanceId, entryId, path));
</script>
<img src={url} alt="添付画像" loading="lazy" />
