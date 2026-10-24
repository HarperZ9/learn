// Evidence attempts: an attempt that carries what the learner believed, not only whether they were
// right. Each one records the question's role (probe, predict, check, practice), the learner's
// stated confidence (0 to 100, the probability they give that their pick is right), an honest
// "I don't know", their thinking in their own words, the difficulty level for a probe, the option
// count for a multiple-choice item, and the proposition ids the question is about.
//
// INTEGRITY: this module only stores what the learner supplied. It derives no verdict, invents no
// confidence and never fills thinking in. A "dontKnow" attempt is recorded as not correct and
// carries no confidence: it is a gap, never a wrong pick. A prediction may stay pending
// (correct: null) until the learner scores it. Confidence and thinking are evidence for planning;
// they never move the mastery gate, which keeps reading only `correct` (session.mjs).
// Browser-safe: no Node built-ins.
import { recordAttempt } from "./session.mjs";

export const KINDS = Object.freeze(["probe", "predict", "check", "practice"]);
const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const MAX_THINKING = 4000;

function fail(why) {
  throw new Error(`recordEvidence: ${why}`);
}

function checkConfidence(confidence, dontKnow) {
  if (confidence === undefined || confidence === null) return undefined;
  if (dontKnow) fail("an \"I don't know\" attempt carries no confidence");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) fail("confidence must be a number from 0 to 100");
  return Math.round(confidence);
}

function checkPropositions(propositions) {
  if (!Array.isArray(propositions)) fail("propositions must be an array of ids");
  for (const p of propositions) if (!ID.test(String(p))) fail(`proposition id ${JSON.stringify(p)} is not valid`);
  return [...new Set(propositions.map(String))];
}

function checkShape({ kind, level, options, objective }) {
  if (!objective) fail("needs an objective");
  if (!KINDS.includes(kind)) fail(`kind must be one of ${KINDS.join(", ")}`);
  if (level !== undefined && !Number.isInteger(level)) fail("level must be an integer");
  if (kind === "probe" && level === undefined) fail("a probe attempt needs a level, so the edge search can place it");
  if (options !== undefined && (!Number.isInteger(options) || options < 2)) fail("options must be an integer of 2 or more");
}

// recordEvidence(session, {...}) -> session. Appends one attempt through recordAttempt(), then
// attaches the evidence fields. Only fields the caller supplied are written.
export function recordEvidence(session, input = {}) {
  const { objective, prompt = "", answer = "", correct, feedback = "", timestamp, misconception } = input;
  const { kind = "check", confidence, dontKnow = false, thinking = "", level, options, propositions = [] } = input;
  checkShape({ kind, level, options, objective });
  const conf = checkConfidence(confidence, dontKnow);
  const props = checkPropositions(propositions);
  const pending = kind === "predict" && (correct === undefined || correct === null);
  if (!pending && !dontKnow && typeof correct !== "boolean") fail("correct must be true or false (only a prediction may stay pending)");
  recordAttempt(session, { objective, prompt, answer: dontKnow ? "" : answer, correct: dontKnow ? false : !!correct, feedback, timestamp, misconception });
  const a = session.attempts[session.attempts.length - 1];
  a.kind = kind;
  if (pending) a.correct = null;
  if (dontKnow) a.dontKnow = true;
  if (conf !== undefined) a.confidence = conf;
  if (thinking) a.thinking = String(thinking).slice(0, MAX_THINKING);
  if (level !== undefined) a.level = level;
  if (options !== undefined) a.options = options;
  if (props.length) a.propositions = props;
  return session;
}

// gradedEvidence(session) -> attempts that are settled evidence about what the learner holds:
// not a prediction, and with a boolean verdict. Predictions are guesses about untaught steps, so
// they are motivation, not evidence of a held state.
export function gradedEvidence(session) {
  return (session.attempts || []).filter((a) => a.kind !== "predict" && typeof a.correct === "boolean");
}
