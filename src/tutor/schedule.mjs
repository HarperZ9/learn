// Spaced-repetition scheduler over the tutor's own witnessed practice log (session.attempts).
//
// INTEGRITY: this module only READS session.attempts (the operator's own past practice) and
// decides WHEN to re-practice each objective. It never generates or reveals an answer; it only
// says "objective X is due for another practice attempt." `now` is always passed in explicitly
// (ISO string or epoch ms) so scheduling stays deterministic and testable — no Date.now() here.
//
// Model: SM-2-lite / Leitner ladder. Because attempts don't carry per-attempt timestamps (the
// tutor's practice log is a plain ordered list), the interval "clock" is anchored at the moment
// reviewState() is asked to evaluate — i.e. dueAt = now + intervalDays, where intervalDays is
// derived from the objective's current consecutive-correct streak. A wrong attempt resets the
// streak (and interval) to the Leitner box 1 (1 day).

const LADDER_DAYS = [1, 2, 4, 7, 14, 30, 60]; // Leitner-style box intervals, indexed by streak

function toEpochMs(now) {
  if (now === undefined || now === null) {
    throw new Error("reviewState/due require an explicit `now` (ISO string or epoch ms)");
  }
  const ms = typeof now === "number" ? now : new Date(now).getTime();
  if (!Number.isFinite(ms)) {
    throw new Error("reviewState/due require a valid `now` (ISO string or epoch ms)");
  }
  return ms;
}

function intervalDaysForStreak(streak) {
  const idx = Math.min(Math.max(streak, 0), LADDER_DAYS.length - 1);
  return LADDER_DAYS[idx];
}

// Walk an objective's attempts in recorded order and derive {seen, streak}.
// streak = current run of consecutive-correct attempts ending at the most recent attempt.
function foldAttempts(attempts) {
  let streak = 0;
  for (const a of attempts) {
    streak = a.correct ? streak + 1 : 0;
  }
  return { seen: attempts.length, streak };
}

// reviewState(session, {now}) -> per-objective {objective, seen, streak, intervalDays, dueAt, due}
//
// Practice attempts carry no per-attempt timestamp, so the last practice event for an objective
// is treated as having just happened "now" (the instant reviewState is asked to evaluate the
// session) — i.e. the caller is expected to invoke reviewState with the `now` at which the
// attempts were actually last recorded. dueAt = now + intervalDays: the objective is next due
// that many days after this evaluation instant. An objective with zero attempts has no anchor
// yet, so it is due immediately (dueAt = now).
//
// To check whether a PREVIOUSLY scheduled review has come due, callers keep the `now` used at
// last recording (or persist the returned dueAt) and compare against dueAt directly; due() below
// is the convenience form of that comparison for the common case of "evaluate freshness against
// an explicit prior dueAt".
export function reviewState(session, { now } = {}) {
  const nowMs = toEpochMs(now);
  const objectives = session.objectives && session.objectives.length
    ? session.objectives
    : [...new Set(session.attempts.map((a) => a.objective))];

  return objectives.map((objective) => {
    const attempts = session.attempts.filter((a) => a.objective === objective);
    const { seen, streak } = foldAttempts(attempts);
    const intervalDays = intervalDaysForStreak(streak);

    if (seen === 0) {
      return { objective, seen, streak, intervalDays, dueAt: new Date(nowMs).toISOString(), due: true };
    }

    const dueAtMs = nowMs + intervalDays * 86400000;
    return { objective, seen, streak, intervalDays, dueAt: new Date(dueAtMs).toISOString(), due: false };
  });
}

// due(session, {now, asOf}) -> objectives due for review, most-overdue first.
//
// `now` is the instant being checked against. `asOf` (optional, defaults to `now`) is the instant
// at which the objectives' review clocks were last anchored — i.e. the `now` that was passed to
// reviewState() when the attempts were recorded/last scheduled. Passing only `now` answers "is
// anything due right now, freshly evaluated" (only never-practiced objectives qualify, since a
// clock anchored at `now` itself can't already be in the past). Passing an earlier `asOf` answers
// "given objectives were last scheduled as of `asOf`, what's due by `now`".
export function due(session, { now, asOf } = {}) {
  const nowMs = toEpochMs(now);
  const anchorAt = asOf === undefined ? now : asOf;
  const states = reviewState(session, { now: anchorAt });

  const results = states
    .map((s) => ({ ...s, due: nowMs >= new Date(s.dueAt).getTime() }))
    .filter((s) => s.due);

  return results.sort((a, b) => {
    const overdueA = nowMs - new Date(a.dueAt).getTime();
    const overdueB = nowMs - new Date(b.dueAt).getTime();
    return overdueB - overdueA;
  });
}
