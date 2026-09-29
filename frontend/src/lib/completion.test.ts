import { describe, expect, it } from "vitest";
import { completionToken, matchingCommands } from "./completion.ts";

describe("completionToken", () => {
  it("recognizes only the leading slash command", () => {
    expect(completionToken("/test arg", 3)).toEqual({ kind: "command", start: 0, end: 5, prefix: "te" });
    expect(completionToken("hello /test", 11)).toBeUndefined();
    expect(completionToken("/test arg", 9)).toBeUndefined();
  });
  it("recognizes a path after whitespace but not inside a word", () => {
    expect(completionToken("look @src/foo end", 12)).toEqual({ kind: "path", start: 5, end: 13, prefix: "src/fo" });
    expect(completionToken("mail@example.com", 16)).toBeUndefined();
    expect(completionToken("@", 1)).toEqual({ kind: "path", start: 0, end: 1, prefix: "" });
    expect(completionToken("/command @src", 13)?.kind).toBe("path");
  });
  it("ranks prefix command matches first", () => {
    expect(matchingCommands([{ name: "abc" }, { name: "cab" }], "ab").map(c => c.name)).toEqual(["abc", "cab"]);
  });
});
