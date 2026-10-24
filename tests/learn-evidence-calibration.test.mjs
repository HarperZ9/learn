import { test } from "node:test";
import assert from "node:assert/strict";
import { newSession, mastery } from "../src/tutor/session.mjs";
import { recordEvidence, gradedEvidence } from "../src/tutor/evidence.mjs";
import { calibration, priority, PRIORITY_WEIGHTS } from "../src/tutor/calibration.mjs";

const fresh = () => newSession({ topic: "t", objectives: ["a", "b"] });
const rec = (s, o) => recordEvidence(s, { objective: "a", prompt: "q", answer: "x", kind: "check", ...o });

test("recordEvidence stores only the fields the learner supplied", () => {
  const s = fresh();
  rec(s, { correct: true, confidence: 72.4, thinking: "rows stay independent", options: 4, propositions: ["p1", "p1", "p2"] });
  const a = s.attempts[0];
  assert.equal(a.kind, "check");
  assert.equal(a.confidence, 72);
  assert.equal(a.thinking, "rows stay independent");
  assert.equal(a.options, 4);
  assert.deepEqual(a.propositions, ["p1", "p2"]);
  rec(s, { correct: false });
  assert.equal("confidence" in s.attempts[1], false);
  assert.equal("thinking" in s.attempts[1], false);
});

test("an I-don't-know attempt is a gap: not correct, no answer, no confidence allowed", () => {
  const s = fresh();
  rec(s, { dontKnow: true, answer: "guess" });
  assert.equal(s.attempts[0].correct, false);
  assert.equal(s.attempts[0].dontKnow, true);
  assert.equal(s.attempts[0].answer, "");
  assert.throws(() => rec(s, { dontKnow: true, confidence: 50 }), /carries no confidence/);
});

test("recordEvidence refuses malformed input instead of guessing", () => {
  const s = fresh();
  assert.throws(() => rec(s, { correct: true, confidence: 101 }), /0 to 100/);
  assert.throws(() => rec(s, { correct: true, kind: "quiz" }), /kind must be one of/);
  assert.throws(() => rec(s, { correct: true, kind: "probe" }), /needs a level/);
  assert.throws(() => rec(s, { correct: "yes" }), /true or false/);
  assert.throws(() => rec(s, { correct: true, propositions: ["bad id!"] }), /not valid/);
  assert.throws(() => rec(s, { correct: true, options: 1 }), /2 or more/);
  assert.equal(s.attempts.length, 0, "a refused attempt writes nothing");
});

test("a prediction can stay pending and is never graded evidence", () => {
  const s = fresh();
  rec(s, { kind: "predict" });
  rec(s, { kind: "predict", correct: false, confidence: 90 });
  rec(s, { correct: true, confidence: 90 });
  assert.equal(s.attempts[0].correct, null);
  assert.equal(gradedEvidence(s).length, 1);
  assert.equal(calibration(s).n, 1, "a confident wrong prediction is not a committed misconception");
});

test("confidence never moves the mastery gate", () => {
  const plain = fresh();
  const rich = fresh();
  for (const c of [true, true, false]) {
    recordEvidence(plain, { objective: "a", prompt: "q", answer: "x", correct: c });
    recordEvidence(rich, { objective: "a", prompt: "q", answer: "x", correct: c, confidence: c ? 5 : 99 });
  }
  assert.deepEqual(mastery(rich), mastery(plain));
});

test("calibration: Brier, base-rate skill and bins are exact on a known set", () => {
  const s = fresh();
  // four answers at 80%: three right; four at 20%: one right. Perfectly calibrated.
  for (const c of [true, true, true, false]) rec(s, { correct: c, confidence: 80 });
  for (const c of [true, false, false, false]) rec(s, { correct: c, confidence: 20 });
  const r = calibration(s, { bins: 5 });
  assert.equal(r.n, 8);
  assert.equal(r.brier, 0.19); // (3*0.04 + 0.64 + 0.64 + 3*0.04) / 8
  assert.equal(r.baseline, 0.25); // hit rate 0.5
  assert.equal(r.skill, 0.24); // 1 - 0.19 / 0.25
  assert.equal(r.overconfidence, 0);
  assert.deepEqual(r.bins[1], { lo: 20, hi: 40, n: 4, meanConfidence: 0.2, accuracy: 0.25 });
  assert.deepEqual(r.bins[4], { lo: 80, hi: 100, n: 4, meanConfidence: 0.8, accuracy: 0.75 });
});

test("calibration names committed, fragile, distrusted and gap answers", () => {
  const s = fresh();
  rec(s, { correct: false, confidence: 95, propositions: ["p7"] });
  rec(s, { correct: true, confidence: 30 });
  rec(s, { correct: true, confidence: 20, options: 5 });
  rec(s, { dontKnow: true });
  const r = calibration(s);
  assert.equal(r.committed.length, 1);
  assert.deepEqual(r.committed[0].propositions, ["p7"]);
  assert.equal(r.fragile.length, 2);
  assert.equal(r.distrusted.length, 1, "20% on a five-option item is at chance");
  assert.equal(r.gaps.length, 1);
  assert.equal(r.n, 3, "an I-don't-know answer is not scored for calibration");
});

test("calibration is an honest null without confidence data", () => {
  const s = fresh();
  rec(s, { correct: true });
  const r = calibration(s);
  assert.equal(r.n, 0);
  assert.equal(r.brier, null);
  assert.equal(r.skill, null);
  assert.equal(r.overconfidence, null);
});

test("priority ranks a committed wrong model above plain misses and gaps", () => {
  const s = fresh();
  rec(s, { objective: "a", correct: false, confidence: 90 });
  rec(s, { objective: "b", correct: false, confidence: 50 });
  rec(s, { objective: "d", dontKnow: true });
  recordEvidence(s, { objective: "c", prompt: "q", answer: "x", correct: true, confidence: 95 });
  const p = priority(s);
  assert.deepEqual(p.map((r) => r.objective), ["a", "b", "d"]);
  assert.equal(p[0].score, PRIORITY_WEIGHTS.committed);
  assert.equal(p[1].score, PRIORITY_WEIGHTS.wrong);
  assert.equal(p[2].score, PRIORITY_WEIGHTS.gap);
  assert.equal(p.find((r) => r.objective === "c"), undefined, "a confident hit needs no attention");
});
