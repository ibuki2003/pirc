// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { http } from "./http.ts";

afterEach(() => vi.unstubAllGlobals());

it("calls browser fetch with Window as its receiver", async () => {
  const fetcher = vi.fn(function (this: Window) {
    if (this !== window) throw new TypeError("Invalid fetch receiver");
    return Promise.resolve(new Response("[]", { headers: { "content-type": "application/json" } }));
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await http.listSessions()).toEqual([]);
  expect(fetcher).toHaveBeenCalledOnce();
});
