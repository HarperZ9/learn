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
import { newSession, recordAttempt, mastery } from "./tutor/tutor.mjs";
import { saveSession, loadSession } from "./tutor/tutorstore.mjs";
import { due } from "./tutor/schedule.mjs";
import { misconceptions } from "./tutor/misconception.mjs";
import { studyPlan } from "./tutor/study.mjs";
import "./adapters/fake.mjs";
import "./adapters/generic.mjs";
import "./adapters/lms.mjs";

export const TOOLS = [
  { name: "learn_doctor", description: "Run the integrity self-check; returns MATCH/DEGRADED with per-invariant results.", inputSchema: { type: "object", properties: {} } },
  { name: "learn_status", description: "Report engine version, capabilities, and the integrity invariants it guarantees.", inputSchema: { type: "object", properties: {} } },
  { name: "learn_verify", description: "Verify a saved run's hash-chained ledger is intact (tamper-evident).", inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] } },
  { name: "learn_receipt", description: "Return the credential-provenance receipt (logistics vs human-assessment split) for a saved run.", inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] } },
  { name: "learn_dry_run", description: "Preview a workflow with the Fake driver (no real browser): where it halts for the operator, without touching a live site.", inputSchema: { type: "object", properties: { workflowPath: { type: "string" } }, required: ["workflowPath"] } },
  { name: "learn_tutor_plan", description: "Create a tutor study session with learning objectives (the teach-you loop).", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, topic: { type: "string" }, objectives: { type: "array", items: { type: "string" } } }, required: ["sessionId"] } },
  { name: "learn_tutor_record", description: "Record the operator's answer to a PRACTICE question (NOT the graded assessment) and whether it was correct.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, objective: { type: "string" }, prompt: { type: "string" }, answer: { type: "string" }, correct: { type: "boolean" }, feedback: { type: "string" } }, required: ["sessionId", "objective", "correct"] } },
  { name: "learn_tutor_mastery", description: "Check the mastery-gate: has the operator demonstrated readiness for the real assessment?", inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] } },
  { name: "learn_visualize_dry_run", description: "Return the telos scene-spec request that WOULD be sent to render a math/physics concept (advisory; renders nothing, actuation stays on the CLI).", inputSchema: { type: "object", properties: { concept: { type: "object" } }, required: ["concept"] } },
  { name: "learn_tutor_due", description: "Advisory, read-only: list objectives due for spaced-repetition review in a saved tutor session, most-overdue first.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, now: { type: ["string", "number"] }, asOf: { type: ["string", "number"] } }, required: ["sessionId", "now"] } },
  { name: "learn_tutor_studyplan", description: "Advisory, read-only: return the composed study plan for a saved tutor session (due list, ranked misconceptions, interleaved order, prerequisite readiness, mastery-gate verdict).", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, now: { type: ["string", "number"] }, seed: { type: ["string", "number"] } }, required: ["sessionId", "now"] } },
  { name: "learn_tutor_misconceptions", description: "Advisory, read-only: return the ranked misconception aggregation (wrong attempts + the operator's own feedback) for a saved tutor session.", inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] } },
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
      const s = newSession({ topic: args.topic || "", objectives: args.objectives || [] });
      saveSession(dir, args.sessionId, s);
      return { sessionId: args.sessionId, objectives: s.objectives };
    }
    case "learn_tutor_record": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      recordAttempt(s, { objective: args.objective, prompt: args.prompt || "", answer: args.answer || "", correct: args.correct, feedback: args.feedback || "" });
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
      return { sessionId: args.sessionId, due: due(s, { now: args.now, asOf: args.asOf }) };
    }
    case "learn_tutor_studyplan": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      return { sessionId: args.sessionId, ...studyPlan(s, { now: args.now, seed: args.seed }) };
    }
    case "learn_tutor_misconceptions": {
      const s = loadSession(dir, args.sessionId); if (!s) throw new Error("no tutor session: " + args.sessionId);
      return { sessionId: args.sessionId, misconceptions: misconceptions(s) };
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
