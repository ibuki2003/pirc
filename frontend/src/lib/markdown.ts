import { Marked } from "marked";
import DOMPurify from "dompurify";

const marked = new Marked({
  renderer: {
    html: ({ text }) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  },
});

export function markdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }) as string);
}
