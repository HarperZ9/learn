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
