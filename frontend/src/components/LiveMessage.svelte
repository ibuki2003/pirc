<script lang="ts">
  import "./entries/EntryView.scss";
  import type { LiveMessage, ToolProgress } from "@pirc/api";
  import { markdown } from "../lib/markdown.ts";
  import LiveToolView from "./entries/LiveToolView.svelte";
  let { live, tools, visibleToolCalls, showHeader = true }: {
    live: LiveMessage | null; tools: Map<string, ToolProgress>; visibleToolCalls: Set<string>; showHeader?: boolean
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
      {:else}<LiveToolView call={block} progress={tools.get(block.id)} />{/if}
    {/each}
  </article>
{/if}
{#each orphanTools as [id, tool] (id)}
  <article class="entry assistant"><LiveToolView call={null} progress={tool} /></article>
{/each}
