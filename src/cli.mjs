import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadWorkflow } from "./workflow/schema.mjs";
import { run, resume } from "./runtime/runner.mjs";
import { FakeDriver } from "./actuation/driver.mjs";
import { saveRun, loadRun } from "./runstore.mjs";
import { buildReceipt } from "./receipt/receipt.mjs";
import { Ledger } from "./accountability/ledger.mjs";
import { doctor } from "./doctor.mjs";
import { status } from "./status.mjs";
import "./adapters/fake.mjs";
import "./adapters/generic.mjs";
import "./adapters/lms.mjs";

function arg(argv, flag) { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; }

// FakeDriver by default (offline/deterministic). `--native` attaches to the operator's real
// browser via native-control (imported lazily so the CLI + tests never require it otherwise).
async function makeDriver(argv) {
  if (argv.includes("--native")) {
    const { NativeDriver } = await import("./actuation/native-driver.mjs");
    return NativeDriver.open(arg(argv, "--url") || "", { match: arg(argv, "--match") || undefined });
  }
  return new FakeDriver();
}

export async function main(argv, { dir = process.cwd() } = {}) {
  const [cmd] = argv;
  if (cmd === "run") {
    const wf = loadWorkflow(JSON.parse(readFileSync(argv[1], "utf8")));
    const id = arg(argv, "--id") || "run";
    const submissionMode = arg(argv, "--submit") === "witnessed-auto" ? "witnessed-auto" : "manual";
    const r = await run(wf, { driver: await makeDriver(argv), submissionMode });
    saveRun(dir, id, { workflow: wf, ...r });
    return { code: 0, out: `run ${id}: ${r.status}${r.haltedAt != null ? " @step " + r.haltedAt : ""}` };
  }
  if (cmd === "resume") {
    const id = argv[1]; const prev = loadRun(dir, id);
    const attest = arg(argv, "--attest");
    const humanAttest = attest ? { seq: prev.haltedAt, note: attest, at: new Date(0).toISOString() } : null;
    const submissionMode = arg(argv, "--submit") === "witnessed-auto" ? "witnessed-auto" : "manual";
    const r = await resume(prev.workflow, { driver: await makeDriver(argv), ledger: prev.ledger, haltedAt: prev.haltedAt, allowIrreversible: true, submissionMode, humanAttest });
    saveRun(dir, id, { workflow: prev.workflow, ...r });
    return { code: 0, out: `resume ${id}: ${r.status}` };
  }
  if (cmd === "verify") {
    const prev = loadRun(dir, argv[1]); const v = prev.ledger.verify();
    return { code: v.ok ? 0 : 1, out: v.ok ? "chain ok" : `chain BROKEN at ${v.brokenAt}` };
  }
  if (cmd === "receipt") {
    const id = argv[1]; const prev = loadRun(dir, id);
    const { json, markdown, html } = buildReceipt({ workflow: prev.workflow, ledger: prev.ledger, completion: prev.completion });
    writeFileSync(join(dir, "runs", id + ".receipt.json"), JSON.stringify(json, null, 2));
    writeFileSync(join(dir, "runs", id + ".receipt.md"), markdown);
    writeFileSync(join(dir, "runs", id + ".receipt.html"), html);
    return { code: 0, out: `receipt written: runs/${id}.receipt.json + .md + .html (print .html for PDF)` };
  }
  if (cmd === "doctor") {
    const d = await doctor();
    return { code: d.status === "MATCH" ? 0 : 1, out: `learn doctor: ${d.status}\n` + d.checks.map((c) => `  [${c.status}] ${c.name}`).join("\n") };
  }
  if (cmd === "status") {
    return { code: 0, out: JSON.stringify(status(), null, 2) };
  }
  if (cmd === "tutor") {
    const { newSession, recordAttempt, mastery, masteryReceipt } = await import("./tutor/tutor.mjs");
    const { saveSession, loadSession } = await import("./tutor/tutorstore.mjs");
    const sub = argv[1]; const id = argv[2];
    if (sub === "plan") {
      const s = newSession({ topic: arg(argv, "--topic") || "", objectives: (arg(argv, "--objectives") || "").split(",").map((x) => x.trim()).filter(Boolean) });
      saveSession(dir, id, s);
      return { code: 0, out: `tutor plan ${id}: ${s.objectives.length} objective(s)` };
    }
    if (sub === "record") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      recordAttempt(s, { objective: arg(argv, "--objective"), prompt: arg(argv, "--prompt") || "", answer: arg(argv, "--answer") || "", correct: arg(argv, "--correct") === "true", feedback: arg(argv, "--feedback") || "" });
      saveSession(dir, id, s);
      return { code: 0, out: `tutor record ${id}: ${s.attempts.length} practice attempt(s)` };
    }
    if (sub === "mastery") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const m = mastery(s, { threshold: Number(arg(argv, "--threshold")) || 0.8, minAttempts: Number(arg(argv, "--min")) || 3 });
      return { code: m.ready ? 0 : 1, out: `tutor mastery ${id}: ${m.ready ? "READY" : "not yet"}\n` + m.perObjective.map((p) => `  [${p.ready ? "ready" : "keep going"}] ${p.objective}: ${p.correct}/${p.attempts} (${Math.round(p.accuracy * 100)}%)`).join("\n") };
    }
    if (sub === "receipt") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const r = masteryReceipt(s);
      writeFileSync(join(dir, "tutor", id + ".mastery.json"), JSON.stringify(r, null, 2));
      return { code: 0, out: `tutor receipt ${id}: mastery ${r.mastery.ready ? "READY" : "not yet"}, ${r.totalAttempts} attempts -> tutor/${id}.mastery.json` };
    }
    if (sub === "due") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { due } = await import("./tutor/schedule.mjs");
      const now = arg(argv, "--now"); if (!now) return { code: 1, out: "tutor due: --now is required (ISO string or epoch ms)" };
      const list = due(s, { now, asOf: arg(argv, "--as-of") || undefined });
      return { code: 0, out: `tutor due ${id}: ${list.length} objective(s) due\n` + list.map((d) => `  ${d.objective} (overdue since ${d.dueAt})`).join("\n") };
    }
    if (sub === "misconceptions") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { misconceptions } = await import("./tutor/misconception.mjs");
      const list = misconceptions(s);
      return { code: 0, out: `tutor misconceptions ${id}: ${list.length} objective(s)\n` + list.map((m) => `  ${m.objective} (${m.count}x): ${m.notes.join("; ")}`).join("\n") };
    }
    if (sub === "retrieval") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { clozePrompts } = await import("./tutor/retrieval.mjs");
      const { assist } = await import("./assist/assist.mjs");
      const draftPath = arg(argv, "--draft"); if (!draftPath) return { code: 1, out: "tutor retrieval: --draft <file> is required" };
      const draft = readFileSync(draftPath, "utf8");
      const a = assist(draft);
      const prompts = clozePrompts(a, { objective: arg(argv, "--objective") || null });
      return { code: 0, out: `tutor retrieval ${id}: ${prompts.length} cloze prompt(s)\n` + prompts.map((p) => `  ${p.prompt}  [source: ${p.source || "n/a"}]`).join("\n") };
    }
    if (sub === "explain") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { explanationThesis } = await import("./tutor/explain.mjs");
      const filePath = arg(argv, "--file"); if (!filePath) return { code: 1, out: "tutor explain: --file <file> is required" };
      const explanation = readFileSync(filePath, "utf8");
      const thesis = explanationThesis(explanation);
      writeFileSync(join(dir, "tutor", id + ".explain-thesis.json"), JSON.stringify(thesis, null, 2));
      return { code: 0, out: `tutor explain ${id}: thesis with ${thesis.claims.length} claim(s) -> tutor/${id}.explain-thesis.json` };
    }
    if (sub === "predict") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { recordPrediction } = await import("./tutor/predict.mjs");
      recordPrediction(s, { objective: arg(argv, "--objective"), prompt: arg(argv, "--prompt") || "", prediction: arg(argv, "--prediction") || "" });
      saveSession(dir, id, s);
      return { code: 0, out: `tutor predict ${id}: prediction recorded as pending attempt ${s.attempts.length - 1}` };
    }
    if (sub === "score") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { scorePrediction } = await import("./tutor/predict.mjs");
      const index = Number(arg(argv, "--index"));
      scorePrediction(s, { index, correct: arg(argv, "--correct") === "true", note: arg(argv, "--note") || "" });
      saveSession(dir, id, s);
      return { code: 0, out: `tutor score ${id}: attempt ${index} scored` };
    }
    if (sub === "path") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { learningPath } = await import("./tutor/map.mjs");
      const path = learningPath(s.objectives);
      return { code: 0, out: `tutor path ${id}: ${path.join(" -> ")}` };
    }
    if (sub === "study") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { studyPlan } = await import("./tutor/study.mjs");
      const now = arg(argv, "--now"); if (!now) return { code: 1, out: "tutor study: --now is required (ISO string or epoch ms)" };
      const plan = studyPlan(s, { now, seed: arg(argv, "--seed") || undefined });
      return { code: 0, out: `tutor study ${id}: ${plan.due.length} due, ${plan.misconceptions.length} misconception(s), mastery ${plan.mastery.ready ? "READY" : "not yet"}\n` +
        `  due: ${plan.due.map((d) => d.objective).join(", ") || "(none)"}\n` +
        `  order: ${plan.order.join(", ")}\n` +
        `  readiness: ${plan.readiness.map((r) => `${r.objective}:${r.unlocked ? "unlocked" : "locked"}`).join(", ")}` };
    }
    if (sub === "study-receipt") {
      const s = loadSession(dir, id); if (!s) return { code: 1, out: `no tutor session: ${id}` };
      const { studyReceipt } = await import("./tutor/study.mjs");
      const now = arg(argv, "--now"); if (!now) return { code: 1, out: "tutor study-receipt: --now is required (ISO string or epoch ms)" };
      const r = studyReceipt(s, { now, seed: arg(argv, "--seed") || undefined });
      writeFileSync(join(dir, "tutor", id + ".study-receipt.json"), JSON.stringify(r, null, 2));
      return { code: 0, out: `tutor study-receipt ${id}: verified ${r.verified}, mastery ${r.mastery.ready ? "READY" : "not yet"} -> tutor/${id}.study-receipt.json` };
    }
    return { code: 1, out: "usage: learn tutor <plan|record|mastery|receipt|due|misconceptions|retrieval|explain|predict|score|path|study|study-receipt> <id> ..." };
  }
  if (cmd === "assist") {
    const { assistArtifacts } = await import("./assist/assist.mjs");
    const draft = readFileSync(argv[1], "utf8");
    const out = arg(argv, "--out") || join(dir, "assist");
    mkdirSync(out, { recursive: true });
    const art = assistArtifacts(draft, { title: arg(argv, "--title") || undefined });
    writeFileSync(join(out, "assist.json"), JSON.stringify(art.assist, null, 2));
    writeFileSync(join(out, "crucible-thesis.json"), JSON.stringify(art.crucibleThesis, null, 2));
    writeFileSync(join(out, "gather-manifest.json"), JSON.stringify(art.gatherManifest, null, 2));
    let extra = "";
    if (argv.includes("--crucible")) {
      const { crucibleAssess } = await import("./interop/crucible.mjs");
      const r = crucibleAssess(join(out, "crucible-thesis.json"));
      extra += `\ncrucible: ${r.ran ? ("ran (exit " + r.code + ")") : r.reason}`;
    }
    if (argv.includes("--gather")) {
      const { gatherRun } = await import("./interop/gather.mjs");
      const r = gatherRun(art.gatherManifest.sources);
      extra += `\ngather: ${r.ran ? (r.receipts.length + " source(s) processed") : r.reason}`;
    }
    return { code: 0, out: `assist: ${art.assist.claims.length} claim(s) + ${art.assist.sources.length} source(s) -> ${out}/{assist,crucible-thesis,gather-manifest}.json (authors nothing — flags what YOU verify)${extra}` };
  }
  if (cmd === "visualize") {
    const { toTelosSceneSpec, telosRender, toAidLedgerEntry } = await import("./interop/telos.mjs");
    const concept = JSON.parse(readFileSync(argv[1], "utf8"));
    const out = arg(argv, "--out") || join(dir, "runs");
    mkdirSync(out, { recursive: true });
    const spec = toTelosSceneSpec(concept);
    const specPath = join(out, "scene-request.json");
    writeFileSync(specPath, JSON.stringify(spec, null, 2));
    const render = telosRender(specPath);
    const ledger = new Ledger();
    ledger.append(toAidLedgerEntry(render, { concept, seq: 0 }));
    const slug = (spec.concept.title || "concept").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "concept";
    const aidReceipt = { provenance: "aid", concept: spec.concept, request: spec, render, ledger: ledger.entries(), verified: ledger.verify().ok,
      note: "Learning aid — this render never satisfies graded work; the operator still does every assessment." };
    writeFileSync(join(out, slug + ".aid.json"), JSON.stringify(aidReceipt, null, 2));
    return { code: 0, out: `visualize: ${spec.concept.title || "(concept)"} -> ${render.verdict}${render.selected_profile ? " (profile " + render.selected_profile + ")" : ""}, provenance aid -> ${out}/${slug}.aid.json` };
  }
  return { code: 1, out: "usage: learn <run|resume|verify|receipt|doctor|status|assist|tutor|visualize> ..." };
}

// Direct invocation: `node src/cli.mjs ...`
const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:"));
if (invoked) {
  main(process.argv.slice(2)).then((r) => { process.stdout.write(r.out + "\n"); process.exit(r.code); });
}
