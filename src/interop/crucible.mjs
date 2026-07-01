// crucible interop — turn assist-extracted claims into a crucible thesis (the exact shape
// crucible_assess consumes: {title, disposition, claims:[{text, falsification}]}), and optionally
// shell out to the crucible CLI to get MATCH/DRIFT/UNVERIFIABLE verdicts. Zero-dep (node builtins).
import { spawnSync } from "node:child_process";

export function toCrucibleThesis(assistResult, { title = "Assisted work — claims to verify", disposition = "publishable" } = {}) {
  return {
    title,
    disposition,
    // Operator (or crucible measurements) supplies falsification/evidence; text is the operator's claim.
    claims: (assistResult.claims || []).map((c) => ({ text: c.text, falsification: "" })),
  };
}

// Optional shell-out. Configure LEARN_CRUCIBLE_CMD, e.g. "python -m crucible" (must accept `assess <thesis>`).
export function crucibleAssess(thesisPath, { cmd = process.env.LEARN_CRUCIBLE_CMD, measurementsPath = null } = {}) {
  if (!cmd) return { ran: false, reason: "no crucible command configured (set LEARN_CRUCIBLE_CMD)" };
  const parts = cmd.split(/\s+/).filter(Boolean);
  const args = [...parts.slice(1), "assess", thesisPath];
  if (measurementsPath) args.push(measurementsPath);
  const res = spawnSync(parts[0], args, { encoding: "utf8", timeout: 120000 });
  if (res.error) return { ran: false, reason: String(res.error.message) };
  let verdicts = null; try { verdicts = JSON.parse(res.stdout); } catch {}
  return { ran: true, code: res.status, verdicts, stdout: res.stdout };
}
