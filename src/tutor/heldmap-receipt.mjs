// A receipt for a held map: the digests of the map and of the evidence it was derived from, plus
// the derived states. reverifyHeldMap() recomputes the states from the same inputs and compares,
// so a map someone edited by hand to read "held" shows up as DRIFT with the fields that moved.
//
// INTEGRITY: the receipt carries digests of the evidence, never the learner's thinking text. A
// receipt whose inputs are not supplied is UNVERIFIABLE, never MATCH.
import { sha256hex } from "../accountability/witness.mjs";
import { heldStates } from "./heldmap.mjs";

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

// The evidence the map reads: graded fields only, thinking reduced to a digest.
function evidenceDigest(session) {
  const rows = (session.attempts || []).map((a) => ({
    objective: a.objective, correct: a.correct, kind: a.kind ?? null, confidence: a.confidence ?? null,
    dontKnow: !!a.dontKnow, propositions: a.propositions || [], thinking: a.thinking ? sha256hex(a.thinking) : null,
  }));
  return sha256hex(canonical(rows));
}

export function heldMapReceipt(map, session, opts = {}) {
  const states = heldStates(map, session, opts);
  const body = { schema: "learn.heldmap-receipt/1", map: sha256hex(canonical(map)), evidence: evidenceDigest(session), opts, states };
  return { ...body, digest: sha256hex(canonical(body)) };
}

// reverifyHeldMap(receipt, map, session) -> {verdict: MATCH|DRIFT|UNVERIFIABLE, problems}
export function reverifyHeldMap(receipt, map, session) {
  if (!receipt || !map || !session) return { verdict: "UNVERIFIABLE", problems: ["receipt, map and session are all required"] };
  const fresh = heldMapReceipt(map, session, receipt.opts || {});
  const problems = [];
  if (fresh.map !== receipt.map) problems.push("the map differs from the one the receipt was made from");
  if (fresh.evidence !== receipt.evidence) problems.push("the evidence differs from the one the receipt was made from");
  for (const id of new Set([...Object.keys(fresh.states), ...Object.keys(receipt.states || {})])) {
    const a = canonical(fresh.states[id]), b = canonical((receipt.states || {})[id]);
    if (a !== b) problems.push(`state of ${id}: receipt says ${b}, recomputed ${a}`);
  }
  const { digest, ...body } = receipt;
  if (sha256hex(canonical(body)) !== digest) problems.push("the receipt's own digest does not match its body");
  return { verdict: problems.length ? "DRIFT" : "MATCH", problems };
}
