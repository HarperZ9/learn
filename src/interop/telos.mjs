// telos-engine interop — the visualization bridge. Build a math_physics scene-spec REQUEST from a
// concept, and (Task 2) delegate rendering to the telos CLI over a JSON boundary. Rendering is an
// AID: every result is tagged provenance:"aid" and is structurally barred from graded work.
// Zero-dep (node builtins). learn never imports telos internals — it asks over LEARN_TELOS_CMD.
import { sha256hex } from "../accountability/witness.mjs";

// Pure: turn a concept descriptor into a scene-spec request. No I/O.
export function toTelosSceneSpec(concept = {}, { lane = "math_physics" } = {}) {
  const spec = {
    schema: "learn.telos.scene-request/v1",
    concept: { title: concept.title ?? "", kind: concept.kind ?? "math.function-plot" },
    spec: { lane, params: concept.params ?? {}, notes: concept.notes ?? "" },
  };
  spec.requestHash = "sha256:" + sha256hex(JSON.stringify({ concept: spec.concept, spec: spec.spec }));
  return spec;
}
