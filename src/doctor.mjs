// Operator-spine self-check: exercises the load-bearing integrity invariants AT RUNTIME and
// reports MATCH / DEGRADED (like crucible_doctor). If any construction were weakened, a check fails.
import { version } from "./index.mjs";
import { decide } from "./accountability/gate.mjs";
import { Ledger } from "./accountability/ledger.mjs";
import { run } from "./runtime/runner.mjs";
import { loadWorkflow, STEP_KINDS } from "./workflow/schema.mjs";
import { FakeDriver } from "./actuation/driver.mjs";
import "./adapters/fake.mjs";

export async function doctor() {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, status: ok ? "MATCH" : "FAIL", detail });

  // 1. assess never resolves to allow
  add("gate.assess_never_allow",
    decide({ kind: "assess" }, { sealedKinds: STEP_KINDS, allowIrreversible: true }).decision === "needs-human");

  // 2. e2e: an assess step halts before any actuation
  const wf = loadWorkflow({ adapter: "fake", course: "doctor", steps: [{ kind: "assess", label: "x" }, { kind: "complete" }] });
  const d1 = new FakeDriver();
  const r1 = await run(wf, { driver: d1 });
  add("runtime.assess_halts_no_actuation", r1.status === "halted-assess" && d1.actions.length === 0);

  // 3. default-deny: an undeclared step kind is denied, nothing actuated
  const d2 = new FakeDriver();
  const r2 = await run({ adapter: "fake", course: "d", seal: "x", steps: [{ kind: "wipe", id: 0 }] }, { driver: d2 });
  add("runtime.default_deny_undeclared", r2.status === "denied" && d2.actions.length === 0);

  // 4. ledger tamper is detected
  const l = new Ledger(); l.append({ a: 1 }); l.append({ a: 2 }); l.entries()[0].entry.a = 9;
  add("ledger.tamper_detected", l.verify().ok === false);

  const ok = checks.every((c) => c.status === "MATCH");
  return { tool: "learn", version, status: ok ? "MATCH" : "DEGRADED", checks };
}
