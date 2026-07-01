// Operator-spine self-check: exercises the load-bearing integrity invariants AT RUNTIME and
// reports MATCH / DEGRADED (like crucible_doctor). If any construction were weakened, a check fails.
import { version } from "./index.mjs";
import { decide } from "./accountability/gate.mjs";
import { Ledger } from "./accountability/ledger.mjs";
import { run } from "./runtime/runner.mjs";
import { loadWorkflow, STEP_KINDS } from "./workflow/schema.mjs";
import { FakeDriver } from "./actuation/driver.mjs";
import "./adapters/fake.mjs";
import { telosRender, toAidLedgerEntry } from "./interop/telos.mjs";
import { buildReceipt } from "./receipt/receipt.mjs";
import { newSession, recordAttempt, mastery, recordVisualization } from "./tutor/tutor.mjs";
import { recordPrediction } from "./tutor/predict.mjs";

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

  // 5. telos render is fail-closed with no engine configured (never throws, tagged aid)
  const fc = telosRender("x.json", { cmd: "" });
  add("telos.render_fail_closed", fc.ran === false && fc.verdict === "UNVERIFIABLE" && fc.provenance === "aid");

  // 6. an aid render is filed under aidVisualizations and NEVER as graded work
  const al = new Ledger();
  al.append(toAidLedgerEntry({ verdict: "MATCH", result_hash: "sha256:b" }, { concept: "probe", seq: 0 }));
  const rj = buildReceipt({ workflow: { course: "d", seal: "s" }, ledger: al, completion: null }).json;
  add("receipt.aid_never_graded", rj.aidVisualizations.length === 1 && rj.humanAssessments.length === 0 && rj.witnessedAutoSubmissions.length === 0 && rj.manualSubmissions.length === 0);

  // 7. mastery is render/visualization-independent: a session with a mastered practice log stays
  // MATCH (ready, same accuracy) regardless of attached aid renders — attaching a visualization
  // must never move the needle on mastery. Separately, a PENDING prediction (correct: null) must
  // never be silently read as a correct attempt — mastery is a function of the operator's own
  // SCORED practice attempts only, never of a render or an unscored prediction.
  const ms = newSession({ topic: "doctor-probe", objectives: ["x"] });
  recordAttempt(ms, { objective: "x", prompt: "q1", answer: "a", correct: true });
  recordAttempt(ms, { objective: "x", prompt: "q2", answer: "a", correct: true });
  recordAttempt(ms, { objective: "x", prompt: "q3", answer: "a", correct: true });
  const masteryBefore = mastery(ms, { threshold: 0.8, minAttempts: 3 });
  recordVisualization(ms, { objective: "x", render: { verdict: "MATCH", result_hash: "sha256:doctor" } });
  const masteryAfterViz = mastery(ms, { threshold: 0.8, minAttempts: 3 });
  recordPrediction(ms, { objective: "x", prompt: "predict", prediction: "pending" }); // correct: null
  const masteryAfterPrediction = mastery(ms, { threshold: 0.8, minAttempts: 3 });
  add("tutor.mastery_render_visualization_independent",
    masteryBefore.ready === true &&
    masteryAfterViz.ready === true &&
    masteryAfterViz.perObjective[0].correct === masteryBefore.perObjective[0].correct &&
    masteryAfterViz.perObjective[0].attempts === masteryBefore.perObjective[0].attempts &&
    ms.visualizations.length === 1 &&
    // the pending prediction is counted as an attempt but NEVER as correct (no silent pass)
    masteryAfterPrediction.perObjective[0].attempts === masteryBefore.perObjective[0].attempts + 1 &&
    masteryAfterPrediction.perObjective[0].correct === masteryBefore.perObjective[0].correct);

  const ok = checks.every((c) => c.status === "MATCH");
  return { tool: "learn", version, status: ok ? "MATCH" : "DEGRADED", checks };
}
