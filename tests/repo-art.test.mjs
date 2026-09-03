// The front-page artwork is rendered from docs/art/learn.art.json, so it can go stale the moment
// somebody edits one and not the other. tools/check_repo_art.py re-renders each drawing and
// compares the result against what is committed, runs twelve other gates, and emits a receipt.
// This asserts on that receipt inside node --test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Named rather than counted, so a gate that quietly leaves the registry fails here instead of
// passing as a smaller green run.
const GATES = [
  "spec.present",
  "art.matches_spec",
  "art.render_is_deterministic",
  "art.identity_per_repository",
  "art.seed_is_recorded",
  "art.no_local_paths_or_em_dashes",
  "art.spec_words_reach_the_drawing",
  "art.note_survives_the_wrapper",
  "art.return_edge_stays_on_its_row",
  "art.every_illustration_is_shown",
  "art.tagline_stays_inside_its_rule",
  "art.outcome_fits_its_box",
  "art.the_gate_can_fail",
];

function runGates() {
  const result = spawnSync("python", [path.join(ROOT, "tools", "check_repo_art.py"), "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  // The shipped runtime needs nothing but Node. The artwork renderer is Python, so say
  // that plainly here rather than failing as an unexplained red in the middle of the suite.
  assert.notEqual(
    result.status,
    null,
    `python is needed to check the front-page artwork, and did not run here: ` +
      `${result.error && result.error.message}`
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("every artwork gate passes, and the receipt names the gate it ran", () => {
  const receipt = runGates();
  assert.equal(receipt.schema, "learn.repo-art/v1");
  assert.equal(receipt.mode, "check");
  assert.equal(receipt.passed, true);
  const byName = new Map(receipt.checks.map((c) => [c.name, c]));
  for (const name of GATES) {
    const check = byName.get(name);
    assert.ok(check, `gate ${name} is missing from the receipt`);
    assert.deepEqual(check.failures, [], name);
    assert.equal(check.passed, true, name);
  }
});

test("the receipt accounts for both diagrams and the header, each with a digest", () => {
  const receipt = runGates();
  assert.deepEqual(receipt.specs, ["docs/art/learn.art.json"]);
  assert.deepEqual(
    receipt.outputs.map((o) => o.file),
    ["docs/art/learn-header.svg", "docs/art/run-lane.svg", "docs/art/study-loop.svg"]
  );
  for (const output of receipt.outputs) {
    assert.match(output.sha256, /^[a-f0-9]{64}$/, output.file);
    assert.ok(output.bytes > 0, `${output.file} is empty`);
    assert.equal(output.spec, "docs/art/learn.art.json");
  }
});

test("a gate that cannot fail is not a gate: the outcome-box check reports an over-wide note", () => {
  // art.the_gate_can_fail covers the three geometry checks from inside the module. This
  // covers the same ground from outside it, with a throwaway spec on disk whose note is
  // far too wide for its box.
  const probe = [
    "import sys, json, tempfile, pathlib",
    "sys.path.insert(0, 'tools')",
    "import check_repo_art as gate",
    "d = pathlib.Path(tempfile.mkdtemp())",
    "box = {'label': 'L', 'note': 'ok', 'tone': 'none'}",
    "wide = {'label': 'L', 'note': 'n' * 80, 'tone': 'none'}",
    "spec = {'header': {'name': 'x', 'role': 'x', 'tagline': 'y', 'words': []},",
    "        'flows': [{'outcomes': [wide, box, box]}]}",
    "(d / 'bad.art.json').write_text(json.dumps(spec), encoding='utf-8')",
    "gate.ART = d",
    "print(len(gate.check_outcome_fits_its_box([])))",
  ].join("\n");
  const result = spawnSync("python", ["-c", probe], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(Number(result.stdout.trim()), 1, "the outcome-box gate cannot fail");
});
