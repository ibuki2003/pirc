import { expect, test } from "vitest";
import { decodeFrame, encodeFrame } from "./codec.ts";

test("large JSON stays text so WebSocket compression can reuse its dictionary", async () => {
  const message = { jsonrpc: "2.0", method: "session.ops", params: { text: "日本語".repeat(2000) } };
  const frame = await encodeFrame(message, true);
  expect(typeof frame).toBe("string");
  expect(await decodeFrame(frame)).toEqual(message);
});

test("connections without WebSocket compression retain large-message gzip", async () => {
  const message = { text: "日本語".repeat(2000) };
  const frame = await encodeFrame(message);
  expect(frame).toBeInstanceOf(Uint8Array);
  expect(await decodeFrame(frame)).toEqual(message);
});

test("legacy gzip frames remain readable", async () => {
  const message = { jsonrpc: "2.0", method: "session.ops", params: { ops: [] } };
  const frame = await new Response(
    new Blob([JSON.stringify(message)]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  expect(await decodeFrame(frame)).toEqual(message);
});
