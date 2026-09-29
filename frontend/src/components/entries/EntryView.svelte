<script lang="ts">
  import "./EntryView.scss";
  import "./ToolCallView.scss";
  import type { ProjectedAssistantEntry, ProjectedEntry, ToolProgress } from "@pirc/api";
  import { markdown } from "../../lib/markdown.ts";
  import BlobImage from "./BlobImage.svelte";
  import ToolCallView from "./ToolCallView.svelte";
  type Call = Extract<ProjectedAssistantEntry["message"]["content"][number], { type: "toolCall" }>;
  let { item, results, instanceId, expand, tools }: {
    item: ProjectedEntry; results: ProjectedEntry[]; instanceId: string; expand: (id: string) => Promise<void>;
    tools: Map<string, ToolProgress>;
  } = $props();
  let entry = $derived(item.entry);
  let error = $state("");
  let bashOpen = $state(false);
  async function load(id: string) {
    try { await expand(id); } catch (e) { error = String(e); }
  }
  function size(bytes: number): string {
    return bytes >= 1024 ? `${Math.round(bytes / 1024)}K` : `${bytes}B`;
  }
  function readAt(content: unknown, index: number): boolean {
    return Array.isArray(content) && content[index]?.type === "toolCall" && content[index]?.name === "read";
  }
  function readCalls(content: unknown, index: number): Call[] {
    if (!Array.isArray(content)) return [];
    const calls: Call[] = [];
    while (readAt(content, index)) calls.push(content[index++] as Call);
    return calls;
  }
</script>
<article class="entry"
  class:assistant={entry.type === "message" && entry.message.role === "assistant"}
  class:user={entry.type === "message" && entry.message.role === "user"}
  class:system={entry.type === "message" && entry.message.role === "system"}>
  {#if entry.type === "redacted"}
    {#if entry.role === "bashExecution"}
      <details class="tool" class:tool-error={entry.isError} open={bashOpen} ontoggle={e => {
        bashOpen = e.currentTarget.open;
        if (bashOpen) void load(entry.id);
      }}>
        <summary><span class="tool-preview">{entry.command}</span><span class="tool-size">({size(entry.originalBytes)})</span></summary>
        <pre>{entry.command}</pre>
      </details>
    {/if}
  {:else if entry.type === "message"}
    {#if entry.message.role === "toolResult"}
      <!-- Tool results are displayed with their matching tool call. -->
    {:else}
      <header>{entry.message.role === "assistant" ? "assistant" : entry.message.role === "user" ? "you" : entry.message.role}</header>
      {#if entry.message.role === "bashExecution"}
        <details class="tool" class:tool-error={entry.message.cancelled || (entry.message.exitCode !== undefined && entry.message.exitCode !== 0)} open={bashOpen} ontoggle={e => { bashOpen = e.currentTarget.open; }}>
          <summary><span class="tool-preview">{entry.message.command}</span></summary>
          <pre>{entry.message.command}
{entry.message.output}</pre>
        </details>
      {:else if "content" in entry.message}
        {#each typeof entry.message.content === "string" ? [{ type: "text" as const, text: entry.message.content }] : entry.message.content as block, index}
          {#if block.type === "text"}
            <div class="markdown">{@html markdown(block.text)}</div>
          {:else if block.type === "thinking"}
            <small class="muted-meta thinking-content markdown">{@html markdown(block.thinking)}</small>
          {:else if block.type === "image"}
            <BlobImage {instanceId} entryId={entry.id} path={["message", "content", index, "data"]} />
          {:else if block.type === "toolCall"}
            {#if block.name !== "read" || !readAt(entry.message.content, index - 1)}
              <ToolCallView calls={block.name === "read" ? readCalls(entry.message.content, index) : [block]}
                {results} {instanceId} entryId={entry.id} {expand} {tools} />
            {/if}
          {/if}
        {/each}
      {/if}
    {/if}
  {:else if entry.type === "compaction" || entry.type === "branch_summary"}
    <details><summary>{entry.type === "compaction" ? "圧縮" : "枝の要約"}</summary>
      <div class="markdown">{@html markdown(entry.summary)}</div>
    </details>
  {:else if entry.type === "custom_message"}
    {#if entry.display}<header>{entry.customType}</header><pre>{typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content)}</pre>{/if}
  {:else if entry.type === "model_change"}
    <small>モデル: {entry.provider}/{entry.modelId}</small>
  {:else if entry.type === "thinking_level_change"}
    <small>思考レベル: {entry.thinkingLevel}</small>
  {:else if entry.type === "session_info"}
    <small>セッション名: {entry.name || "なし"}</small>
  {:else if entry.type === "label"}
    <small>ラベル: {entry.label || "削除"}</small>
  {/if}
  {#if error}<small role="alert">{error}</small>{/if}
</article>
