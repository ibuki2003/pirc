// @vitest-environment jsdom
import { expect, test } from "vitest";
import { markdown } from "./markdown.ts";

test("a single line break renders as br without changing fenced code", () => {
  expect(markdown("first\nsecond")).toContain("first<br>second");
  expect(markdown("```\nfirst\nsecond\n```")).not.toContain("<br>");
});

test("inline HTML is escaped while Markdown still renders", () => {
  const html = markdown('**bold** <em>not italic</em> <img src="x" onerror="alert(1)">');
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain("&lt;em&gt;not italic&lt;/em&gt;");
  expect(html).toContain('&lt;img src="x" onerror="alert(1)"&gt;');
  expect(html).not.toContain("<em>");
  expect(html).not.toContain("<img");
});

test("HTML blocks and entities are displayed literally", () => {
  const html = markdown("<div>&amp;</div>\n\n<script>alert(1)</script>");
  expect(html).toContain("&lt;div&gt;&amp;amp;&lt;/div&gt;");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).not.toContain("<script");
});

test("HTML in code is escaped once and Markdown links are sanitized", () => {
  expect(markdown("`<div>`")).toContain("<code>&lt;div&gt;</code>");
  expect(markdown("```html\n<div>\n```")).toContain("&lt;div&gt;");
  expect(markdown("[unsafe](javascript:alert(1))")).not.toContain('href="javascript:');
});

test("local links and images are proxied with their original paths in titles", () => {
  const container = document.createElement("div");
  container.innerHTML = markdown('[PDF](/tmp/a%20b.pdf#page=2 "資料") ![画像](./out.png)', "i");
  const link = container.querySelector("a")!;
  expect(link.getAttribute("href")).toBe("/api/sessions/i/file?path=%2Ftmp%2Fa%20b.pdf#page=2");
  expect(link.title).toBe("資料\n/tmp/a b.pdf");
  expect(link.target).toBe("_blank");
  const image = container.querySelector("img")!;
  expect(image.getAttribute("src")).toBe("/api/sessions/i/file?path=.%2Fout.png");
  expect(image.title).toBe("./out.png");
});

test("URLs, anchors, plain paths and code are not rewritten", () => {
  const text = "[web](https://example.com/a.pdf) ![remote](//example.com/a.png) [anchor](#section) `/tmp/a.pdf` /tmp/b.pdf";
  expect(markdown(text, "i")).toBe(markdown(text));
});
