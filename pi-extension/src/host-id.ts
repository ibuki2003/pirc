const KEY = Symbol.for("pirc.host");
type GlobalHost = { hostId: string; sessions: Map<string, { instanceId: string; seq: number }> };
export function host(): GlobalHost {
  const globals = globalThis as typeof globalThis & { [KEY]?: GlobalHost };
  return globals[KEY] ??= { hostId: crypto.randomUUID(), sessions: new Map() };
}
