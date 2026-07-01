import { test } from "node:test";
import assert from "node:assert/strict";
import { toTelosSceneSpec } from "../src/interop/telos.mjs";

test("toTelosSceneSpec builds a math_physics scene request with a deterministic hash", () => {
  const concept = { title: "Damped harmonic oscillator", kind: "physics.ode", params: { omega: 2.0, zeta: 0.1 } };
  const a = toTelosSceneSpec(concept);
  assert.equal(a.schema, "learn.telos.scene-request/v1");
  assert.equal(a.concept.title, "Damped harmonic oscillator");
  assert.equal(a.concept.kind, "physics.ode");
  assert.equal(a.spec.lane, "math_physics");
  assert.deepEqual(a.spec.params, { omega: 2.0, zeta: 0.1 });
  assert.match(a.requestHash, /^sha256:[0-9a-f]{64}$/);
  // deterministic
  const b = toTelosSceneSpec(concept);
  assert.equal(a.requestHash, b.requestHash);
});

test("toTelosSceneSpec defaults kind and tolerates a bare concept", () => {
  const a = toTelosSceneSpec({ title: "y = x^2" });
  assert.equal(a.concept.kind, "math.function-plot");
  assert.deepEqual(a.spec.params, {});
});
