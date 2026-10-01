// Tutor layer — the "teach you" engine. Runs the study loop: objectives -> PRACTICE (the operator
// solves) -> self-check -> MASTERY-GATE. It records the operator's own practice attempts in a
// witnessed, hash-chained log and only reports "ready" once mastery is demonstrated.
//
// INTEGRITY: this teaches. It generates/holds PRACTICE and checks the OPERATOR's answers. It does
// NOT supply answers to the real graded credential assessment — that is taken by the operator via
// the run engine, whose `assess` steps always halt. Practice ≠ the certified exam.
import { Ledger } from "../accountability/ledger.mjs";
import { initializeItems, recordAttemptWithGrade as recordItemGrade } from "./itemscheduler.mjs";

export function newSession({ topic, objectives = [] }) {
  return { topic, objectives: [...objectives], attempts: [] };
}

// newSessionWithFSRS({topic, objectives}) -> a session with per-item FSRS scheduling state seeded.
// Same shape as newSession() plus session.itemState pre-populated for each objective. The mastery
// path is unchanged: mastery()/masteryReceipt() still read session.attempts ONLY.
export function newSessionWithFSRS({ topic, objectives = [] }) {
  const s = newSession({ topic, objectives });
  initializeItems(s, objectives);
  return s;
}

// Record the operator's OWN answer to a PRACTICE question, and whether it was correct.
// `grade` (0-4) and `timestamp` (ISO) are OPTIONAL scheduling metadata for the FSRS path; they are
// only written to the attempt when provided, so the existing attempt shape is unchanged by default.
export function recordAttempt(session, { objective, prompt, answer, correct, feedback = "", grade, timestamp }) {
  const attempt = {
    objective,
    prompt: String(prompt).slice(0, 500),
    answer: String(answer).slice(0, 2000),
    correct: !!correct,
    feedback: String(feedback).slice(0, 800),
  };
  if (grade !== undefined && grade !== null) attempt.grade = grade;
  if (timestamp !== undefined && timestamp !== null) attempt.timestamp = timestamp;
  session.attempts.push(attempt);
  return session;
}

// Map a coarse correct/incorrect into an FSRS grade when no explicit grade is given:
// false -> 1 (slip), true -> 3 (review). Explicit grades (0-4) override.
function gradeFromCorrect(correct) {
  return correct ? 3 : 1;
}

// recordAttemptWithGrade(session, {objective, grade, correct, now, ...}) -> session.
//
// The FSRS-aware recording path. It does BOTH, in order:
//   1) logs the attempt to session.attempts (the witnessed graded truth) via recordAttempt(), with
//      the grade + `now` timestamp attached for the audit trail; and
//   2) updates session.itemState[objective] via the item scheduler (the derived scheduling hint).
//
// INTEGRITY: the witnessed log is written first and is authoritative; itemState is a hint layered
// on top. `correct` for the mastery gate is derived from the grade when not passed explicitly
// (grade >= 3 counts as correct), so the two stay consistent. `now` is required (no Date.now()).
export function recordAttemptWithGrade(session, { objective, prompt = "", answer = "", feedback = "", grade, correct, now } = {}) {
  if (!objective) throw new Error("recordAttemptWithGrade requires an `objective`");
  if (now === undefined || now === null) {
    throw new Error("recordAttemptWithGrade requires an explicit `now` (ISO string or epoch ms)");
  }
  const g = grade === undefined || grade === null ? gradeFromCorrect(correct) : grade;
  const isCorrect = correct === undefined || correct === null ? g >= 3 : !!correct;
  const timestamp = typeof now === "number" ? new Date(now).toISOString() : now;

  recordAttempt(session, { objective, prompt, answer, correct: isCorrect, feedback, grade: g, timestamp });
  recordItemGrade(session, { objective, grade: g, now });
  return session;
}

// Attach an AID render (from telosRender) to the study log. Renders help the operator SEE the
// concept; they NEVER count toward mastery — mastery() reads only session.attempts.
export function recordVisualization(session, { objective, render }) {
  if (!session.visualizations) session.visualizations = [];
  session.visualizations.push({ objective, render });
  return session;
}

// Mastery-gate: ready only when EVERY objective has >= minAttempts and >= threshold accuracy.
export function mastery(session, { threshold = 0.8, minAttempts = 3 } = {}) {
  const perObjective = (session.objectives.length ? session.objectives : [...new Set(session.attempts.map((a) => a.objective))])
    .map((o) => {
      const at = session.attempts.filter((a) => a.objective === o);
      const correct = at.filter((a) => a.correct).length;
      const accuracy = at.length ? correct / at.length : 0;
      const ready = at.length >= minAttempts && accuracy >= threshold;
      return { objective: o, attempts: at.length, correct, accuracy: Math.round(accuracy * 100) / 100, ready };
    });
  const ready = perObjective.length > 0 && perObjective.every((p) => p.ready);
  return { ready, threshold, minAttempts, perObjective, weakest: perObjective.filter((p) => !p.ready).map((p) => p.objective) };
}

// A witnessed mastery record: a hash-chained log of the practice the operator did + the verdict.
// Proves genuine study preceded the real assessment; the tutor never took that assessment.
export function masteryReceipt(session) {
  const m = mastery(session);
  const ledger = new Ledger();
  for (const a of session.attempts) {
    ledger.append({ kind: "practice", objective: a.objective, correct: a.correct, prompt: a.prompt });
  }
  return {
    topic: session.topic,
    objectives: session.objectives,
    totalAttempts: session.attempts.length,
    mastery: m,
    ledgerVerified: ledger.verify().ok,
    boundary: "Practice only — the operator solved these; the real graded assessment is taken by the operator, not the tutor.",
    entries: ledger.entries(),
    visualizations: session.visualizations || [],
  };
}
