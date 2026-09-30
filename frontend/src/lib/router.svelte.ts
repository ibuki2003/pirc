class Router {
  hash = $state(location.hash);
  constructor() { window.addEventListener("hashchange", () => this.hash = location.hash); }
  get godMode(): boolean { return this.hash === "#/god"; }
  get instanceId(): string | null {
    const match = /^#\/s\/([^/]+)$/.exec(this.hash);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return null; }
  }
}
export const router = new Router();
