export function decide(step, { sealedKinds, allowIrreversible = false } = {}) {
  if (!sealedKinds || !sealedKinds.has(step.kind)) return { decision: "deny", reason: "undeclared step kind" };
  if (step.kind === "assess") return { decision: "needs-human", reason: "graded step — the operator performs it; the engine never answers it" };
  if (step.kind === "fill" && step.sensitive) return { decision: "needs-human", reason: "credential/payment/CAPTCHA — operator only" };
  // A `submit` (or a cost/irreversible-flagged step) is the gated action: it proceeds only with the
  // operator's run-level authorization (witnessed-auto submission), else it halts for a manual submit.
  // `complete` is a safe capture (reads the certificate), not a submission — it is not gated here.
  const gatedSubmission = step.kind === "submit" || step.cost || step.irreversible;
  if (gatedSubmission) {
    return allowIrreversible
      ? { decision: "allow", reason: "operator authorized witnessed automated submission for this run" }
      : { decision: "needs-human", reason: "submission halts for the operator (manual submission)" };
  }
  return { decision: "allow", reason: "declared logistics step" };
}
