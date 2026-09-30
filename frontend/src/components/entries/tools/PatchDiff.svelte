<script lang="ts">
  import Button from "@smui/button";
  import { patchLines, patchRows } from "./patch-diff";
  import type { PatchLine } from "./patch-diff";
  let { patch }: { patch: string } = $props();
  let split = $state(false);
  const lines = $derived(patchLines(patch));
  const rows = $derived(patchRows(lines));
</script>
{#snippet splitLine(line: PatchLine | undefined)}
  <code class="split-line"><span class="line-marker">{line?.text.slice(0, 1) ?? " "}</span><span class="line-content">{line?.text.slice(1) || "\u00a0"}</span></code>
{/snippet}
<div class="patch-diff">
  <div class="diff-controls">
    <Button aria-pressed={split} onclick={() => split = !split}>
      {split ? "通常表示に切替" : "左右比較に切替"}
    </Button>
  </div>
  <!-- Keyboard focus enables scrolling long diffs without a pointer. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="diff-scroll" tabindex="0" role="region" aria-label="パッチの差分">
    {#if split}
      <table class="split">
        <thead><tr><th scope="col">変更前</th><th scope="col">変更後</th></tr></thead>
        <tbody>
          {#each rows as row}
            <tr>
              {#if row.meta}
                <td colspan="2" class="meta"><code>{row.meta.text || "\u00a0"}</code></td>
              {:else}
                <td class={row.left?.kind ?? "empty"}>{@render splitLine(row.left)}</td>
                <td class={row.right?.kind ?? "empty"}>{@render splitLine(row.right)}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="unified">
        {#each lines as line}
          <div class={line.kind}><code>{line.text || "\u00a0"}</code></div>
        {/each}
      </div>
    {/if}
  </div>
</div>
<style>
  .patch-diff {
    --added-text: #166534;
    --added-bg: #e7f5eb;
    --removed-text: #a61b29;
    --removed-bg: #fde9eb;
    --meta-text: #52647d;
    --meta-bg: #edf1f7;
    margin-block: .5rem;
  }
  .diff-controls { display: flex; justify-content: flex-end; }
  .diff-scroll { max-height: 28rem; overflow: auto; border: 1px solid #80808055; }
  code { font-family: monospace; white-space: pre; }
  .unified { min-width: max-content; }
  .unified > div, td { padding: 0 .5rem; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; }
  .split { table-layout: fixed; }
  .split th { width: 50%; }
  .split code { white-space: pre-wrap; overflow-wrap: anywhere; }
  .split-line { display: grid; grid-template-columns: 1ch minmax(0, 1fr); }
  .line-marker { white-space: pre; }
  .line-content { min-width: 0; }
  th { text-align: left; font-weight: normal; font-size: .85rem; padding: .25rem .5rem; }
  td { vertical-align: top; }
  td:first-child:not([colspan]) { border-right: 1px solid #80808055; }
  .added { color: var(--added-text); background: var(--added-bg); }
  .removed { color: var(--removed-text); background: var(--removed-bg); }
  .meta { color: var(--meta-text); background: var(--meta-bg); }
  .empty { background: #80808012; }
  @media (prefers-color-scheme: dark) {
    .patch-diff {
      --added-text: #9ae6b4;
      --added-bg: #19392b;
      --removed-text: #ffabb3;
      --removed-bg: #45252c;
      --meta-text: #b3c6e1;
      --meta-bg: #253246;
    }
  }
</style>
