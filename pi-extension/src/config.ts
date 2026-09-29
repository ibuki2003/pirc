export function config(): { url?: string; disabled: boolean } {
  const host = process.env.PIRC_HOST ?? "ws://localhost:8787";
  const url = `${host}/api/host`;
  if (url && !["ws:", "wss:"].includes(new URL(url).protocol)) throw new Error("PIRC_URL must use ws: or wss:");
  return { url, disabled: ["1", "true"].includes(process.env.PIRC_DISABLE?.toLowerCase() ?? "") };
}
