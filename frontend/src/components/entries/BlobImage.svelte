<script lang="ts">
  import { http } from "../../lib/http.ts";
  import type { ImageContent } from "@pirc/api";
  let { instanceId, entryId, path, image }: {
    instanceId: string; entryId: string; path: (string | number)[]; image?: ImageContent;
  } = $props();
  let url = $derived(image ? `data:${image.mimeType};base64,${image.data}` : http.entryBlobUrl(instanceId, entryId, path));
</script>
<img src={url} alt="添付画像" loading="lazy" />
