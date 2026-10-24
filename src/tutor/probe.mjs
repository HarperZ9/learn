// Edge search: find where a learner's understanding of one strand runs out, by bracketing it
// between a floor (the highest level answered right with confidence) and a ceiling (the lowest
// level missed or answered "I don't know"). Each probe attempt is an evidence attempt
// (evidence.mjs) with kind "probe", the strand as its objective, and an integer difficulty level.
//
// The next-question rule:
//   no evidence yet           enter near the top of the range, since the low levels are usually held
//   floor only                jump halfway to the top: a confident hit moves the edge up sharply
//   ceiling only              bisect down toward the bottom of the range
//   floor and ceiling         bisect between them, so no question re-enters bracketed ground
//   a hit at or above a miss  probe the contested level again (a slip, a guess or a misconception)
//   fragile hits only         step up one level: right but unsure is not a floor
// A strand is resolved when the ceiling sits one level above the floor, or when it never breaks at
// the top (above-range) or breaks at the bottom (below-range).
//
// INTEGRITY: the assessment is recomputed from attempts every time. Nothing here authors a
// judgement about the learner; a model's free-text reading can sit beside it, but this result is
// the part anyone can check. Browser-safe: no Node built-ins.
import { gradedEvidence } from "./evidence.mjs";

function probeRows(session, strand) {
  return gradedEvidence(session).filter((a) => a.kind === "probe" && a.objective === strand && Number.isInteger(a.level));
}

function edges(rows, solidAt) {
  const solid = (a) => a.correct && (typeof a.confidence !== "number" || a.confidence >= solidAt);
  const hits = rows.filter(solid).map((a) => a.level);
  const misses = rows.filter((a) => !a.correct).map((a) => a.level);
  return {
    floor: hits.length ? Math.max(...hits) : null,
    ceiling: misses.length ? Math.min(...misses) : null,
    fragile: [...new Set(rows.filter((a) => a.correct && !solid(a)).map((a) => a.level))].sort((x, y) => x - y),
  };
}

function nextLevel({ floor, ceiling, fragile }, n, { minLevel, maxLevel }) {
  if (n === 0) return { status: "unprobed", next: Math.round(minLevel + 0.75 * (maxLevel - minLevel)) };
  if (floor !== null && ceiling !== null && floor >= ceiling) return { status: "conflict", next: ceiling };
  if (floor === null && ceiling === null) return { status: "open", next: Math.min(maxLevel, Math.max(...fragile) + 1) };
  if (ceiling === null) {
    if (floor >= maxLevel) return { status: "above-range", next: null };
    return { status: "open", next: Math.min(maxLevel, floor + Math.max(1, Math.ceil((maxLevel - floor) / 2))) };
  }
  if (floor === null) {
    if (ceiling <= minLevel) return { status: "below-range", next: null };
    return { status: "open", next: Math.max(minLevel, Math.floor((minLevel - 1 + ceiling) / 2)) };
  }
  if (ceiling - floor <= 1) return { status: "resolved", next: null };
  return { status: "open", next: Math.floor((floor + ceiling) / 2) };
}

// bracket(session, strand, {minLevel, maxLevel, solidAt, committedAt}) ->
//   {strand, status, floor, ceiling, fragile, gaps, committed, next, questions}
export function bracket(session, strand, { minLevel = 1, maxLevel = 10, solidAt = 60, committedAt = 80 } = {}) {
  if (!Number.isInteger(minLevel) || !Number.isInteger(maxLevel) || minLevel >= maxLevel) {
    throw new Error("bracket: minLevel and maxLevel must be integers with minLevel < maxLevel");
  }
  const rows = probeRows(session, strand);
  const e = edges(rows, solidAt);
  const { status, next } = nextLevel(e, rows.length, { minLevel, maxLevel });
  return {
    strand, status, floor: e.floor, ceiling: e.ceiling, fragile: e.fragile,
    gaps: [...new Set(rows.filter((a) => a.dontKnow).map((a) => a.level))].sort((x, y) => x - y),
    committed: rows.filter((a) => !a.correct && !a.dontKnow && a.confidence >= committedAt).map((a) => ({ level: a.level, prompt: a.prompt })),
    next, questions: rows.length,
  };
}

const SETTLED = new Set(["resolved", "above-range", "below-range"]);

// probeAssessment(session, strands, opts) -> {concluded, strands:[bracket...]}. concluded is true
// only when every strand is settled; a conflict or an open bracket keeps the probe going.
export function probeAssessment(session, strands, opts = {}) {
  if (!Array.isArray(strands) || strands.length === 0) throw new Error("probeAssessment: needs at least one strand");
  const results = strands.map((s) => bracket(session, s, opts));
  return { concluded: results.every((r) => SETTLED.has(r.status)), strands: results };
}
