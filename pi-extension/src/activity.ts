import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function watchTerminalActivity(ui: Pick<ExtensionContext["ui"], "onTerminalInput">, report: () => void): () => void {
  let lastSent = -Infinity;
  return ui.onTerminalInput(data => {
    // Terminal replies and focus reports are not user interaction.
    if (!data || /^\x1b\[(?:[\d;?]*[cnRt]|\?\d+u|[IO])$/.test(data) || data.startsWith("\x1b]")) return;
    const now = Date.now();
    if (now - lastSent < 5000) return;
    lastSent = now;
    report();
    return undefined;
  });
}
