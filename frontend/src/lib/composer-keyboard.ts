export function enterMode(event: Pick<KeyboardEvent, "isComposing" | "keyCode">, coarsePointer: boolean):
  "composition" | "newline" | "shortcut" {
  if (event.isComposing || event.keyCode === 229) return "composition";
  return coarsePointer ? "newline" : "shortcut";
}
