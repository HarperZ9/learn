// Tutor layer — the "teach you" engine. Runs the study loop: objectives -> PRACTICE (the operator
// solves) -> self-check -> MASTERY-GATE. It records the operator's own practice attempts in a
// witnessed, hash-chained log and only reports "ready" once mastery is demonstrated.
//
// INTEGRITY: this teaches. It generates/holds PRACTICE and checks the OPERATOR's answers. It does
// NOT supply answers to the real graded credential assessment — that is taken by the operator via
// the run engine, whose `assess` steps always halt. Practice ≠ the certified exam.
import { Ledger } from "../accountability/ledger.mjs";

export function newSession({ topic, objectives = [] }) {
  return { topic, objectives: [...objectives], attempts: [] };
}

// Record the operator's OWN answer to a PRACTICE question, and whether it was correct.
export function recordAttempt(session, { objective, prompt, answer, correct, feedback = "" }) {
  session.attempts.push({
    objective,
    prompt: String(prompt).slice(0, 500),
    answer: String(answer).slice(0, 2000),
    correct: !!correct,
    feedback: String(feedback).slice(0, 800),
  });
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
  };
}
