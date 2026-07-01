// Status envelope — capabilities + the integrity constraints the engine guarantees.
import { version } from "./index.mjs";
import { STEP_KINDS } from "./workflow/schema.mjs";

export function status() {
  return {
    tool: "learn",
    version,
    kind: "accountable credential & coursework engine",
    stepKinds: [...STEP_KINDS],
    drivers: ["fake", "native"],
    adapters: ["fake", "generic", "coursera", "udemy", "linkedin-learning", "edx", "credly", "microsoft-learn", "nonprofitready", "selfpaced"],
    receiptFormats: ["json", "markdown", "html"],
    interop: { crucible: "claims -> thesis -> MATCH/DRIFT/UNVERIFIABLE", gather: "sources -> receipts", telosEngine: "concept -> math_physics scene-spec -> witnessed AID render (learning aid; never graded work)" },
    submissionModes: {
      manual: "engine halts at each submit; the operator clicks submit",
      "witnessed-auto": "engine performs the submit via actuation with operator authorization, recording a witnessed before/after digest of exactly what was submitted",
    },
    note: "submission mode affects `submit` only; `assess` (graded work) always halts regardless.",
    tutor: "teach-you loop: objectives -> practice (operator solves) -> self-check -> mastery-gate; witnessed practice log; never supplies real graded-assessment answers",
    learningLoop: {
      schedule: "spaced repetition (SM-2-lite/Leitner ladder) over the operator's own practice log; due() reports objectives due for review, most-overdue first",
      misconception: "aggregates the operator's own WRONG attempts + their feedback per objective, ranked by count, to prioritize the next study session",
      retrieval: "clozePrompts turns the operator's OWN assist-extracted claims into blanked recall prompts carrying a source; interleave() gives a deterministic (seeded, no Math.random) mixed study order",
      explain: "self-explanation: wraps the operator's OWN explanation into a crucible thesis and buckets MATCH/DRIFT/UNVERIFIABLE verdicts into grounded/shaky/unverifiable",
      predict: "predict-then-observe: records the operator's OWN prediction as a pending attempt, scored only after they compare it to a rendered aid observation",
      map: "normalizes objectives (string or {id,text,requires}), computes a topological learningPath, and gates readiness on prerequisite mastery",
      study: "orchestrator composing due + misconceptions + interleaved order + readiness + mastery into one studyPlan, and a witnessed hash-chained studyReceipt",
      boundary: "every learning-loop capability generates practice, structures study, or checks the operator's OWN work — never produces, hints, or auto-fills an answer to a certified/graded assessment",
    },
    integrityInvariants: [
      "assess steps never auto-complete — the engine halts for the operator",
      "default-deny — only known step kinds run",
      "every step is witnessed and the ledger is hash-chained (tamper-evident)",
      "the receipt separates automated logistics from human assessment",
      "credentials, payment, CAPTCHA, and account creation halt for the operator",
      "aid visualizations are learning aids only — they are witnessed but never satisfy an assess step or enter the graded receipt channels",
    ],
    boundary: "The engine never produces graded work. It is a learning aid, not a bypass.",
  };
}
