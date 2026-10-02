// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import EntryView from "./EntryView.svelte";

test.each([
  [24 * 60 * 60 * 1000 - 1, "12:34:56", false],
  [24 * 60 * 60 * 1000, "2026-01-02 12:34:56", false],
  [24 * 60 * 60 * 1000 - 1, "12:34:56", true],
  [24 * 60 * 60 * 1000, "2026-01-02 12:34:56", true],
])("formats timestamps at age %i with heading placement", (age, expected, showHeader) => {
  const date = new Date(2026, 0, 2, 12, 34, 56);
  vi.spyOn(Date, "now").mockReturnValue(date.getTime() + age);
  const target = document.createElement("div");
  const component = mount(EntryView, { target, props: {
    item: { index: 0, entry: {
      id: "user", parentId: null, type: "message", timestamp: date.toISOString(),
      message: { role: "user", content: "質問", timestamp: date.getTime() },
    } },
    results: [], instanceId: "session", expand: async () => {},
    tools: new Map(), toolDurations: new Map(), showHeader,
  } });
  try {
    flushSync();
    const article = target.querySelector("article.entry")!;
    expect(article.firstElementChild?.tagName).toBe(showHeader ? "HEADER" : "SMALL");
    const timestamp = article.querySelector("small.entry-timestamp")!;
    expect(timestamp.textContent).toBe(expected);
    expect(timestamp.parentElement).toBe(showHeader ? article.firstElementChild : article);
  } finally {
    unmount(component);
    vi.restoreAllMocks();
  }
});
