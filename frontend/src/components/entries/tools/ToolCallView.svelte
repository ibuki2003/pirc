<script lang="ts">
  import "./Tool.scss";
  import ToolResults from "./ToolResults.svelte";
  import BashTool from "./BashTool.svelte";
  import EditTool from "./EditTool.svelte";
  import PatchTool from "./PatchTool.svelte";
  import ReadTool from "./ReadTool.svelte";
  import WriteTool from "./WriteTool.svelte";
  import GenericTool from "./GenericTool.svelte";
  import type { ToolDisplay } from "./types";

  let { display, instanceId, onopen = () => {}, subscribeTool = () => {} }: {
    display: ToolDisplay;
    instanceId: string;
    onopen?: () => void;
    subscribeTool?: (ids: string[], expanded: boolean) => void;
  } = $props();
  const name = $derived(display.calls[0].name);
  const View = $derived(name === "read" ? ReadTool : name === "edit" ? EditTool :
    name === "write" ? WriteTool : name === "apply_patch" ? PatchTool : name === "bash" ? BashTool : GenericTool);
  const changes = $derived(display.calls.map(call => call.changes));
  const running = $derived(display.calls.some(call => call.progress !== undefined));
  const size = (value: number) => value >= 1024 ? `${Math.round(value / 1024)}K` : `${value}B`;
  let expanded = false;
  function toggle(open: boolean) {
    if (expanded === open) return;
    expanded = open;
    subscribeTool(display.calls.map(call => call.id), open);
    if (open) onopen();
  }
  $effect(() => () => {
    if (expanded) subscribeTool(display.calls.map(call => call.id), false);
  });
</script>
{#snippet errorNotice()}
  {#if display.error}<small role="alert">{display.error}</small>{/if}
{/snippet}
<View calls={display.calls} {changes} failed={display.failed} toggle={toggle} error={errorNotice}>
  {#snippet status()}
    {#if display.bytes}<span class="tool-size">({size(display.bytes)})</span>{/if}
    {#if running}<small class="muted-meta live-status">実行中</small>{/if}
  {/snippet}
  {#snippet output(i: number)}
    {@const call = display.calls[i]}
    <ToolResults results={call.results} {instanceId} />
    {#if call.progress}
      <pre>{call.progress.truncatedHead ? "…\n" : ""}{call.progress.output}</pre>
    {/if}
  {/snippet}
</View>
