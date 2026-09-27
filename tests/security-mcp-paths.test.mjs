// Path arguments over MCP (WP1 b). Released 1.6.0 read any file named by workflowPath,
// packetPath or file, and a JSON parse failure echoed the first characters of the file back to
// the model ("FAKE_SECRE"...). Paths now resolve inside the state folder, workflows and packets
// can be passed inline, and failures carry a fixed detail with no file bytes and no built path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "../src/mcp.mjs";

const PLANTED = "FAKE_SECRET_VALUE_0123456789";

function layout() {
  const root = mkdtempSync(join(tmpdir(), "learn-mcp-paths-"));
  const state = join(root, "state");
  mkdirSync(state);
  const secret = join(root, "secret.txt");
  writeFileSync(secret, PLANTED + "\n");
  return { root, state, secret };
}

const call = (name, args, dir, id = 1) =>
  handle({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, { dir });

function failure(res) {
  assert.equal(res.error, undefined, "a tool failure must not be a JSON-RPC protocol error");
  assert.equal(res.result.isError, true);
  return res.result.structuredContent;
}

// Nothing from the file and no path the server built may reach the model.
function assertNoLeak(res, ...paths) {
  const wire = JSON.stringify(res);
  assert.ok(!wire.includes("FAKE_SECRE"), "file bytes leaked into the reply");
  for (const p of paths) assert.ok(!wire.includes(JSON.stringify(p).slice(1, -1)), "a built path leaked into the reply");
}

const WORKFLOW = { adapter: "fake", course: "c", steps: [{ kind: "navigate", target: "x" }, { kind: "assess", label: "q" }] };

test("learn_tutor_prooflesson: packetPath to a text file outside the state folder returns INVALID_ARGUMENT with no file bytes", async () => {
  const { state, secret } = layout();
  const res = await call("learn_tutor_prooflesson", { packetPath: secret }, state);
  assert.equal(failure(res).code, "INVALID_ARGUMENT");
  assertNoLeak(res, secret);
});

test("learn_tutor_prooflesson: a non-JSON file inside the state folder returns a fixed detail with no file bytes", async () => {
  const { state } = layout();
  writeFileSync(join(state, "notes.txt"), PLANTED);
  const res = await call("learn_tutor_prooflesson", { packetPath: "notes.txt" }, state);
  const sc = failure(res);
  assert.equal(sc.code, "INVALID_ARGUMENT");
  assert.match(sc.detail, /not valid JSON/);
  assertNoLeak(res, join(state, "notes.txt"));
});

test("learn_dry_run: workflowPath outside the state folder is refused; inline and inside-folder workflows run", async () => {
  const { root, state, secret } = layout();
  writeFileSync(join(root, "wf.json"), JSON.stringify(WORKFLOW));
  for (const p of [secret, join(root, "wf.json"), "../wf.json"]) {
    const res = await call("learn_dry_run", { workflowPath: p }, state);
    assert.equal(failure(res).code, "INVALID_ARGUMENT", p);
    assertNoLeak(res, p);
  }
  const inline = await call("learn_dry_run", { workflow: WORKFLOW }, state);
  assert.equal(JSON.parse(inline.result.content[0].text).status, "halted-assess");
  mkdirSync(join(state, "workflows"));
  writeFileSync(join(state, "workflows", "wf.json"), JSON.stringify(WORKFLOW));
  const inside = await call("learn_dry_run", { workflowPath: "workflows/wf.json" }, state);
  assert.equal(JSON.parse(inside.result.content[0].text).status, "halted-assess");
});

test("learn_dry_run: a non-JSON workflow file gives a fixed detail, never its first characters", async () => {
  const { state } = layout();
  writeFileSync(join(state, "bad.json"), PLANTED);
  const res = await call("learn_dry_run", { workflowPath: "bad.json" }, state);
  assert.equal(failure(res).code, "INVALID_ARGUMENT");
  assertNoLeak(res, join(state, "bad.json"));
});

test("learn_tutor_reverify: file outside the state folder is refused; a malformed receipt inside yields no file bytes", async () => {
  const { state, secret } = layout();
  const out = await call("learn_tutor_reverify", { sessionId: "s1", file: secret }, state);
  assert.equal(failure(out).code, "INVALID_ARGUMENT");
  assertNoLeak(out, secret);
  writeFileSync(join(state, "r.json"), PLANTED);
  const inside = await call("learn_tutor_reverify", { sessionId: "s1", file: "r.json" }, state);
  assert.equal(inside.result.isError, undefined);
  assert.equal(JSON.parse(inside.result.content[0].text).results[0].verdict, "UNVERIFIED");
  assertNoLeak(inside);
});

test("learn_verify on a missing run returns NOT_FOUND without the path the server built", async () => {
  const { state } = layout();
  const res = await call("learn_verify", { runId: "nosuch" }, state);
  assert.equal(failure(res).code, "NOT_FOUND");
  assertNoLeak(res, join(state, "runs", "nosuch.json"), state);
});

test("an unknown tool is a JSON-RPC -32602 error; a missing session is NOT_FOUND", async () => {
  const { state } = layout();
  const unknown = await call("learn_nope", {}, state);
  assert.equal(unknown.error.code, -32602);
  const missing = await call("learn_tutor_mastery", { sessionId: "nosuch" }, state);
  assert.equal(failure(missing).code, "NOT_FOUND");
});

test("a failure the server did not anticipate is INTERNAL with a fixed detail", async () => {
  const { state } = layout();
  mkdirSync(join(state, "tutor"));
  writeFileSync(join(state, "tutor", "s1.json"), PLANTED); // a corrupted session file
  const res = await call("learn_tutor_mastery", { sessionId: "s1" }, state);
  assert.equal(failure(res).code, "INTERNAL");
  assertNoLeak(res, join(state, "tutor", "s1.json"));
});
