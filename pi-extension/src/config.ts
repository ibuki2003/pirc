import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export function config(): { url?: string; disabled: boolean } {
  let settings: { host?: string } = {};
  try {
    settings = JSON.parse(readFileSync(join(getAgentDir(), "pirc.json"), "utf8"));
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const host = settings.host ?? "ws://localhost:8787";
  const url = `${host}/api/host`;
  if (!["ws:", "wss:"].includes(new URL(url).protocol)) throw new Error("pirc.json host must use ws: or wss:");
  return { url, disabled: ["1", "true"].includes(process.env.PIRC_DISABLE?.toLowerCase() ?? "") };
}
