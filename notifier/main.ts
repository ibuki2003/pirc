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
// https://docs.ntfy.sh/publish/#attach-local-file
const MAX_MESSAGE_BYTES = 4096;

function notificationText(text: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= MAX_MESSAGE_BYTES) return text;
  const suffix = "…";
  const budget = MAX_MESSAGE_BYTES - encoder.encode(suffix).length;
  let bytes = 0;
  let result = "";
  for (const character of text) {
    const length = encoder.encode(character).length;
    if (bytes + length > budget) break;
    result += character;
    bytes += length;
  }
  return result + suffix;
}

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
    return notificationText(text);
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
  const seconds = (name: string, fallback: number): number => {
    const value = Number(Deno.env.get(name) ?? fallback);
    if (!Number.isFinite(value) || value < 0 || value * 1000 > 2147483647) {
      throw new Error(`${name} must be between 0 and 2147483.647 seconds`);
    }
    return value;
  };
  const timings = {
    activityWindowSeconds: seconds("PIRC_NOTIFY_ACTIVE_SECONDS", 10),
    delaySeconds: seconds("PIRC_NOTIFY_DELAY_SECONDS", 30),
  };

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
      void peer!.request("sessions.subscribeCompletions", timings).catch(error => {
        console.error("Completion subscription failed:", error);
        peer!.close();
      });
    } else console.log(`pirc: ${status}`);
  };
  client.start();
}
