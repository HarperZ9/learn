export function decide(step, { sealedKinds, allowIrreversible = false } = {}) {
  if (!sealedKinds || !sealedKinds.has(step.kind)) return { decision: "deny", reason: "undeclared step kind" };
  if (step.kind === "assess") return { decision: "needs-human", reason: "graded step — the operator performs it; the engine never answers it" };
  if (step.kind === "fill" && step.sensitive) return { decision: "needs-human", reason: "credential/payment/CAPTCHA — operator only" };
  const irreversible = step.kind === "submit" || step.kind === "complete" || step.cost || step.irreversible;
  if (irreversible) {
    return allowIrreversible
      ? { decision: "allow", reason: "operator confirmed irreversible actions for this run" }
      : { decision: "needs-human", reason: "irreversible/cost step needs explicit operator confirm" };
  }
  return { decision: "allow", reason: "declared logistics step" };
}
