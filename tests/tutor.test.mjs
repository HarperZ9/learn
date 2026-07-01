import { test } from "node:test";
import assert from "node:assert/strict";
import { newSession, recordAttempt, mastery, masteryReceipt } from "../src/tutor/tutor.mjs";
import { dispatch } from "../src/mcp.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("mastery-gate: NOT ready until >= minAttempts and >= threshold accuracy on every objective", () => {
  const s = newSession({ topic: "SC-900", objectives: ["identity", "compliance"] });
  // identity: 3 attempts, 3 correct (100%). compliance: 1 attempt correct (below minAttempts).
  recordAttempt(s, { objective: "identity", prompt: "q1", answer: "a1", correct: true });
  recordAttempt(s, { objective: "identity", prompt: "q2", answer: "a2", correct: true });
  recordAttempt(s, { objective: "identity", prompt: "q3", answer: "a3", correct: true });
  recordAttempt(s, { objective: "compliance", prompt: "q1", answer: "a1", correct: true });
  const m = mastery(s, { threshold: 0.8, minAttempts: 3 });
  assert.equal(m.ready, false);                 // compliance under-practiced
  assert.deepEqual(m.weakest, ["compliance"]);
  assert.equal(m.perObjective.find((p) => p.objective === "identity").ready, true);
});

test("mastery-gate: ready once both objectives cleared", () => {
  const s = newSession({ topic: "t", objectives: ["a"] });
  for (let i = 0; i < 4; i++) recordAttempt(s, { objective: "a", prompt: "q", answer: "x", correct: i > 0 }); // 3/4 = 75%
  assert.equal(mastery(s, { threshold: 0.8, minAttempts: 3 }).ready, false); // 75% < 80%
  recordAttempt(s, { objective: "a", prompt: "q", answer: "x", correct: true }); // 4/5 = 80%
  assert.equal(mastery(s, { threshold: 0.8, minAttempts: 3 }).ready, true);
});

test("mastery receipt witnesses the practice log and states the boundary", () => {
  const s = newSession({ topic: "t", objectives: ["a"] });
  recordAttempt(s, { objective: "a", prompt: "q", answer: "x", correct: true });
  const r = masteryReceipt(s);
  assert.equal(r.totalAttempts, 1);
  assert.equal(r.ledgerVerified, true);
  assert.match(r.boundary, /real graded assessment is taken by the operator/i);
});

test("MCP tutor tools: plan -> record -> mastery round-trip", async () => {
  const dir = mkdtempSync(join(tmpdir(), "learn-tutor-"));
  await dispatch("learn_tutor_plan", { sessionId: "s1", topic: "t", objectives: ["a"] }, { dir });
  for (let i = 0; i < 3; i++) await dispatch("learn_tutor_record", { sessionId: "s1", objective: "a", prompt: "q", answer: "x", correct: true }, { dir });
  const m = await dispatch("learn_tutor_mastery", { sessionId: "s1" }, { dir });
  assert.equal(m.ready, true);
});
