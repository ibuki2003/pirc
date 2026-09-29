export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const COMPRESS_THRESHOLD = 4096;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encodeFrame(message: unknown): Promise<string | Uint8Array> {
  const json = JSON.stringify(message);
  const bytes = encoder.encode(json);
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error("RPC message too large");
  if (bytes.byteLength <= COMPRESS_THRESHOLD) return json;
  return new Uint8Array(await new Response(new Blob([Uint8Array.from(bytes).buffer]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}

export async function decodeFrame(data: string | Blob | ArrayBuffer | ArrayBufferView): Promise<unknown> {
  if (typeof data === "string") {
    if (encoder.encode(data).byteLength > MAX_MESSAGE_BYTES) throw new Error("RPC message too large");
    return JSON.parse(data);
  }
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) :
    data instanceof ArrayBuffer ? new Uint8Array(data) :
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error("RPC message too large");
  const output = await new Response(new Blob([Uint8Array.from(bytes).buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  if (output.byteLength > MAX_MESSAGE_BYTES) throw new Error("RPC message too large");
  return JSON.parse(decoder.decode(output));
}

/** Decode frames in arrival order, even when gzip decompression is asynchronous. */
export function orderedFrames(dispatch: (value: unknown) => void, onError: (error: unknown) => void): (data: string | Blob | ArrayBuffer | ArrayBufferView) => void {
  let pending: Promise<void> = Promise.resolve();
  return (data) => {
    pending = pending.then(async () => { dispatch(await decodeFrame(data)); }).catch(onError);
  };
}
