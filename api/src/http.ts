export const sessionsPath = "/api/sessions";
export function sessionPath(instanceId: string): string {
  return `${sessionsPath}/${encodeURIComponent(instanceId)}`;
}
export function entryPath(instanceId: string, entryId: string): string {
  return `${sessionPath(instanceId)}/entries/${encodeURIComponent(entryId)}`;
}
