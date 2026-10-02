import type { SessionListing, SessionState, SessionSummary, SyncOp } from "@pirc/api";

export function sessionListing(summary: SessionSummary): SessionListing {
  const { messagePreview: _, ...listing } = summary;
  return listing;
}
export function listingKey(summary: SessionSummary): string {
  const { lastActivityAt: _, ...listing } = sessionListing(summary);
  return JSON.stringify(listing);
}

export function initialSummary(
  state: SessionState,
  entryCount: number,
): SessionSummary {
  const now = new Date().toISOString();
  return {
    instanceId: state.instanceId,
    hostId: state.hostId,
    hostname: state.hostname,
    sessionId: state.sessionId,
    cwd: state.cwd,
    name: state.name,
    messagePreview: state.messagePreview,
    model: state.model,
    status: state.status,
    connectedAt: now,
    lastActivityAt: now,
    entryCount,
  };
}
export function updateSummary(
  summary: SessionSummary,
  ops: SyncOp[],
): SessionSummary {
  const next = { ...summary };
  for (const op of ops) {
    if (op.op === "set" && op.target === "state") {
      const s = op.value;
      Object.assign(next, {
        hostname: s.hostname,
        cwd: s.cwd,
        name: s.name,
        messagePreview: s.messagePreview,
        model: s.model,
        status: s.status,
      });
    }
    if (op.op === "append" && op.target === "entries") {
      next.entryCount = op.from + op.items.length;
    }
  }
  if (listingKey(next) !== listingKey(summary)) next.lastActivityAt = new Date().toISOString();
  return next;
}

// Inspect every state operation: sessions.changed is debounced and can skip brief runs.
export function completions(summary: SessionSummary, ops: SyncOp[]): Pick<SessionSummary, "instanceId" | "hostname" | "cwd" | "name">[] {
  let streaming = summary.status.streaming;
  const result: Pick<SessionSummary, "instanceId" | "hostname" | "cwd" | "name">[] = [];
  for (const op of ops) {
    if (op.op !== "set" || op.target !== "state") continue;
    const state = op.value;
    if (streaming && !state.status.streaming) {
      result.push({ instanceId: summary.instanceId, hostname: state.hostname, cwd: state.cwd, name: state.name });
    }
    streaming = state.status.streaming;
  }
  return result;
}
