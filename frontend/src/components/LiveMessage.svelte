<script lang="ts">
  import "./entries/EntryView.scss";
  import type { LiveMessage, ToolProgress } from "@pirc/api";
  import { markdown } from "../lib/markdown.ts";
  import ToolCallView from "./entries/tools/ToolCallView.svelte";
  import { liveToolDisplay } from "./entries/tools/live-tool";
  let { live, tools, visibleToolCalls, instanceId, subscribeTool = () => {}, showHeader = true }: {
    live: LiveMessage | null; tools: Map<string, ToolProgress>; visibleToolCalls: Set<string>; instanceId: string;
    subscribeTool?: (ids: string[], expanded: boolean) => void; showHeader?: boolean
  } = $props();
  const visibleBlocks = $derived(live?.content.filter(block =>
    block.type !== "toolCall" || !visibleToolCalls.has(block.id)) ?? []);
  const orphanTools = $derived([...tools.entries()].filter(([id]) =>
    !visibleToolCalls.has(id) && !live?.content.some(block => block.type === "toolCall" && block.id === id)));
</script>
{#if live && (!live.content.length || visibleBlocks.length)}
  <article class="entry assistant live">{#if showHeader}<header>assistant</header>{/if}
    {#each visibleBlocks as block}
      {#if block.type === "text"}<div class="markdown">{@html markdown(block.text)}</div>
      {:else if block.type === "thinking"}<small class="muted-meta thinking-content markdown">{@html markdown(block.thinking)}</small>
      {:else}<ToolCallView display={liveToolDisplay(block.id, block, tools.get(block.id))} {instanceId} {subscribeTool} />{/if}
    {/each}
  </article>
{/if}
{#each orphanTools as [id, tool] (id)}
  <article class="entry assistant"><ToolCallView display={liveToolDisplay(id, null, tool)} {instanceId} {subscribeTool} /></article>
{/each}
