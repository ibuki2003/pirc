<script lang="ts">
  import type { LiveMessage, ToolProgress } from "@pirc/api";
  import { markdown } from "../lib/markdown.ts";
  import LiveToolView from "./entries/LiveToolView.svelte";
  let { live, tools }: { live: LiveMessage | null; tools: Map<string, ToolProgress> } = $props();
  const orphanTools = $derived([...tools.entries()].filter(([id]) =>
    !live?.content.some(block => block.type === "toolCall" && block.id === id)));
</script>
{#if live}
  <article class="entry assistant live"><header>assistant</header>
    {#each live.content as block}
      {#if block.type === "text"}<div class="markdown">{@html markdown(block.text)}</div>
      {:else if block.type === "thinking"}<small class="muted-meta thinking-content markdown">{@html markdown(block.thinking)}</small>
      {:else}<LiveToolView call={block} progress={tools.get(block.id)} />{/if}
    {/each}
  </article>
{/if}
{#each orphanTools as [id, tool] (id)}
  <article class="entry assistant"><LiveToolView call={null} progress={tool} /></article>
{/each}
