<script lang="ts">
  import "./ToolCallView.scss";
  import type { LiveBlock, ToolProgress } from "@pirc/api";
  import ToolBashSummary from "./ToolBashSummary.svelte";
  import ToolEditSummary from "./ToolEditSummary.svelte";
  import ToolPatchSummary from "./ToolPatchSummary.svelte";
  import ToolReadSummary from "./ToolReadSummary.svelte";
  import ToolWriteSummary from "./ToolWriteSummary.svelte";

  let { call, progress }: {
    call: Extract<LiveBlock, { type: "toolCall" }> | null;
    progress?: ToolProgress;
  } = $props();
  const name = $derived(call?.name ?? progress?.toolName ?? "");
  const args = $derived(call?.arguments);
</script>
<details class="tool">
  <summary>
    {#if name !== "bash"}<span class="tool-name">{name}</span>{/if}
    {#if name === "read"}
      <ToolReadSummary paths={args?.path === undefined ? [] : [String(args.path)]} />
    {:else if name === "edit"}
      <ToolEditSummary path={String(args?.path ?? "")} change={call?.changes?.[0]} />
    {:else if name === "write"}
      <ToolWriteSummary path={String(args?.path ?? "")} change={call?.changes?.[0]} />
    {:else if name === "apply_patch"}
      <ToolPatchSummary changes={call?.changes} />
    {:else if name === "bash"}
      <ToolBashSummary command={String(args?.command || progress?.command || "")} />
    {/if}
    {#if progress}<small class="muted-meta live-status">実行中</small>{/if}
  </summary>
  {#if args && Object.keys(args).length}
    <div class="tool-arguments">
      {#each Object.entries(args) as [key, value] (key)}
        <span class="tool-argument-key">{key}</span>
        <pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
      {/each}
    </div>
  {/if}
  {#if progress}<pre>{progress.truncatedHead ? "…\n" : ""}{progress.output}</pre>{/if}
</details>
