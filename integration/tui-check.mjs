/**
 * Real pi TUI ↔ extension ↔ Deno server smoke test without an LLM provider.
 * Run: node integration/tui-check.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const runtime = resolve(import.meta.dirname, ".runtime");
await mkdir(runtime, { recursive: true });
const requests = [];
const mock = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  requests.push({ url: req.url, body });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const id = "mock-response";
  const model = body.model;
  const event = (delta, finish_reason = null) => ({ id, object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason }] });
  res.write(`data: ${JSON.stringify(event({ role: "assistant" }))}\n\n`);
  res.write(`data: ${JSON.stringify(event({ content: "MOCK_REPLY_OK" }))}\n\n`);
  res.write(`data: ${JSON.stringify(event({}, "stop"))}\n\n`);
  res.end("data: [DONE]\n\n");
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const modelPort = mock.address().port;
await writeFile(resolve(runtime, "models.json"), JSON.stringify({
  providers: { "pirc-mock": {
    baseUrl: `http://127.0.0.1:${modelPort}/v1`,
    api: "openai-completions", apiKey: "local-only",
    models: [
      { id: "test-model", contextWindow: 8192, maxTokens: 512 },
      { id: "test-model-alt", contextWindow: 8192, maxTokens: 512 },
    ],
  } },
}));

const serverPort = 18000 + Math.floor(Math.random() * 25000);
const url = `http://127.0.0.1:${serverPort}`;
const children = [];
const output = { pi: "", server: "" };
function run(name, cmd, args, env) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => {
    output[name] = (output[name] + data.toString()).slice(-100000);
  });
  return child;
}
async function until(fn, label, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) { last = err; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for ${label}: ${last?.message ?? ""}`);
}
const server = run("server", "deno", ["task", "--config", "server/deno.json", "start"], {
  PIRC_PORT: String(serverPort), PIRC_STATIC_DIR: resolve(root, "frontend/dist"),
});
let pi;
let socket;
try {
  await until(async () => (await fetch(`${url}/api/sessions`)).ok, "server");
  // script(1) gives the actual interactive pi process a PTY.
  pi = run("pi", "script", ["-q", "-f", "-c",
    `pi --offline --no-extensions -e ${resolve(root, "pi-extension/src/index.ts")} --provider pirc-mock --model test-model --session-dir ${resolve(runtime, "sessions")} --no-context-files`,
    "/dev/null"], {
    PI_CODING_AGENT_DIR: runtime,
    PIRC_URL: `ws://127.0.0.1:${serverPort}/api/host`,
    TERM: "xterm-256color",
  });
  const instance = await until(async () => {
    const response = await fetch(`${url}/api/sessions`);
    return (await response.json())[0];
  }, "host registration", 30000);
  assert.equal(instance.model?.id, "test-model");
  const notices = [];
  socket = new WebSocket(`ws://127.0.0.1:${serverPort}/api/ws`, { headers: { Origin: url } });
  socket.binaryType = "arraybuffer";
  await once(socket, "open");
  let next = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const data = typeof event.data === "string" ? event.data : gunzipSync(Buffer.from(event.data)).toString();
    const msg = JSON.parse(data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else notices.push(msg);
  });
  function rpc(method, params) {
    const id = ++next;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }
  const stream = { thinking: true, maxTextBytes: 2048, toolOutputBytes: 2048 };
  await rpc("sessions.subscribe", {});
  await rpc("session.attach", { instanceId: instance.instanceId, stream });
  const before = await (await fetch(`${url}/api/sessions/${instance.instanceId}/sync`)).json();
  assert.equal(before.state.instanceId, instance.instanceId);
  await until(() => output.pi.includes("1 viewers"), "TUI viewer status");
  const accepted = await rpc("session.prompt", { instanceId: instance.instanceId, text: "PIRC_MOCK_TEST_PROMPT" });
  assert.ok(accepted.requestId);
  await until(() => requests.length > 0, "mock API request", 30000);
  assert.equal(requests[0].url, "/v1/chat/completions");
  assert.equal(requests[0].body.model, "test-model");
  assert.ok(requests[0].body.messages.some(m => JSON.stringify(m).includes("PIRC_MOCK_TEST_PROMPT")), "mock API request includes browser input");
  const after = await until(async () => {
    const snapshot = await (await fetch(`${url}/api/sessions/${instance.instanceId}/sync?since=${before.entryCount}`)).json();
    return snapshot.entries.some(e => JSON.stringify(e).includes("MOCK_REPLY_OK")) ? snapshot : undefined;
  }, "assistant entry", 30000);
  assert.ok(after.entries.some(e => JSON.stringify(e).includes("PIRC_MOCK_TEST_PROMPT")));
  assert.ok(notices.some(n => n.method === "session.ops"), "browser receives sync ops");
  await until(() => output.pi.includes("MOCK_REPLY_OK"), "TUI displays mock response");
  const name = "remote-name-smoke";
  await rpc("session.setName", { instanceId: instance.instanceId, name });
  await until(async () => (await (await fetch(`${url}/api/sessions/${instance.instanceId}/sync`)).json()).state.name === name, "remote name reflected in pi state");
  assert.deepEqual(await rpc("session.setModel", { instanceId: instance.instanceId, provider: "pirc-mock", id: "test-model-alt" }), { ok: true });
  await until(async () => (await (await fetch(`${url}/api/sessions/${instance.instanceId}/sync`)).json()).state.model?.id === "test-model-alt", "remote model change");
  await rpc("session.prompt", { instanceId: instance.instanceId, text: "PIRC_SECOND_PROMPT" });
  await until(() => requests.length >= 2, "second mock API request", 30000);
  assert.equal(requests[1].body.model, "test-model-alt");
  assert.ok(requests[1].body.messages.some(m => JSON.stringify(m).includes("PIRC_SECOND_PROMPT")));
  await until(() => output.pi.includes("test-model-alt"), "TUI displays changed model");
  console.log(JSON.stringify({
    result: "PASS", instanceId: instance.instanceId,
    mockRequest: { url: requests[0].url, model: requests[0].body.model, messageCount: requests[0].body.messages.length },
    entryCount: after.entryCount, operations: notices.filter(n => n.method === "session.ops").length,
    tuiViewerStatus: true, tuiAnswer: true, remoteName: name, switchedModel: requests[1].body.model,
  }, null, 2));
} catch (error) {
  console.error(error, "\nserver output:", output.server.slice(-4000), "\npi output:", output.pi.slice(-5000));
  process.exitCode = 1;
} finally {
  socket?.close();
  pi?.stdin.end();
  for (const child of children.reverse()) child.kill("SIGTERM");
  mock.close();
}
