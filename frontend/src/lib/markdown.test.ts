// @vitest-environment jsdom
import { expect, test } from "vitest";
import { markdown } from "./markdown.ts";

test("a single line break renders as br without changing fenced code", () => {
  expect(markdown("first\nsecond")).toContain("first<br>second");
  expect(markdown("```\nfirst\nsecond\n```")).not.toContain("<br>");
});
