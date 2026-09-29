export function allowedOrigin(req: Request, extra: Set<string>): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    return (url.host === new URL(req.url).host &&
      (url.protocol === "http:" || url.protocol === "https:")) ||
      extra.has(origin);
  } catch {
    return false;
  }
}
