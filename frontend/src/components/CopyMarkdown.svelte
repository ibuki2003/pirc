<script lang="ts">
  import { onDestroy } from "svelte";
  import IconButton, { Icon } from "@smui/icon-button";
  import { mdiCheck, mdiContentCopy } from "@mdi/js";

  let { text }: { text: string } = $props();
  let copied = $state(false);
  let error = $state("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(timer));

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      error = "";
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => copied = false, 1500);
    } catch (e) {
      error = `コピーできませんでした: ${String(e)}`;
    }
  }
</script>

<span class="copy-markdown">
  <IconButton onclick={copy} aria-label={copied ? "コピーしました" : "元の Markdown をコピー"}
    title={error || (copied ? "コピーしました" : "元の Markdown をコピー")}>
    <Icon tag="svg" viewBox="0 0 24 24"><path d={copied ? mdiCheck : mdiContentCopy} /></Icon>
  </IconButton>
  {#if error}<span class="copy-error" role="alert">{error}</span>{/if}
</span>

<style lang="scss">
  .copy-markdown {
    float: right;
    position: relative;
    margin-left: .25rem;
    :global(.mdc-icon-button) {
      width: 28px;
      height: 28px;
      padding: 6px;
      opacity: .4;
      --mdc-icon-button-size: 28px;
      --mdc-icon-size: 16px;
      &:hover, &:focus-visible { opacity: 1; }
    }
    :global(svg) { width: 16px; height: 16px; }
  }
  .copy-error {
    position: absolute;
    right: 0;
    top: 100%;
    width: max-content;
    max-width: 240px;
    font-size: .75rem;
    background: var(--mdc-theme-surface, white);
    padding: .25rem;
    z-index: 1;
  }
</style>
