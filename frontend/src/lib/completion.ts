export type CompletionToken = { kind: "command" | "path"; start: number; end: number; prefix: string };

export function completionToken(text: string, cursor: number): CompletionToken | undefined {
  if (text.startsWith("/") && cursor > 0 && !/\s/.test(text.slice(0, cursor))) {
    const end = text.slice(cursor).search(/\s/);
    return { kind: "command", start: 0, end: end < 0 ? text.length : cursor + end, prefix: text.slice(1, cursor) };
  }
  const before = text.slice(0, cursor);
  const match = /(?:^|\s)@([^\s]*)$/.exec(before);
  if (!match) return;
  const start = cursor - match[1].length - 1;
  const endOffset = text.slice(cursor).search(/\s/);
  return { kind: "path", start, end: endOffset < 0 ? text.length : cursor + endOffset, prefix: match[1] };
}

export function matchingCommands(commands: { name: string; description?: string }[], prefix: string) {
  return commands.filter(command => command.name.toLowerCase().includes(prefix.toLowerCase()))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(prefix.toLowerCase())) -
      Number(!b.name.toLowerCase().startsWith(prefix.toLowerCase())) || a.name.localeCompare(b.name));
}
