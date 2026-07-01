import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadWorkflow } from "./workflow/schema.mjs";
import { run, resume } from "./runtime/runner.mjs";
import { FakeDriver } from "./actuation/driver.mjs";
import { saveRun, loadRun } from "./runstore.mjs";
import { buildReceipt } from "./receipt/receipt.mjs";
import "./adapters/fake.mjs";
import "./adapters/generic.mjs";

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
    const r = await run(wf, { driver: await makeDriver(argv) });
    saveRun(dir, id, { workflow: wf, ...r });
    return { code: 0, out: `run ${id}: ${r.status}${r.haltedAt != null ? " @step " + r.haltedAt : ""}` };
  }
  if (cmd === "resume") {
    const id = argv[1]; const prev = loadRun(dir, id);
    const attest = arg(argv, "--attest");
    const humanAttest = attest ? { seq: prev.haltedAt, note: attest, at: new Date(0).toISOString() } : null;
    const r = await resume(prev.workflow, { driver: await makeDriver(argv), ledger: prev.ledger, haltedAt: prev.haltedAt, allowIrreversible: true, humanAttest });
    saveRun(dir, id, { workflow: prev.workflow, ...r });
    return { code: 0, out: `resume ${id}: ${r.status}` };
  }
  if (cmd === "verify") {
    const prev = loadRun(dir, argv[1]); const v = prev.ledger.verify();
    return { code: v.ok ? 0 : 1, out: v.ok ? "chain ok" : `chain BROKEN at ${v.brokenAt}` };
  }
  if (cmd === "receipt") {
    const id = argv[1]; const prev = loadRun(dir, id);
    const { json, markdown } = buildReceipt({ workflow: prev.workflow, ledger: prev.ledger, completion: prev.completion });
    writeFileSync(join(dir, "runs", id + ".receipt.json"), JSON.stringify(json, null, 2));
    writeFileSync(join(dir, "runs", id + ".receipt.md"), markdown);
    return { code: 0, out: `receipt written: runs/${id}.receipt.json + .md` };
  }
  return { code: 1, out: "usage: learn <run|resume|verify|receipt> ..." };
}

// Direct invocation: `node src/cli.mjs ...`
const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:"));
if (invoked) {
  main(process.argv.slice(2)).then((r) => { process.stdout.write(r.out + "\n"); process.exit(r.code); });
}
