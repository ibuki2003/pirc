// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import type { LiveMessage, ProjectedEntry, ToolProgress } from "@pirc/api";
import Transcript from "./Transcript.svelte";
import type { CachedToolObject } from "../lib/mirror/mirror-store.svelte.ts";

test("expanded bash survives live updates and history handoff, then loads the completed result", async () => {
  const call = { type: "toolCall" as const, id: "bash-1", name: "bash", arguments: { command: "echo done" } };
  const progress: ToolProgress = { toolName: "bash", startedAt: 1, output: "running", totalBytes: 7, truncatedHead: false };
  let live = $state<LiveMessage | null>({ provider: "p", model: "m", startedAt: 1, content: [call] });
  let entries = $state<ProjectedEntry[]>([]);
  const currentEntries = () => entries;
  let tools = $state(new Map([["bash-1", progress]]));
  const subscribeTool = vi.fn();
  const expand = vi.fn(async (id: string) => {
    if (id === "result") entries = entries.map(item => item.entry.id !== id ? item : {
      ...item, entry: {
        id, parentId: "assistant", timestamp: "", type: "message",
        message: { role: "toolResult", toolCallId: "bash-1", toolName: "bash",
          content: [{ type: "text", text: "done" }], isError: false, timestamp: 1 },
      },
    });
  });
  const target = document.createElement("div");
  const component = mount(Transcript, { target, props: {
    instanceId: "session", expand, subscribeTool,
    get entries() { return entries; }, get live() { return live; }, get tools() { return tools; },
    toolDurations: new Map(), hasMore: false, streaming: true, loadMore: async () => {},
  } });
  try {
    flushSync();
    const details = target.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    await tick();
    expect(subscribeTool).toHaveBeenLastCalledWith(["bash-1"], true);

    live = { provider: "p", model: "m", startedAt: 1, content: [{ ...call }] };
    tools = new Map([["bash-1", { ...progress, output: "updated" }]]);
    await tick();
    expect(target.querySelector("details")!.open).toBe(true);
    expect(target.textContent).toContain("updated");

    // message_end clears live before the finalized assistant entry is observed.
    live = null;
    await tick();
    expect(target.querySelector("details")!.open).toBe(true);
    expect(subscribeTool).toHaveBeenCalledTimes(1);

    entries = [{
      index: 0, entry: { id: "assistant", parentId: null, timestamp: "", type: "message",
        message: { role: "assistant", content: [call] } },
    } as unknown as ProjectedEntry];
    live = null;
    await tick();
    expect(target.querySelector("details")!.open).toBe(true);
    expect(subscribeTool).toHaveBeenCalledTimes(1);

    entries = [...currentEntries(), { index: 1, entry: {
      id: "result", parentId: "assistant", timestamp: "", type: "redacted",
      redacted: true, role: "toolResult", toolCallId: "bash-1", toolName: "bash", originalBytes: 4,
    } }];
    tools = new Map();
    await tick();
    await tick();
    expect(expand).toHaveBeenCalledWith("result");
    expect(target.querySelector("details")!.open).toBe(true);
    expect([...target.querySelectorAll("pre")].some(pre => pre.textContent === "done")).toBe(true);
    expect(subscribeTool).toHaveBeenCalledTimes(1);

    const completed = target.querySelector("details")!;
    completed.open = false;
    completed.dispatchEvent(new Event("toggle"));
    await tick();
    expect(subscribeTool).toHaveBeenLastCalledWith(["bash-1"], false);
    entries = currentEntries().map(item => item.entry.id === "result" ? { ...item, entry: {
      id: "result", parentId: "assistant", timestamp: "", type: "redacted",
      redacted: true, role: "toolResult", toolCallId: "bash-1", toolName: "bash", originalBytes: 4,
    } } : item);
    await tick();
    expect(expand).toHaveBeenCalledTimes(1);
    completed.open = true;
    completed.dispatchEvent(new Event("toggle"));
    await tick();
    await tick();
    expect(expand).toHaveBeenCalledTimes(2);
  } finally {
    await unmount(component);
  }
  expect(subscribeTool).toHaveBeenLastCalledWith(["bash-1"], false);
});

test("a subscribed patch retains its summary and merges the stable result without HTTP expansion", async () => {
  const call = { type: "toolCall" as const, id: "patch", name: "apply_patch", redacted: true as const,
    originalBytes: 100, changes: [{ path: "a.ts", added: 1, removed: 1 }] };
  const patch = "*** Begin Patch\n*** Update File: a.ts\n@@\n-old\n+new\n*** End Patch";
  let live = $state<LiveMessage | null>({ provider: "p", model: "m", startedAt: 1, content: [call] });
  let entries = $state<ProjectedEntry[]>([]);
  let objects = $state(new Map<string, CachedToolObject>());
  let active = $state(true);
  const expand = vi.fn(async () => {});
  const subscribeTool = vi.fn();
  const target = document.createElement("div");
  const component = mount(Transcript, { target, props: {
    instanceId: "i", expand, subscribeTool,
    get live() { return live; }, get entries() { return entries; }, get objects() { return objects; },
    canStreamTool: () => active, tools: new Map(), toolDurations: new Map(),
    hasMore: false, streaming: true, loadMore: async () => {},
  } });
  try {
    flushSync();
    const details = target.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    objects = new Map([["patch", { complete: false, revision: 1, value: {
      id: "patch", name: "apply_patch", arguments: { patch }, content: [],
    } }]]);
    await tick();
    expect(target.querySelector("summary")?.textContent).toContain("a.ts");
    expect(target.querySelector("summary")?.textContent).toContain("+1 -1");
    expect(target.querySelector(".patch-diff")).not.toBeNull();
    objects = new Map([["patch", { complete: true, revision: 2, value: {
      id: "patch", name: "apply_patch", arguments: { patch }, content: [
        { type: "text", text: "patched" }, { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
      ],
      result: { index: 1, id: "r", parentId: "a", timestamp: "", message: {
        role: "toolResult", toolName: "apply_patch", toolCallId: "patch", isError: false, timestamp: 1,
      } },
    } }]]);
    active = false;
    live = null;
    entries = [
      { index: 0, entry: { id: "a", parentId: null, timestamp: "", type: "message",
        message: { role: "assistant", content: [call] } } } as unknown as ProjectedEntry,
      { index: 1, entry: { id: "r", parentId: "a", timestamp: "", type: "redacted",
        redacted: true, role: "toolResult", toolCallId: "patch", originalBytes: 100 } },
    ];
    await tick();
    expect(target.querySelector("details")!.open).toBe(true);
    expect(target.querySelector("summary")?.textContent).toContain("a.ts");
    expect(target.querySelector("summary")?.textContent).toContain("+1 -1");
    expect(target.textContent).toContain("patched");
    expect(target.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,aW1hZ2U=");
    expect(expand).not.toHaveBeenCalled();
    expect(subscribeTool).toHaveBeenCalledTimes(1);
  } finally {
    await unmount(component);
  }
});
