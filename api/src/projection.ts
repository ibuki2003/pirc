import type { SessionEntry } from "./pi.ts";
export interface StreamOptions {
  thinking: boolean;
  maxTextBytes: number;
  toolOutputBytes: number;
}
export interface Trim {
  path: (string | number)[];
  kind: "text" | "json" | "image";
  originalBytes: number;
  mimeType?: string;
}
export interface ProjectedEntry {
  index: number;
  entry: SessionEntry;
  trims?: Trim[];
}
export const MOBILE_STREAM: StreamOptions = { thinking: false, maxTextBytes: 2048, toolOutputBytes: 2048 };
export const FULL_STREAM: StreamOptions = { thinking: true, maxTextBytes: Number.MAX_SAFE_INTEGER, toolOutputBytes: Number.MAX_SAFE_INTEGER };
