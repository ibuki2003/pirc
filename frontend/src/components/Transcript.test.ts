import { expect, test } from "vitest";
import { render } from "svelte/server";
import type { ProjectedEntry, ToolProgress } from "@pirc/api";
import Transcript from "./Transcript.svelte";

test("a finalized tool call with running progress is shown in a single details", () => {
  const entries = [{
    index: 0,
    entry: {
      type: "message", id: "assistant", parentId: null, timestamp: "",
      message: { role: "assistant", content: [
        { type: "toolCall", id: "bash-call", name: "bash", arguments: { command: "echo hello" } },
      ] },
    },
  }] as unknown as ProjectedEntry[];
  const tools = new Map<string, ToolProgress>([["bash-call", {
    toolName: "bash", startedAt: 0, command: "echo hello", output: "running", totalBytes: 7, truncatedHead: false,
  }]]);
  const { body } = render(Transcript, { props: {
    entries, tools, live: null, streaming: true, instanceId: "instance",
    expand: async () => {}, loadMore: async () => {}, hasMore: false,
  } });
  expect(body.match(/<details class="tool"/g)).toHaveLength(1);
  expect(body).toContain("echo hello");
  expect(body).toContain("実行中");
  expect(body).toContain("running");
  const overlapping = render(Transcript, { props: {
    entries, tools, live: { provider: "p", model: "m", startedAt: 0,
      content: [{ type: "toolCall", id: "bash-call", name: "bash" }] },
    streaming: true, instanceId: "instance",
    expand: async () => {}, loadMore: async () => {}, hasMore: false,
  } }).body;
  expect(overlapping.match(/<details class="tool"/g)).toHaveLength(1);
});
