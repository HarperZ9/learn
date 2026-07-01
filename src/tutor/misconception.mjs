// Misconception tracking over the tutor's own witnessed practice log (session.attempts).
//
// INTEGRITY: this module only aggregates the operator's OWN wrong attempts and the feedback they
// were given for them. It never fabricates a "correct answer" or a "solution" field — it surfaces
// nothing more than what the operator already saw during practice, ranked so the next study
// session can prioritize the objective the operator struggles with most.

// misconceptions(session) -> [{objective, count, notes:[feedback...]}]
// Aggregates WRONG attempts (correct === false) per objective, in recorded order, ranked by
// count descending (most-misunderstood objective first). Objectives with zero wrong attempts do
// not appear at all.
export function misconceptions(session) {
  const byObjective = new Map();

  for (const a of session.attempts) {
    if (a.correct) continue; // only wrong attempts feed misconceptions
    const entry = byObjective.get(a.objective) || { objective: a.objective, count: 0, notes: [] };
    entry.count += 1;
    entry.notes.push(a.feedback || "");
    byObjective.set(a.objective, entry);
  }

  return [...byObjective.values()].sort((x, y) => y.count - x.count);
}
