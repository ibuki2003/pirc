import { Marked } from "marked";
import DOMPurify from "dompurify";

const marked = new Marked({
  renderer: {
    html: ({ text }) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  },
});

export function markdown(text: string, instanceId?: string): string {
  const html = marked.parse(text, { async: false, gfm: true, breaks: true }) as string;
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  if (instanceId) {
    for (const element of fragment.querySelectorAll("a[href], img[src]")) {
      const attribute = element.tagName === "A" ? "href" : "src";
      const path = element.getAttribute(attribute)!;
      if (!path || path.startsWith("#") || path.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(path)) continue;
      const hash = path.indexOf("#");
      const filename = hash === -1 ? path : path.slice(0, hash);
      let decoded: string;
      try { decoded = decodeURIComponent(filename); } catch { decoded = filename; }
      element.setAttribute(attribute, `/api/sessions/${encodeURIComponent(instanceId)}/file?path=${encodeURIComponent(decoded)}${hash === -1 ? "" : path.slice(hash)}`);
      const title = element.getAttribute("title");
      element.setAttribute("title", title ? `${title}\n${decoded}` : decoded);
      if (element.tagName === "A") {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener");
      }
    }
  }
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}
