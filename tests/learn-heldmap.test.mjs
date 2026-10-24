import { test } from "node:test";
import assert from "node:assert/strict";
import { newSession } from "../src/tutor/session.mjs";
import { recordEvidence } from "../src/tutor/evidence.mjs";
import { validateMap, depths, heldStates, clicks, nextStep, minimalTree } from "../src/tutor/heldmap.mjs";
import { render, check, RECIPIENTS } from "../src/tutor/heldmap-render.mjs";
import { heldMapReceipt, reverifyHeldMap } from "../src/tutor/heldmap-receipt.mjs";

const MAP = {
  propositions: [
    { id: "def", name: "Derivative", statement: "The derivative is the limit of the difference quotient." },
    { id: "lin", name: "Linearity", statement: "The derivative of a sum is the sum of the derivatives." },
    { id: "prod", name: "Product rule", statement: "(fg)' = f'g + fg'." },
    { id: "chain", name: "Chain rule", statement: "(f(g))' = f'(g) g'." },
    { id: "quot", name: "Quotient rule", statement: "(f/g)' = (f'g - fg') / g^2." },
  ],
  chains: [
    { id: "c1", premises: ["def"], conclusion: "prod" },
    { id: "c2", premises: ["def"], conclusion: "chain" },
    { id: "c3", premises: ["prod", "chain"], conclusion: "quot" },
  ],
};

const hit = (s, id, n = 2, confidence = 85) => {
  for (let i = 0; i < n; i++) recordEvidence(s, { objective: "calc", prompt: id, answer: "x", correct: true, confidence, propositions: [id] });
};
const miss = (s, id) => recordEvidence(s, { objective: "calc", prompt: id, answer: "x", correct: false, confidence: 90, propositions: [id] });
const fresh = () => newSession({ topic: "calc", objectives: ["calc"] });

test("validateMap refuses cycles, unknown ids, duplicates and self-premises", () => {
  const bad = (chains) => () => validateMap({ propositions: MAP.propositions, chains });
  assert.throws(bad([{ id: "x", premises: ["prod"], conclusion: "def" }, { id: "y", premises: ["def"], conclusion: "prod" }]), /reasoning cycle/);
  assert.throws(bad([{ id: "x", premises: ["nope"], conclusion: "def" }]), /unknown proposition nope/);
  assert.throws(bad([{ id: "x", premises: ["def"], conclusion: "def" }]), /conclusion as a premise/);
  assert.throws(bad([{ id: "def", premises: ["lin"], conclusion: "prod" }]), /used twice/);
  assert.throws(() => validateMap({ propositions: [MAP.propositions[0], MAP.propositions[0]] }), /appears twice/);
});

test("depth is the shortest derivation height, foundations at zero", () => {
  const d = depths(validateMap(MAP));
  assert.deepEqual(Object.fromEntries(d), { def: 0, lin: 0, prod: 1, chain: 1, quot: 2 });
});

test("evidence states: unseen, forming, held, shaky; predictions never count", () => {
  const s = fresh();
  hit(s, "def");
  hit(s, "prod", 1);
  hit(s, "chain");
  miss(s, "chain");
  recordEvidence(s, { objective: "calc", prompt: "q", answer: "x", kind: "predict", correct: true, confidence: 99, propositions: ["quot"] });
  const st = heldStates(MAP, s);
  assert.equal(st.def.evidence, "held");
  assert.equal(st.def.structure, "foundation");
  assert.equal(st.prod.evidence, "forming");
  assert.equal(st.chain.evidence, "shaky");
  assert.equal(st.quot.evidence, "unseen");
  assert.equal(st.quot.attempts, 0);
});

test("a held conclusion is loose until its premises are held, then it clicks", () => {
  const s = fresh();
  hit(s, "quot");
  hit(s, "prod");
  const before = heldStates(MAP, s);
  assert.equal(before.quot.structure, "loose");
  hit(s, "def");
  hit(s, "chain");
  const after = heldStates(MAP, s);
  assert.equal(after.quot.structure, "generated");
  assert.equal(after.prod.structure, "generated");
  assert.deepEqual(clicks(before, after).sort(), ["prod", "quot"]);
});

test("confident hits without confidence data never reach held", () => {
  const s = fresh();
  for (let i = 0; i < 5; i++) recordEvidence(s, { objective: "calc", prompt: "q", answer: "x", correct: true, propositions: ["def"] });
  assert.equal(heldStates(MAP, s).def.evidence, "forming");
});

test("nextStep repairs a shaky premise before building, else takes one step", () => {
  const s = fresh();
  hit(s, "def");
  miss(s, "prod");
  let n = nextStep(MAP, heldStates(MAP, s));
  assert.deepEqual(n.next, { id: "prod", reason: "repair" });
  hit(s, "prod");
  n = nextStep(MAP, heldStates(MAP, s));
  assert.deepEqual(n.next, { id: "lin", via: null, reason: "step" }, "with no goal the shallowest step comes first");
  assert.ok(!n.frontier.some((f) => f.id === "quot"), "quot is two steps away while chain is unheld");
  n = nextStep(MAP, heldStates(MAP, s), { goal: "quot" });
  assert.deepEqual(n.next, { id: "chain", via: "c2", reason: "step" });
  assert.ok(!n.frontier.some((f) => f.id === "lin"), "linearity is off the path to the quotient rule");
});

test("minimalTree walks from what is held to the goal in teaching order", () => {
  const s = fresh();
  hit(s, "def");
  hit(s, "prod");
  const tree = minimalTree(MAP, heldStates(MAP, s), "quot");
  assert.deepEqual(tree, [{ id: "chain", via: "c2" }, { id: "quot", via: "c3" }]);
  assert.deepEqual(minimalTree(MAP, heldStates(MAP, fresh()), "prod"), [{ id: "def", via: null }, { id: "prod", via: "c1" }]);
  assert.throws(() => minimalTree(MAP, heldStates(MAP, s), "nope"), /unknown goal/);
});

test("a goal held but loose still needs its reasons: the target is the goal following", () => {
  const s = fresh();
  hit(s, "quot");
  hit(s, "def");
  miss(s, "chain");
  const st = heldStates(MAP, s);
  assert.equal(st.quot.structure, "loose");
  assert.deepEqual(minimalTree(MAP, st, "quot"), [{ id: "prod", via: "c1" }, { id: "chain", via: "c2" }, { id: "quot", via: "c3" }]);
  assert.deepEqual(nextStep(MAP, st, { goal: "quot" }).next, { id: "chain", reason: "repair" });
  hit(s, "prod"); hit(s, "chain");
  assert.deepEqual(minimalTree(MAP, heldStates(MAP, s), "quot"), [], "a generated goal needs nothing more");
});

test("every recipient gets a perceptible rendering of the same states", () => {
  const s = fresh();
  hit(s, "def");
  hit(s, "quot");
  miss(s, "chain");
  const st = heldStates(MAP, s);
  for (const r of RECIPIENTS) assert.deepEqual(check(r, render(MAP, st, r), MAP), [], `recipient ${r}`);
  const eye = render(MAP, st, "eye");
  assert.match(eye, /^<svg [^>]*role="img"/);
  assert.match(eye, /aria-label="Reasoning map: 2 of 5 propositions held; next: Chain rule\."/);
  assert.equal((eye.match(/r="15"/g) || []).length, 1, "one hot mark");
  const reader = render(MAP, st, "reader");
  assert.match(reader, /Quotient rule follows from Product rule and Chain rule\..*Held on its own/);
  assert.match(reader, /Next: Chain rule \(repair before building on it\)\./);
  assert.equal(render(MAP, st, "agent").schema, "learn.heldmap/1");
  assert.throws(() => render(MAP, st, "nose"), /recipient must be one of/);
});

test("check() catches a rendering that drops a proposition", () => {
  const st = heldStates(MAP, fresh());
  const text = render(MAP, st, "reader").replace(/Linearity/g, "");
  assert.deepEqual(check("reader", text, MAP), ["Linearity is never named"]);
});

test("the receipt re-derives to MATCH, and a hand edit is DRIFT", () => {
  const s = fresh();
  hit(s, "def");
  recordEvidence(s, { objective: "calc", prompt: "q", answer: "x", correct: true, confidence: 80, thinking: "private words", propositions: ["prod"] });
  const r = heldMapReceipt(MAP, s);
  assert.equal(JSON.stringify(r).includes("private words"), false, "thinking stays out of the receipt");
  assert.deepEqual(reverifyHeldMap(r, MAP, s), { verdict: "MATCH", problems: [] });
  const forged = { ...r, states: { ...r.states, prod: { ...r.states.prod, evidence: "held" } } };
  const v = reverifyHeldMap(forged, MAP, s);
  assert.equal(v.verdict, "DRIFT");
  assert.ok(v.problems.some((p) => p.startsWith("state of prod")));
  assert.ok(v.problems.includes("the receipt's own digest does not match its body"));
  hit(s, "prod");
  assert.equal(reverifyHeldMap(r, MAP, s).verdict, "DRIFT", "new evidence changes the record");
  assert.equal(reverifyHeldMap(r, null, s).verdict, "UNVERIFIABLE");
});
