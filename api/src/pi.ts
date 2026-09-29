export type { SessionEntry, SessionTreeNode } from "@earendil-works/pi-coding-agent";
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
