// gather interop — turn assist-extracted sources into a gather manifest, and optionally shell out
// to the gather CLI to mint source receipts. Zero-dep (node builtins).
import { spawnSync } from "node:child_process";

export function toGatherManifest(assistResult) {
  return { sources: [...new Set(assistResult.sources || [])] };
}

// Optional shell-out. Configure LEARN_GATHER_CMD, e.g. "python -m gather" (must accept `run <url>`).
export function gatherRun(sources, { cmd = process.env.LEARN_GATHER_CMD } = {}) {
  if (!cmd) return { ran: false, reason: "no gather command configured (set LEARN_GATHER_CMD)" };
  const parts = cmd.split(/\s+/).filter(Boolean);
  const receipts = [];
  for (const s of sources) {
    const res = spawnSync(parts[0], [...parts.slice(1), "run", s], { encoding: "utf8", timeout: 120000 });
    receipts.push({ source: s, ran: !res.error, code: res.status ?? null, out: (res.stdout || "").slice(0, 400) });
  }
  return { ran: true, receipts };
}
