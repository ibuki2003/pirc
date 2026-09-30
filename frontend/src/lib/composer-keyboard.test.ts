import { expect, it } from "vitest";
import { enterMode } from "./composer-keyboard.ts";

it("keeps mobile Enter as a newline, even when completion suggestions exist", () => {
  expect(enterMode({ isComposing: false, keyCode: 13 }, true)).toBe("newline");
});

it("allows desktop Enter shortcuts but never intercepts IME confirmation", () => {
  expect(enterMode({ isComposing: false, keyCode: 13 }, false)).toBe("shortcut");
  expect(enterMode({ isComposing: true, keyCode: 13 }, false)).toBe("composition");
  expect(enterMode({ isComposing: false, keyCode: 229 }, false)).toBe("composition");
});
