import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadWorkflow } from "./workflow/schema.mjs";
import { run, resume } from "./runtime/runner.mjs";
import { FakeDriver } from "./actuation/driver.mjs";
import { saveRun, loadRun } from "./runstore.mjs";
import { buildReceipt } from "./receipt/receipt.mjs";
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
  return { code: 1, out: "usage: learn <run|resume|verify|receipt|doctor|status|assist> ..." };
}

// Direct invocation: `node src/cli.mjs ...`
const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:"));
if (invoked) {
  main(process.argv.slice(2)).then((r) => { process.stdout.write(r.out + "\n"); process.exit(r.code); });
}
