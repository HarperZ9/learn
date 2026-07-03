// Zero-dependency MCP stdio server (JSON-RPC 2.0, newline-delimited). Exposes ADVISORY/read tools
// only — doctor, status, verify, receipt, and a Fake-driver dry-run preview. Actuation (real runs)
// stays on the operator-driven CLI, mirroring accountable-surface's advisory-MCP discipline.
import { readFileSync } from "node:fs";
import { doctor } from "./doctor.mjs";
import { status } from "./status.mjs";
import { loadRun } from "./runstore.mjs";
import { buildReceipt } from "./receipt/receipt.mjs";
import { run } from "./runtime/runner.mjs";
import { loadWorkflow } from "./workflow/schema.mjs";
import { FakeDriver } from "./actuation/driver.mjs";
import { newSession, newSessionWithFSRS, recordAttempt, recordAttemptWithGrade, mastery } from "./tutor/tutor.mjs";
import { saveSession, loadSession } from "./tutor/tutorstore.mjs";
import { due } from "./tutor/schedule.mjs";
import { misconceptions } from "./tutor/misconception.mjs";
import { studyPlan } from "./tutor/study.mjs";
import { reverifyFiles } from "./tutor/reverify.mjs";
import "./adapters/fake.mjs";
import "./adapters/generic.mjs";
import "./adapters/lms.mjs";

export const TOOLS = [
  { name: "learn_doctor", description: "Run the integrity self-check; returns MATCH/DEGRADED with per-invariant results.", inputSchema: { type: "object", properties: {} } },
  { name: "learn_status", description: "Report engine version, capabilities, and the integrity invariants it guarantees.", inputSchema: { type: "object", properties: {} } },
  { name: "learn_verify", description: "Verify a saved run's hash-chained ledger is intact (tamper-evident).", inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] } },
  { name: "learn_receipt", description: "Return the credential-provenance receipt (logistics vs human-assessment split) for a saved run.", inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] } },
  { name: "learn_dry_run", description: "Preview a workflow with the Fake driver (no real browser): where it halts for the operator, without touching a live site.", inputSchema: { type: "object", properties: { workflowPath: { type: "string" } }, required: ["workflowPath"] } },
  { name: "learn_tutor_plan", description: "Create a tutor study session with learning objectives (the teach-you loop). Set enableFsrs to seed per-item FSRS spaced-repetition scheduling state (opt-in).", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, topic: { type: "string" }, objectives: { type: "array", items: { type: "string" } }, enableFsrs: { type: "boolean" } }, required: ["sessionId"] } },
  { name: "learn_tutor_record", description: "Record the operator's answer to a PRACTICE question (NOT the graded assessment) and whether it was correct. Optionally pass grade (0-4: fail/slip/lapse/review/easy) + now (ISO/epoch ms) to also update the per-item FSRS scheduling state.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, objective: { type: "string" }, prompt: { type: "string" }, answer: { type: "string" }, correct: { type: "boolean" }, feedback: { type: "string" }, grade: { type: "number" }, now: { type: ["string", "number"] } }, required: ["sessionId", "objective"] } },
  { name: "learn_tutor_mastery", description: "Check the mastery-gate: has the operator demonstrated readiness for the real assessment?", inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] } },
  { name: "learn_visualize_dry_run", description: "Return the telos scene-spec request that WOULD be sent to render a math/physics concept (advisory; renders nothing, actuation stays on the CLI).", inputSchema: { type: "object", properties: { concept: { type: "object" } }, required: ["concept"] } },
  { name: "learn_tutor_due", description: "Advisory, read-only: list objectives due for spaced-repetition review in a saved tutor session, most-overdue first. Set useFsrs (with an FSRS-enabled session) for retrievability-based due dates against desiredRetention.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, now: { type: ["string", "number"] }, asOf: { type: ["string", "number"] }, useFsrs: { type: "boolean" }, desiredRetention: { type: "number" } }, required: ["sessionId", "now"] } },
  { name: "learn_tutor_studyplan", description: "Advisory, read-only: return the composed study plan for a saved tutor session (due list, ranked misconceptions, study order, prerequisite readiness, mastery-gate verdict). Set useFsrs (with an FSRS-enabled session) to rank study order by retrievability (most-at-risk first) against desiredRetention.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, now: { type: ["string", "number"] }, seed: { type: ["string", "number"] }, useFsrs: { type: "boolean" }, desiredRetention: { type: "number" } }, required: ["sessionId", "now"] } },
  { name: "learn_tutor_misconceptions", description: "Advisory, read-only: return the ranked misconception aggregation (wrong attempts + the operator's own feedback) for a saved tutor session.", inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] } },
  { name: "learn_tutor_reverify", description: "Advisory, read-only: re-verify a session's emitted tutor receipts from their own recorded evidence (recomputed hash chain + re-derived mastery verdict). Failures are typed CHAIN_BROKEN / VERDICT_MISMATCH; a chainless receipt is UNVERIFIED, never verified.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, file: { type: "string" } }, required: ["sessionId"] } },
  { name: "learn_tutor_derive_schedule", description: "Advisory, read-only: re-derive the FSRS scheduling state PURELY from the session's witnessed graded attempt log and compare it to the cached itemState hint. Returns a MATCH/DRIFT/NO_FSRS_LOG verdict plus a hash-chained ledger over the graded attempts; the log-derived state is authoritative, so a stale or tampered cache is flagged as DRIFT with a per-field diff. Set optimize to seed the derivation with a per-learner initial-difficulty prior fitted from the learner's own accuracy. Never grades, never appends attempts, never moves the mastery gate.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, optimize: { type: "boolean" } }, required: ["sessionId"] } },
  { name: "learn_tutor_prooflesson", description: "Advisory, read-only: derive a lesson from a proof packet (source refs, claim, verdict, explanation scaffold, retrieval questions, verifier binding) plus a typed misconception record for DRIFT/UNVERIFIABLE packets. The lesson verdict always equals the packet verdict; a forged verdict enum is rejected; nothing is written.", inputSchema: { type: "object", properties: { packet: { type: "object" }, packetPath: { type: "string" } } } },
];

export async function dispatch(name, args = {}, { dir = process.cwd() } = {}) {
  switch (name) {
    case "learn_doctor": return await doctor();
    case "learn_status": return status();
    case "learn_verify": { const r = loadRun(dir, args.runId); return { runId: args.runId, ...r.ledger.verify() }; }
    case "learn_receipt": { const r = loadRun(dir, args.runId); return buildReceipt({ workflow: r.workflow, ledger: r.ledger, completion: r.completion }).json; }
    case "learn_dry_run": {
      const wf = loadWorkflow(JSON.parse(readFileSync(args.workflowPath, "utf8")));
      const driver = new FakeDriver();
      const res = await run(wf, { driver });
      return { status: res.status, haltedAt: res.haltedAt, steps: res.ledger.entries().map((e) => e.entry.kind) };
    }
    case "learn_tutor_plan": {
      const opts = { topic: args.topic || "", objectives: args.objectives || [] };
      const s = args.enableFsrs ? newSessionWithFSRS(opts) : newSession(opts);
      saveSession(dir, args.sessionId, s);
      return { sessionId: args.sessionId, objectives: s.objectives, fsrs: !!args.enableFsrs };
    }
    case "learn_tutor_record": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      const common = { objective: args.objective, prompt: args.prompt || "", answer: args.answer || "", feedback: args.feedback || "" };
      // grade (0-4) + now routes through the FSRS-aware path (updates per-item scheduling state too).
      if (args.grade !== undefined && args.grade !== null) {
        if (args.now === undefined || args.now === null) throw new Error("learn_tutor_record: `now` is required when `grade` is given");
        recordAttemptWithGrade(s, { ...common, grade: args.grade, correct: args.correct, now: args.now });
      } else {
        recordAttempt(s, { ...common, correct: args.correct });
      }
      saveSession(dir, args.sessionId, s);
      return { sessionId: args.sessionId, attempts: s.attempts.length };
    }
    case "learn_tutor_mastery": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      return mastery(s);
    }
    case "learn_visualize_dry_run": {
      const { toTelosSceneSpec } = await import("./interop/telos.mjs");
      return toTelosSceneSpec(args.concept || {});
    }
    case "learn_tutor_due": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      return { sessionId: args.sessionId, due: due(s, { now: args.now, asOf: args.asOf, useFSRS: !!args.useFsrs, desiredRetention: args.desiredRetention ?? 0.9 }) };
    }
    case "learn_tutor_studyplan": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      return { sessionId: args.sessionId, ...studyPlan(s, { now: args.now, seed: args.seed, useFSRS: !!args.useFsrs, desiredRetention: args.desiredRetention ?? 0.9 }) };
    }
    case "learn_tutor_misconceptions": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      return { sessionId: args.sessionId, misconceptions: misconceptions(s) };
    }
    case "learn_tutor_reverify": {
      return { sessionId: args.sessionId, ...reverifyFiles(dir, args.sessionId, { file: args.file }) };
    }
    case "learn_tutor_prooflesson": {
      const { proofLesson, misconceptionFromPacket } = await import("./tutor/prooflesson.mjs");
      const packet = args.packet || (args.packetPath ? JSON.parse(readFileSync(args.packetPath, "utf8")) : null);
      if (!packet) throw new Error("learn_tutor_prooflesson requires `packet` (object) or `packetPath` (file)");
      return { lesson: proofLesson(packet), misconception: misconceptionFromPacket(packet) };
    }
    case "learn_tutor_derive_schedule": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      const { deriveScheduleReceipt } = await import("./tutor/fsrsderive.mjs");
      return { sessionId: args.sessionId, ...deriveScheduleReceipt(s, { optimize: !!args.optimize }) };
    }
    default: throw new Error(`unknown tool: ${name}`);
  }
}

// Pure JSON-RPC handler (unit-testable). Returns a response object, or null for notifications.
export async function handle(msg, ctx = {}) {
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  if (msg.method === "initialize") {
    return reply({ protocolVersion: "2024-11-05", serverInfo: { name: "learn", version: "1.0.0" }, capabilities: { tools: {} } });
  }
  if (msg.method === "notifications/initialized") return null;
  if (msg.method === "tools/list") return reply({ tools: TOOLS });
  if (msg.method === "tools/call") {
    try {
      const out = await dispatch(msg.params?.name, msg.params?.arguments || {}, ctx);
      return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch (e) { return fail(-32000, String((e && e.message) || e)); }
  }
  if (msg.id === undefined) return null; // unknown notification
  return fail(-32601, `method not found: ${msg.method}`);
}

// stdio loop: newline-delimited JSON-RPC.
export function serve({ dir = process.cwd() } = {}) {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const res = await handle(msg, { dir });
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    }
  });
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/mcp.mjs")) serve();
