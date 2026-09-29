export function config(): { url?: string; disabled: boolean } {
  const url = process.env.PIRC_URL;
  if (url && !["ws:", "wss:"].includes(new URL(url).protocol)) throw new Error("PIRC_URL must use ws: or wss:");
  return { url, disabled: ["1", "true"].includes(process.env.PIRC_DISABLE?.toLowerCase() ?? "") };
}
