import { basename } from "node:path";
import {
  HttpClient,
  WsClient,
  type ClientToServer,
  type ProjectedEntry,
  type ServerToClient,
} from "@pirc/api";

type Completion = ServerToClient["notifications"]["session.completed"];
const PAGE_SIZE = 50;
const MAX_CHARS = 4000;

export function title(session: Completion): string {
  return `[pi] ready (${basename(session.cwd)}@${session.hostname})`;
}

export function assistantText(entries: ProjectedEntry[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i].entry;
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const text = entry.message.content
      .flatMap(block => block.type === "text" ? [block.text] : [])
      .join("\n").trim();
    return Array.from(text).slice(0, MAX_CHARS).join("");
  }
}

export async function lastAssistantMessage(client: Pick<HttpClient, "getSync" | "getBranch">, instanceId: string): Promise<string | undefined> {
  const snapshot = await client.getSync(instanceId, { branchLimit: PAGE_SIZE });
  let entries = snapshot.entries;
  let hasMore = snapshot.hasMoreBefore;
  while (entries.length) {
    const text = assistantText(entries);
    if (text !== undefined) return text;
    const parentId = entries[0].entry.parentId;
    if (!hasMore || !parentId) break;
    const page = await client.getBranch(instanceId, parentId, PAGE_SIZE);
    entries = page.entries;
    hasMore = page.hasMoreBefore;
  }
}

export async function notify(topic: string, session: Completion, client: Pick<HttpClient, "getSync" | "getBranch">): Promise<void> {
  const body = await lastAssistantMessage(client, session.instanceId) ?? "(assistant message unavailable)";
  const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: { "Title": title(session) },
    body,
  });
  if (!response.ok) throw new Error(`ntfy.sh: HTTP ${response.status}`);
}

if (import.meta.main) {
  const topic = Deno.env.get("NTFY_TOPIC");
  if (!topic || !/^[a-zA-Z0-9_-]+$/.test(topic)) {
    throw new Error("NTFY_TOPIC must be a nonempty ntfy topic (letters, digits, - or _)");
  }
  const url = new URL(Deno.env.get("PIRC_SERVER_URL") ?? "ws://localhost:8787/api/notify");
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("PIRC_SERVER_URL must be ws:// or wss://");
  const httpUrl = new URL(url);
  httpUrl.protocol = url.protocol === "wss:" ? "https:" : "http:";
  const http = new HttpClient(httpUrl.origin);

  const client = new WsClient<ServerToClient, ClientToServer>(url.href, {
    requests: { ping: () => ({}) },
    notifications: {
      "session.completed": session => {
        void notify(topic, session, http).catch(error => console.error("Notification failed:", error));
      },
    },
  });
  client.onStatus = (status, peer) => {
    if (status === "connected") {
      void peer!.request("sessions.subscribeCompletions", {}).catch(error => {
        console.error("Completion subscription failed:", error);
        peer!.close();
      });
    } else console.log(`pirc: ${status}`);
  };
  client.start();
}
