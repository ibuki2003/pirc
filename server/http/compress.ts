export function gzip(req: Request, response: Response): Response {
  if (!/\bgzip\b/i.test(req.headers.get("accept-encoding") ?? "")) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Encoding", "gzip");
  headers.append("Vary", "Accept-Encoding");
  headers.delete("Content-Length");
  return new Response(
    response.body?.pipeThrough(new CompressionStream("gzip")),
    { status: response.status, headers },
  );
}
export function json(req: Request, data: unknown): Response {
  return gzip(
    req,
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}
