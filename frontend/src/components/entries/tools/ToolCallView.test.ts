// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import ToolCallView from "./ToolCallView.svelte";

test("details subscribe per call only while expanded", async () => {
  const target = document.createElement("div");
  const subscribeTool = vi.fn();
  const component = mount(ToolCallView, { target, props: {
    instanceId: "session", subscribeTool,
    display: { calls: [{ id: "patch", name: "apply_patch", results: [] }], failed: false },
  } });
  try {
    flushSync();
    const details = target.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    await tick();
    expect(subscribeTool).toHaveBeenLastCalledWith(["patch"], true);
    details.open = false;
    details.dispatchEvent(new Event("toggle"));
    await tick();
    expect(subscribeTool).toHaveBeenLastCalledWith(["patch"], false);
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    await tick();
  } finally {
    await unmount(component);
    target.remove();
  }
  expect(subscribeTool).toHaveBeenLastCalledWith(["patch"], false);
});
