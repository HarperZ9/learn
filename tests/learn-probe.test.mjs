import { test } from "node:test";
import assert from "node:assert/strict";
import { newSession } from "../src/tutor/session.mjs";
import { recordEvidence } from "../src/tutor/evidence.mjs";
import { bracket, probeAssessment } from "../src/tutor/probe.mjs";

const fresh = () => newSession({ topic: "t", objectives: ["attn", "grad"] });
const probe = (s, level, o) => recordEvidence(s, { objective: "attn", prompt: `L${level}`, answer: "x", kind: "probe", level, ...o });

test("an unprobed strand enters near the top of the range", () => {
  const b = bracket(fresh(), "attn");
  assert.equal(b.status, "unprobed");
  assert.equal(b.next, 8); // 1 + 0.75 * 9, rounded
});

test("a confident hit jumps halfway to the top; a miss bisects down", () => {
  const s = fresh();
  probe(s, 4, { correct: true, confidence: 90 });
  assert.equal(bracket(s, "attn").next, 7);
  const t = fresh();
  probe(t, 8, { correct: false, confidence: 40 });
  assert.equal(bracket(t, "attn").next, 4);
});

test("a full walk converges on a one-level bracket and never re-enters held ground", () => {
  const s = fresh();
  const truth = 6; // the learner reliably answers levels up to 6
  const asked = [];
  let b = bracket(s, "attn");
  while (b.next !== null && asked.length < 10) {
    asked.push(b.next);
    probe(s, b.next, { correct: b.next <= truth, confidence: 85 });
    b = bracket(s, "attn");
  }
  assert.equal(b.status, "resolved");
  assert.equal(b.floor, 6);
  assert.equal(b.ceiling, 7);
  assert.ok(asked.length <= 4, `asked ${asked.join(",")}`);
  assert.equal(new Set(asked).size, asked.length, "no level is asked twice");
});

test("a hit at or above a miss is a conflict and the contested level is asked again", () => {
  const s = fresh();
  probe(s, 5, { correct: false, confidence: 90 });
  probe(s, 8, { correct: true, confidence: 90 });
  const b = bracket(s, "attn");
  assert.equal(b.status, "conflict");
  assert.equal(b.next, 5);
  assert.deepEqual(b.committed, [{ level: 5, prompt: "L5" }]);
});

test("right but unsure is fragile, not a floor", () => {
  const s = fresh();
  probe(s, 8, { correct: true, confidence: 30 });
  const b = bracket(s, "attn");
  assert.equal(b.floor, null);
  assert.deepEqual(b.fragile, [8]);
  assert.equal(b.next, 9);
});

test("I don't know is a ceiling and a gap, never a committed misconception", () => {
  const s = fresh();
  probe(s, 3, { dontKnow: true });
  const b = bracket(s, "attn");
  assert.equal(b.ceiling, 3);
  assert.deepEqual(b.gaps, [3]);
  assert.deepEqual(b.committed, []);
});

test("edges of the range settle as above-range and below-range", () => {
  const s = fresh();
  probe(s, 10, { correct: true, confidence: 90 });
  assert.equal(bracket(s, "attn").status, "above-range");
  const t = fresh();
  probe(t, 1, { correct: false, confidence: 70 });
  assert.equal(bracket(t, "attn").status, "below-range");
});

test("predictions and other strands never move a bracket", () => {
  const s = fresh();
  recordEvidence(s, { objective: "attn", prompt: "p", answer: "x", kind: "predict", correct: false, level: 2 });
  recordEvidence(s, { objective: "grad", prompt: "g", answer: "x", kind: "probe", level: 2, correct: false });
  assert.equal(bracket(s, "attn").status, "unprobed");
});

test("probeAssessment concludes only when every strand is settled", () => {
  const s = fresh();
  probe(s, 6, { correct: true, confidence: 90 });
  probe(s, 7, { correct: false, confidence: 60 });
  const one = probeAssessment(s, ["attn", "grad"]);
  assert.equal(one.concluded, false);
  assert.equal(one.strands[0].status, "resolved");
  recordEvidence(s, { objective: "grad", prompt: "g", answer: "x", kind: "probe", level: 10, correct: true, confidence: 90 });
  assert.equal(probeAssessment(s, ["attn", "grad"]).concluded, true);
  assert.throws(() => probeAssessment(s, []), /at least one strand/);
});
