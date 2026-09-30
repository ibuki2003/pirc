import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import type { HttpClient, ProjectedEntry, SessionSnapshot } from "@pirc/api";
import { assistantText, lastAssistantMessage, notify, title } from "./main.ts";

const completion = { instanceId: "i", hostname: "host", cwd: "/work/project/" };
const entry = (id: string, parentId: string | null, role: "assistant" | "user", text: string): ProjectedEntry => ({
  index: 0,
  entry: { type: "message", id, parentId, timestamp: "", message: { role, content: [{ type: "text", text }] } } as ProjectedEntry["entry"],
});

Deno.test("notification title uses cwd basename and hostname", () => {
  assertEquals(title(completion), "[pi] ready (project@host)");
});

Deno.test("assistant text excludes non-text blocks and truncates by characters", () => {
  const item = entry("a", null, "assistant", "🙂".repeat(4001));
  if (item.entry.type !== "message" || item.entry.message.role !== "assistant") throw new Error("Invalid test entry");
  item.entry.message.content.push({ type: "toolCall", id: "t", name: "bash", arguments: {} });
  assertEquals(assistantText([item])?.length, 8000);
  assertEquals(Array.from(assistantText([item]) ?? "").length, 4000);
});

Deno.test("finds last assistant message across branch pages", async () => {
  const calls: string[] = [];
  const client = {
    getSync: async () => ({
      entries: [entry("tool", "a", "user", "later")],
      hasMoreBefore: true,
    } as SessionSnapshot),
    getBranch: async (_id: string, leaf: string) => {
      calls.push(leaf);
      return { entries: [entry("a", null, "assistant", "answer")], hasMoreBefore: false };
    },
  } as Pick<HttpClient, "getSync" | "getBranch">;
  assertEquals(await lastAssistantMessage(client, "i"), "answer");
  assertEquals(calls, ["a"]);
});

Deno.test("sends assistant text to ntfy and reports failed responses", async () => {
  const original = globalThis.fetch;
  let body: string | undefined;
  let titleHeader: string | null = null;
  const client = {
    getSync: async () => ({
      entries: [entry("a", null, "assistant", "answer")],
      hasMoreBefore: false,
    } as SessionSnapshot),
    getBranch: async () => { throw new Error("Unexpected pagination"); },
  } as Pick<HttpClient, "getSync" | "getBranch">;
  globalThis.fetch = (_url, init) => {
    body = init?.body as string;
    titleHeader = new Headers(init?.headers).get("Title");
    return Promise.resolve(new Response("", { status: 503 }));
  };
  try {
    await assertRejects(() => notify("topic", completion, client), Error, "HTTP 503");
    assertEquals(body, "answer");
    assertEquals(titleHeader, "[pi] ready (project@host)");
  } finally {
    globalThis.fetch = original;
  }
});
