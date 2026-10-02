<script lang="ts">
  import "./Tool.scss";
  import ToolResults from "./ToolResults.svelte";
  import BashTool from "./BashTool.svelte";
  import EditTool from "./EditTool.svelte";
  import PatchTool from "./PatchTool.svelte";
  import ReadTool from "./ReadTool.svelte";
  import WriteTool from "./WriteTool.svelte";
  import GenericTool from "./GenericTool.svelte";
  import { toolExpansionContext, type ToolDisplay, type ToolExpansion } from "./types";
  import { getContext, onDestroy } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  let { display, instanceId, onopen = () => {}, subscribeTool = () => {} }: {
    display: ToolDisplay;
    instanceId: string;
    onopen?: () => void;
    subscribeTool?: (ids: string[], expanded: boolean) => void;
  } = $props();
  const name = $derived(display.calls[0].name);
  const View = $derived(name === "read" ? ReadTool : name === "edit" ? EditTool :
    name === "write" ? WriteTool : name === "apply_patch" ? PatchTool : name === "bash" ? BashTool : GenericTool);
  const size = (value: number) => value >= 1024 ? `${Math.round(value / 1024)}K` : `${value}B`;
  const sharedExpansion = getContext<ToolExpansion | undefined>(toolExpansionContext);
  const mergedCalls = $derived(display.calls.map(call => {
    const cached = sharedExpansion?.objects.get(call.id);
    if (!cached) return call;
    const object = cached.value;
    const result = object.result;
    return { ...call, arguments: object.arguments ?? call.arguments,
      results: result ? [{ index: result.index, entry: {
        id: result.id, parentId: result.parentId, timestamp: result.timestamp, type: "message" as const,
        message: { ...result.message, content: object.content },
      } }] : call.results,
      progress: result ? undefined : object.progress ? { ...object.progress,
        output: object.content.filter(block => block.type === "text").map(block => block.text).join("\n") } : call.progress,
    };
  }));
  const changes = $derived(display.calls.map(call => call.changes));
  const running = $derived(mergedCalls.some(call => call.progress !== undefined));
  const failed = $derived(display.failed || mergedCalls.some(call => call.results.some(item =>
    item.entry.type === "message" && item.entry.message.role === "toolResult" && item.entry.message.isError)));
  const expandedIds = sharedExpansion?.ids ?? new SvelteSet<string>();
  const expanded = $derived(display.calls.some(call => expandedIds.has(call.id)));
  let disposed = false;
  let callIds: string[] = [];
  function toggle(open: boolean) {
    if (disposed) return;
    if (expanded === open) return;
    for (const call of display.calls) open ? expandedIds.add(call.id) : expandedIds.delete(call.id);
    subscribeTool(display.calls.map(call => call.id), open);
  }
  $effect(() => {
    callIds = display.calls.map(call => call.id);
    if (expanded) {
      const added = callIds.filter(id => !expandedIds.has(id));
      for (const id of added) expandedIds.add(id);
      if (added.length) subscribeTool(added, true);
      onopen();
    }
  });
  onDestroy(() => {
    disposed = true;
    // Transcript owns subscriptions across live/history component replacements.
    if (!sharedExpansion && callIds.some(id => expandedIds.has(id))) subscribeTool(callIds, false);
  });
</script>
{#snippet errorNotice()}
  {#if display.error}<small role="alert">{display.error}</small>{/if}
{/snippet}
<View calls={mergedCalls} {changes} {failed} open={expanded} toggle={toggle} error={errorNotice}>
  {#snippet status()}
    {#if display.bytes && !expanded}<span class="tool-size">({size(display.bytes)})</span>{/if}
    {#if running}<small class="muted-meta live-status">実行中</small>{/if}
  {/snippet}
  {#snippet output(i: number)}
    {@const call = mergedCalls[i]}
    <ToolResults results={call.results} {instanceId} />
    {#if call.progress}
      <pre>{call.progress.truncatedHead ? "…\n" : ""}{call.progress.output}</pre>
    {/if}
  {/snippet}
</View>
