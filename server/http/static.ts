import { serveDir } from "@std/http/file-server";

export async function staticFile(req: Request, dir: string): Promise<Response> {
  const response = await serveDir(req, { fsRoot: dir, quiet: true });
  if (response.status !== 404 || new URL(req.url).pathname.includes(".")) {
    return response;
  }
  return serveDir(new Request(new URL("/index.html", req.url), req), {
    fsRoot: dir,
    quiet: true,
  });
}
