<script lang="ts">
  import type { ProjectedAssistantEntry, ProjectedEntry } from "@pirc/api";
  import BlobImage from "./BlobImage.svelte";

  type Call = Extract<ProjectedAssistantEntry["message"]["content"][number], { type: "toolCall" }>;
  let { call, results, instanceId }: {
    call: Call;
    results: ProjectedEntry[];
    instanceId: string;
  } = $props();
  const args = $derived(call.arguments);
</script>
{#if call.name === "read" || call.name === "write" || call.name === "edit"}
  <h6>{String(args?.path ?? "")}</h6>
  {#if call.name === "read"}
    {#if args?.offset !== undefined || args?.limit !== undefined}
      <small class="muted-meta">{#if args.offset !== undefined}offset {String(args.offset)}{/if}{#if args.limit !== undefined} limit {String(args.limit)}{/if}</small>
    {/if}
  {:else if call.name === "write"}
    {#if typeof args?.content === "string"}<pre>{args.content}</pre>{/if}
  {:else}
    {#if typeof args?.oldText === "string"}<small class="muted-meta">変更前</small><pre>{args.oldText}</pre>{/if}
    {#if typeof args?.newText === "string"}<small class="muted-meta">変更後</small><pre>{args.newText}</pre>{/if}
  {/if}
{:else if call.name === "apply_patch"}
  {#if typeof args?.patch === "string"}<pre>{args.patch}</pre>{/if}
{:else if args !== null && typeof args === "object" && !Array.isArray(args)}
  <div class="tool-arguments">
    {#each Object.entries(args) as [key, value] (key)}
      <span class="tool-argument-key">{key}</span>
      <pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    {/each}
  </div>
{:else if args !== undefined}
  <pre>{JSON.stringify(args, null, 2)}</pre>
{/if}
{#each results as result (result.entry.id)}
  {#if result.entry.type === "redacted"}
    {#if result.entry.isError}<small class="muted-meta">エラー</small>{/if}
  {:else if result.entry.type === "message" && result.entry.message.role === "toolResult"}
    {#each result.entry.message.content as output, j}
      {#if output.type === "text"}<pre>{output.text}</pre>
      {:else if output.type === "image"}<BlobImage {instanceId} entryId={result.entry.id} path={["message", "content", j, "data"]} />{/if}
    {/each}
  {/if}
{/each}
