import { entryPath, sessionPath, sessionsPath } from "../http.ts";
import type { SessionSummary } from "../model.ts";
import type { StreamOptions } from "../projection.ts";
import type { SessionSnapshot } from "../sync.ts";
import type { ProjectedEntry } from "../projection.ts";
import type { SessionEntry } from "../pi.ts";

function params(stream?: StreamOptions): URLSearchParams {
  const query = new URLSearchParams();
  if (stream) for (const [key, value] of Object.entries(stream)) query.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  return query;
}
export class HttpClient {
  constructor(private base = "", private fetcher: typeof fetch = fetch) {}
  private async get<T>(path: string): Promise<T> {
    const response = await this.fetcher(this.base + path);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    return response.json() as Promise<T>;
  }
  listSessions(): Promise<SessionSummary[]> { return this.get(sessionsPath); }
  getSync(instanceId: string, options: { since?: number; branchLimit?: number; stream?: StreamOptions } = {}): Promise<SessionSnapshot> {
    const query = params(options.stream);
    if (options.since !== undefined) query.set("since", String(options.since));
    query.set("branchLimit", String(options.branchLimit ?? 100));
    return this.get(`${sessionPath(instanceId)}/sync?${query}`);
  }
  getBranch(instanceId: string, leafId: string, limit = 100, stream?: StreamOptions): Promise<{ entries: ProjectedEntry[]; hasMoreBefore: boolean }> {
    const query = params(stream);
    query.set("leaf", leafId);
    query.set("limit", String(limit));
    return this.get(`${sessionPath(instanceId)}/branch?${query}`);
  }
  getEntry(instanceId: string, entryId: string): Promise<{ index: number; entry: SessionEntry }> {
    return this.get(entryPath(instanceId, entryId));
  }
  entryBlobUrl(instanceId: string, entryId: string, path: (string | number)[]): string {
    return `${this.base}${entryPath(instanceId, entryId)}/blob?path=${encodeURIComponent("/" + path.map(String).map(s => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/"))}`;
  }
}
