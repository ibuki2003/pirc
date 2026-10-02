// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import type { SessionSummary } from "@pirc/api";

const { items, starts, stops, request } = vi.hoisted(() => ({
  items: ["a", "b"].map(id => ({
    instanceId: id, hostId: id, hostname: `host-${id}`, sessionId: `session-${id}`,
    cwd: `/work/project-${id}`, status: { streaming: false, compacting: false, pendingMessages: false },
    connectedAt: "", lastActivityAt: "", entryCount: 0,
  })) as SessionSummary[],
  starts: vi.fn(),
  stops: vi.fn(),
  request: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/sessions.svelte.ts", () => ({ sessions: { items, error: "" } }));
vi.mock("../lib/connection.svelte.ts", () => ({
  connection: { status: "connected", peer: { request } },
}));
vi.mock("../lib/mirror/mirror-store.svelte.ts", () => ({
  MirrorStore: class {
    constructor(readonly instanceId: string) {}
    get mirror() {
      return { hasMoreBefore: false };
    }
    get runtime() {
      return {
        state: { ...items.find(item => item.instanceId === this.instanceId), availableThinkingLevels: [] },
        live: null, tools: new Map(), toolDurations: new Map(), calls: new Map(),
      };
    }
    branch = [];
    closed = false;
    error = "";
    notices = [];
    start() { starts(this.instanceId); }
    stop() { stops(this.instanceId); }
  },
}));

import GodMode from "./GodMode.svelte";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

test("columns have independent composers and keep their subscriptions and drafts when moved", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const target = document.createElement("div");
  document.body.append(target);
  const component = mount(GodMode, { target });
  const click = async (element: Element | null) => {
    expect(element).not.toBeNull();
    (element as HTMLElement).click();
    flushSync();
    await tick();
  };
  const columns = () => [...target.querySelectorAll<HTMLElement>(".god-column")];
  try {
    flushSync();
    await click(target.querySelector('[aria-label="セッションを追加"]'));
    const options = [...document.querySelectorAll<HTMLButtonElement>(".session-options button")];
    expect(options).toHaveLength(2);
    await click(options[0]);
    expect(options[0].disabled).toBe(true);
    await click(options[1]);
    expect(options[1].disabled).toBe(true);
    expect(starts.mock.calls).toEqual([["a"], ["b"]]);
    expect(columns().map(column => column.querySelector(".column-heading")?.textContent))
      .toEqual(["project-a@host-a", "project-b@host-b"]);
    expect(columns().every(column => column.querySelector(".transcript") && column.querySelector(".composer"))).toBe(true);

    const editor = columns()[0].querySelector("textarea")!;
    editor.value = "draft for a";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(columns()[1].querySelector("textarea")?.value).toBe("");
    expect(columns()[0].querySelector<HTMLButtonElement>('[aria-label="左へ移動"]')?.disabled).toBe(true);
    await click(columns()[0].querySelector('[aria-label="右へ移動"]'));
    expect(columns()[1].querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe("draft for a");
    expect(starts).toHaveBeenCalledTimes(2);
    expect(stops).not.toHaveBeenCalled();

    await click(columns()[1].querySelector('[aria-label="カラムを閉じる"]'));
    expect(columns()).toHaveLength(1);
    expect(stops.mock.calls).toEqual([["a"]]);
    expect(options[0].disabled).toBe(false);
    await click(options[0]);
    expect(columns()).toHaveLength(2);
    expect(columns()[1].querySelector("textarea")?.value).toBe("");
  } finally {
    await unmount(component);
  }
  expect(stops.mock.calls).toEqual([["a"], ["b"], ["a"]]);
});
