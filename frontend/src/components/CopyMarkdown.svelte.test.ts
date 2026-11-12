// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import CopyMarkdown from "./CopyMarkdown.svelte";

test("copies the original Markdown and reports success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const target = document.createElement("div");
  const text = "**bold**\n\n[PDF](./report.pdf)";
  const component = mount(CopyMarkdown, { target, props: { text } });
  try {
    flushSync();
    target.querySelector("button")!.click();
    await tick();
    expect(writeText).toHaveBeenCalledWith(text);
    expect(target.querySelector("button")!.getAttribute("aria-label")).toBe("コピーしました");
  } finally {
    await unmount(component);
    if (previous) Object.defineProperty(navigator, "clipboard", previous);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
