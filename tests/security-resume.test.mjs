// Resume authorization and attestation time (WP1 c and d). Released 1.6.0 passed
// allowIrreversible: true on every `learn resume`, so after a halt at `assess` a plain resume
// clicked the submit step and the cost step, and the receipt filed the submit under
// witnessedAutoSubmissions, a mode the user never chose. The attestation time was epoch zero.
// The fixture is the audit's resume-probe-workflow.json, copied unchanged; FakeDriver only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.mjs";
import { decide } from "../src/accountability/gate.mjs";
import { STEP_KINDS } from "../src/workflow/schema.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/resume-probe-workflow.json", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "learn-resume-"));
const saved = (dir, id) => JSON.parse(readFileSync(join(dir, "runs", id + ".json"), "utf8"));
const rows = (dir, id) => saved(dir, id).entries.map((e) => e.entry);
const clicked = (dir, id, sel) => rows(dir, id).some((e) => e.kind === "step" && e.summary === "clicked:" + sel);

test("a plain resume halts at the submit step, then at the cost step, and clicks neither", async () => {
  const dir = tmp();
  assert.match((await main(["run", FIXTURE, "--id", "r1"], { dir })).out, /halted-assess @step 1/);

  await main(["resume", "r1", "--attest", "did quiz 1 myself"], { dir });
  assert.equal(saved(dir, "r1").status, "halted-needs-human");
  assert.equal(saved(dir, "r1").haltedAt, 2, "halts at the submit step");

  await main(["resume", "r1"], { dir });
  assert.equal(saved(dir, "r1").haltedAt, 3, "halts at the cost step");
  assert.equal(clicked(dir, "r1", "#final-submit"), false);
  assert.equal(clicked(dir, "r1", "#pay"), false);
  const gates = rows(dir, "r1").filter((e) => e.kind === "human-gate");
  assert.deepEqual(gates.map((g) => g.seq), [1, 2, 3]);
  assert.match(gates[2].reason, /cost or irreversible/);

  await main(["receipt", "r1"], { dir });
  const receipt = JSON.parse(readFileSync(join(dir, "runs", "r1.receipt.json"), "utf8"));
  assert.deepEqual(receipt.witnessedAutoSubmissions, []);
  assert.deepEqual(receipt.manualSubmissions, [{ seq: 2 }]);

  await main(["resume", "r1"], { dir });
  assert.equal(saved(dir, "r1").status, "completed");
});

test("resume --submit witnessed-auto performs the submit and records the grant; the cost step still halts", async () => {
  const dir = tmp();
  await main(["run", FIXTURE, "--id", "r2"], { dir });
  await main(["resume", "r2", "--attest", "did quiz 1 myself", "--submit", "witnessed-auto"], { dir });
  const submit = rows(dir, "r2").find((e) => e.kind === "step" && e.stepKind === "submit");
  assert.equal(submit.submission, "witnessed-auto");
  assert.equal(submit.authorizedBy, "resume --submit witnessed-auto");
  assert.equal(saved(dir, "r2").haltedAt, 3);
  assert.equal(clicked(dir, "r2", "#pay"), false);
});

test("--allow-cost lets the engine perform a cost step it reaches, and the ledger records who allowed it", async () => {
  const dir = tmp();
  await main(["run", FIXTURE, "--id", "r3"], { dir });
  await main(["resume", "r3", "--attest", "did quiz 1 myself", "--submit", "witnessed-auto", "--allow-cost"], { dir });
  assert.equal(saved(dir, "r3").status, "completed");
  const pay = rows(dir, "r3").find((e) => e.kind === "step" && e.summary === "clicked:#pay");
  assert.equal(pay.costAuthorizedBy, "resume --allow-cost");
});

test("run --submit witnessed-auto is kept by a plain resume, while a cost step still halts", async () => {
  const dir = tmp();
  await main(["run", FIXTURE, "--id", "r4", "--submit", "witnessed-auto"], { dir });
  assert.equal(saved(dir, "r4").submissionMode, "witnessed-auto");
  await main(["resume", "r4", "--attest", "did quiz 1 myself"], { dir });
  const submit = rows(dir, "r4").find((e) => e.kind === "step" && e.stepKind === "submit");
  assert.equal(submit.authorizedBy, "run --submit witnessed-auto (recorded)");
  assert.equal(saved(dir, "r4").haltedAt, 3);
});

test("a cost step halts under run --submit witnessed-auto, and runs with run --allow-cost", async () => {
  const dir = tmp();
  const wf = join(dir, "pay.json");
  writeFileSync(wf, JSON.stringify({ adapter: "fake", course: "c", steps: [
    { kind: "navigate", target: "x" }, { kind: "click", target: "#pay", cost: true }, { kind: "complete" }] }));
  await main(["run", wf, "--id", "p1", "--submit", "witnessed-auto"], { dir });
  assert.equal(saved(dir, "p1").haltedAt, 1);
  assert.equal(clicked(dir, "p1", "#pay"), false);
  await main(["run", wf, "--id", "p2", "--allow-cost"], { dir });
  assert.equal(saved(dir, "p2").status, "completed");
  assert.equal(rows(dir, "p2").find((e) => e.summary === "clicked:#pay").costAuthorizedBy, "run --allow-cost");
});

test("a run file saved without a submission mode (the 1.6.0 format) resumes as manual", async () => {
  const dir = tmp();
  await main(["run", FIXTURE, "--id", "old"], { dir });
  const file = join(dir, "runs", "old.json");
  const legacy = JSON.parse(readFileSync(file, "utf8"));
  delete legacy.submissionMode;
  writeFileSync(file, JSON.stringify(legacy));
  await main(["resume", "old", "--attest", "did it"], { dir });
  assert.equal(saved(dir, "old").haltedAt, 2);
  assert.equal(clicked(dir, "old", "#final-submit"), false);
});

test("--submit accepts only manual or witnessed-auto", async () => {
  const dir = tmp();
  const r = await main(["run", FIXTURE, "--id", "bad", "--submit", "auto"], { dir });
  assert.equal(r.code, 1);
  assert.match(r.out, /manual or witnessed-auto/);
});

test("the attestation carries the real time of the resume, not epoch zero", async () => {
  const dir = tmp();
  await main(["run", FIXTURE, "--id", "t1"], { dir });
  const before = Date.now();
  await main(["resume", "t1", "--attest", "did quiz 1 myself"], { dir });
  const after = Date.now();
  const att = rows(dir, "t1").find((e) => e.kind === "human-assessment");
  const at = Date.parse(att.at);
  assert.ok(at >= before - 1000 && at <= after + 1000, `attestation time ${att.at}`);
});

test("gate: a cost step needs allowCost, and a submit that costs needs both grants", () => {
  const opts = { sealedKinds: STEP_KINDS };
  assert.equal(decide({ kind: "click", cost: true }, { ...opts, autoSubmit: true }).decision, "needs-human");
  assert.equal(decide({ kind: "click", irreversible: true }, { ...opts, allowCost: true }).decision, "allow");
  assert.equal(decide({ kind: "submit", cost: true }, { ...opts, autoSubmit: true }).decision, "needs-human");
  assert.equal(decide({ kind: "submit", cost: true }, { ...opts, allowCost: true }).decision, "needs-human");
  assert.equal(decide({ kind: "submit", cost: true }, { ...opts, autoSubmit: true, allowCost: true }).decision, "allow");
  assert.equal(decide({ kind: "assess" }, { ...opts, autoSubmit: true, allowCost: true }).decision, "needs-human");
});
