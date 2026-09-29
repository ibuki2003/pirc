<script lang="ts">
  import type { ProjectedEntry, Trim } from "@pirc/api";
  import { markdown } from "../../lib/markdown.ts";
  import BlobImage from "./BlobImage.svelte";
  import TrimmedContent from "./TrimmedContent.svelte";
  let { item, results, instanceId, expand }: {
    item: ProjectedEntry; results: ProjectedEntry[]; instanceId: string; expand: (id: string) => Promise<void>
  } = $props();
  let entry = $derived(item.entry);
  let trims = $derived(item.trims || []);
  const findTrim = (path: (string | number)[]): Trim | undefined =>
    trims.find(t => JSON.stringify(t.path) === JSON.stringify(path));
</script>
<article class="entry" class:user={entry.type === "message" && entry.message.role === "user"}>
  {#if entry.type === "message"}
    {#if entry.message.role === "toolResult"}
      <!-- Tool results are displayed with their matching tool call. -->
    {:else}
      <header>{entry.message.role === "assistant" ? "assistant" : entry.message.role === "user" ? "you" : entry.message.role}</header>
      {#if entry.message.role === "bashExecution"}
        <pre>{entry.message.command}
{entry.message.output}</pre>
      {:else if "content" in entry.message}
        {#each typeof entry.message.content === "string" ? [{ type: "text" as const, text: entry.message.content }] : entry.message.content as block, index}
          {@const path = ["message", "content", index, block.type === "thinking" ? "thinking" : block.type === "toolCall" ? "arguments" : block.type === "image" ? "data" : "text"]}
          {#if block.type === "text"}
            <div class="markdown">{@html markdown(block.text)}</div>
          {:else if block.type === "thinking"}
            <details><summary>思考</summary><div class="markdown">{@html markdown(block.thinking)}</div></details>
          {:else if block.type === "image"}
            <BlobImage {instanceId} entryId={entry.id} path={["message", "content", index, "data"]} />
          {:else if block.type === "toolCall"}
            <details class="tool"><summary>🔧 {block.name}</summary>
              <pre>{JSON.stringify(block.arguments, null, 2)}</pre>
              {#each results.filter(r => r.entry.type === "message" && r.entry.message.role === "toolResult" && r.entry.message.toolCallId === block.id) as result (result.entry.id)}
                {#if result.entry.type === "message" && result.entry.message.role === "toolResult"}
                  {#each result.entry.message.content as output, j}
                    {#if output.type === "text"}<pre>{output.text}</pre>
                    {:else if output.type === "image"}<BlobImage {instanceId} entryId={result.entry.id} path={["message", "content", j, "data"]} />{/if}
                  {/each}
                  {#each result.trims || [] as trim}
                    {#if trim.kind !== "image"}<TrimmedContent bytes={trim.originalBytes} onexpand={() => expand(result.entry.id)} />{/if}
                  {/each}
                {/if}
              {/each}
            </details>
          {/if}
          {#if findTrim(path) && block.type !== "image"}
            <TrimmedContent bytes={findTrim(path)!.originalBytes} onexpand={() => expand(entry.id)} />
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
</article>
