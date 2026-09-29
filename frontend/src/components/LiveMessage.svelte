<script lang="ts">
  import type { LiveMessage, ToolProgress } from "@pirc/api";
  import { markdown } from "../lib/markdown.ts";
  let { live, tools }: { live: LiveMessage | null; tools: Map<string, ToolProgress> } = $props();
</script>
{#if live}
  <article class="entry live"><header>assistant · 生成中</header>
    {#each live.content as block}
      {#if block.type === "text"}<div class="markdown">{@html markdown(block.text)}</div>
      {:else if block.type === "thinking"}<details><summary>思考中</summary><p>{block.thinking}</p></details>
      {:else}<details open><summary>🔧 {block.name}</summary><pre>{JSON.stringify(block.arguments || {}, null, 2)}</pre></details>{/if}
    {/each}
  </article>
{/if}
{#each [...tools.entries()] as [id, tool] (id)}
  <details class="entry"><summary>{tool.toolName} · 実行中</summary><pre>{tool.truncatedHead ? "…\n" : ""}{tool.output}</pre></details>
{/each}
