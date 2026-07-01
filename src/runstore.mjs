import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "./accountability/ledger.mjs";

export function saveRun(dir, id, { workflow, ledger, status, haltedAt, completion }) {
  mkdirSync(join(dir, "runs"), { recursive: true });
  writeFileSync(join(dir, "runs", id + ".json"),
    JSON.stringify({ workflow, status, haltedAt, completion, entries: ledger.entries() }, null, 2));
}

export function loadRun(dir, id) {
  const raw = JSON.parse(readFileSync(join(dir, "runs", id + ".json"), "utf8"));
  return { ...raw, ledger: Ledger.fromEntries(raw.entries) };
}
