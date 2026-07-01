import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { newSession } from "./tutor.mjs";

export function saveSession(dir, id, session) {
  mkdirSync(join(dir, "tutor"), { recursive: true });
  writeFileSync(join(dir, "tutor", id + ".json"), JSON.stringify(session, null, 2));
}

export function loadSession(dir, id) {
  const p = join(dir, "tutor", id + ".json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function loadOrCreate(dir, id, { topic = "", objectives = [] } = {}) {
  return loadSession(dir, id) || newSession({ topic, objectives });
}
