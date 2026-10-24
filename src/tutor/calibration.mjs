// Learner calibration: does the learner's stated confidence track whether they are right? Reads
// evidence attempts (evidence.mjs) and reports a Brier score, a skill score against the learner's
// own base rate, reliability bins, and the four signals a tutor acts on:
//   committed   wrong with high confidence: a held wrong model, the strongest signal there is
//   fragile     right with low confidence: knowledge that may be a lucky guess
//   distrusted  a pick at or below chance (100 / options): the learner believes their pick is wrong
//   gaps        honest "I don't know" answers: missing knowledge, never counted as a wrong model
//
// INTEGRITY: every number is recomputed from the learner's own attempts; nothing is stored or
// asserted. With no confidence data the scores are null, an honest null rather than a zero.
// Calibration is a planning signal only. It never touches mastery(), and priority() is a ranking
// heuristic whose weights are named below, not a grade. Browser-safe: no Node built-ins.
import { gradedEvidence } from "./evidence.mjs";

const round = (x, d = 4) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function scored(session) {
  return gradedEvidence(session).filter((a) => typeof a.confidence === "number" && !a.dontKnow);
}

function reliabilityBins(rows, bins) {
  const out = [];
  for (let i = 0; i < bins; i++) {
    const lo = (100 / bins) * i;
    const hi = (100 / bins) * (i + 1);
    const inBin = rows.filter((a) => a.confidence >= lo && (i === bins - 1 ? a.confidence <= hi : a.confidence < hi));
    out.push({
      lo: round(lo, 2), hi: round(hi, 2), n: inBin.length,
      meanConfidence: round(mean(inBin.map((a) => a.confidence / 100))),
      accuracy: round(mean(inBin.map((a) => (a.correct ? 1 : 0)))),
    });
  }
  return out;
}

function brierScores(rows) {
  if (!rows.length) return { brier: null, baseline: null, skill: null };
  const brier = mean(rows.map((a) => (a.confidence / 100 - (a.correct ? 1 : 0)) ** 2));
  const base = mean(rows.map((a) => (a.correct ? 1 : 0)));
  const baseline = base * (1 - base); // Brier of always answering with one's own hit rate
  const skill = baseline > 0 ? 1 - brier / baseline : null;
  return { brier: round(brier), baseline: round(baseline), skill: round(skill) };
}

const brief = (a) => ({ objective: a.objective, prompt: a.prompt, confidence: a.confidence, propositions: a.propositions || [] });

// calibration(session, {bins, committedAt, fragileBelow}) -> the report described above.
export function calibration(session, { bins = 5, committedAt = 80, fragileBelow = 40 } = {}) {
  const rows = scored(session);
  const graded = gradedEvidence(session);
  const meanConf = mean(rows.map((a) => a.confidence / 100));
  const accuracy = mean(rows.map((a) => (a.correct ? 1 : 0)));
  return {
    n: rows.length,
    ...brierScores(rows),
    meanConfidence: round(meanConf),
    accuracy: round(accuracy),
    overconfidence: rows.length ? round(meanConf - accuracy) : null,
    bins: reliabilityBins(rows, bins),
    committed: rows.filter((a) => !a.correct && a.confidence >= committedAt).map(brief),
    fragile: rows.filter((a) => a.correct && a.confidence < fragileBelow).map(brief),
    distrusted: rows.filter((a) => a.options && a.confidence <= 100 / a.options).map(brief),
    gaps: graded.filter((a) => a.dontKnow).map(brief),
  };
}

// The weights priority() uses. A committed wrong model costs most to leave in place, because
// everything built on it inherits the error; a gap is cheap to fill because nothing is in the way.
export const PRIORITY_WEIGHTS = Object.freeze({ committed: 3, wrong: 2, fragile: 1, gap: 1 });

function countFor(session, objective, opts) {
  const rows = gradedEvidence(session).filter((a) => a.objective === objective);
  const conf = (a) => (typeof a.confidence === "number" ? a.confidence : null);
  const committed = rows.filter((a) => !a.correct && !a.dontKnow && conf(a) !== null && conf(a) >= opts.committedAt).length;
  const wrong = rows.filter((a) => !a.correct && !a.dontKnow).length - committed;
  const fragile = rows.filter((a) => a.correct && conf(a) !== null && conf(a) < opts.fragileBelow).length;
  const gap = rows.filter((a) => a.dontKnow).length;
  return { committed, wrong, fragile, gap };
}

// priority(session, opts) -> [{objective, score, committed, wrong, fragile, gap}], highest first,
// ties broken by objective id so the order is stable. Objectives with a zero score are left out.
export function priority(session, { committedAt = 80, fragileBelow = 40 } = {}) {
  const ids = [...new Set(gradedEvidence(session).map((a) => a.objective))];
  const w = PRIORITY_WEIGHTS;
  return ids
    .map((objective) => {
      const c = countFor(session, objective, { committedAt, fragileBelow });
      return { objective, score: w.committed * c.committed + w.wrong * c.wrong + w.fragile * c.fragile + w.gap * c.gap, ...c };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.objective < b.objective ? -1 : 1));
}
