// Start a child program without handing it the caller's folder or environment.
//
// Node port of safe_spawn.py with the same rules; vendored verbatim, and the
// conformance kit compares the copy's SHA-256 with the canonical one, so
// per-tool choices are arguments, never edits. Every start resolves the
// executable to an absolute path (an override variable must hold one; a PATH
// walk skips relative entries, and on Windows a .exe anywhere beats a batch
// shim), runs in a new private empty folder unless the caller names one, passes
// an environment allowlist whose PATH keeps only absolute entries, plus
// NoDefaultCurrentDirectoryInExePath=1 on Windows, refuses cmd.exe
// metacharacters in any argument to a .cmd or .bat target, adds -P and
// PYTHONSAFEPATH=1 for a Python target (3.11 or later), and adds the named CLI
// profile's flags; an unproven profile needs a grant naming it. Messages never
// print a resolved path, an argument or a value.
// Node refuses to start a .cmd or .bat file without a shell (CVE-2024-27980),
// so a batch target starts through %SystemRoot%\System32\cmd.exe with
// /d /v:off /s /c and every argument quoted. The refusal rules match the Python
// helper exactly, which also refuses ")" where Python would leave it unquoted.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SAFE_SPAWN_VERSION = "1.0.0";
export const BATCH_SUFFIXES = [".cmd", ".bat"];
const STARTABLE = [".com", ".exe", ...BATCH_SUFFIXES];
export const CMD_UNSAFE = new Set(['"', "%", "^", "&", "|", "<", ">", "!", "\r", "\n"]);
export const CMD_UNSAFE_UNQUOTED = new Set([")"]);
export const NO_CWD_SEARCH = "NoDefaultCurrentDirectoryInExePath";
const DRAIN_MS = 5000;
export const WINDOWS_BASE_ENV = [
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "SYSTEMDRIVE", "TEMP", "TMP",
  "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "USERNAME", "APPDATA", "LOCALAPPDATA",
  "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432",
  "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)", "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE", "OS"];
export const POSIX_BASE_ENV = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL",
  "LC_CTYPE", "TMPDIR", "TZ", "TERM"];
const PYTHON_NAMES = ["python", "pythonw", "python3"];
const IS_WINDOWS = process.platform === "win32";

const profile = (name, o = {}) => Object.freeze({ name, before: [], after: [], env: [],
  proven: false, tested: "", ...o });
// The evidence for each profile lives in PROBES.md.
export const PROFILES = Object.freeze({
  claude: profile("claude", { after: ["--setting-sources", "user", "--strict-mcp-config",
    "--tools", ""], env: ["CLAUDE_CONFIG_DIR"], proven: true, tested: "2.1.251" }),
  // The prompt goes on stdin with "-": a batch shim refuses most punctuation.
  codex: profile("codex", { before: ["exec", "--ignore-user-config", "--ignore-rules",
    "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--disable", "hooks",
    "--disable", "plugins", "--disable", "memories", "--disable", "apps",
    "-c", "project_doc_max_bytes=0", "-c", "skills.include_instructions=false"],
    env: ["CODEX_HOME"], proven: true, tested: "0.144.6" }),
  gemini: profile("gemini"),
  opencode: profile("opencode"),
});

export class SpawnRefused extends Error {
  /** The child was not started. `code` is a stable machine-readable reason. */
  constructor(code, message) {
    super(message);
    this.name = "SpawnRefused";
    this.code = code;
  }
}

function runnable(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false; // missing or not executable: not a candidate
  }
}

function isAbsolute(p, windows) {
  // On Windows "\tools" hangs off the current drive, so it needs a drive or share too.
  if (windows) return path.win32.isAbsolute(p) && /^([a-zA-Z]:|\\\\)/.test(p);
  return path.posix.isAbsolute(p);
}

function getVar(env, key) {
  if (key in env) return env[key];
  const low = key.toLowerCase();
  const hit = Object.keys(env).find((k) => k.toLowerCase() === low);
  return hit === undefined ? undefined : env[hit];
}

function fromAbsolute(p, exists, windows, suffixes, code) {
  if (!isAbsolute(p, windows)) {
    throw new SpawnRefused(code, "the configured executable is not an absolute path");
  }
  let candidates = [p];
  if (windows && !STARTABLE.includes(path.win32.extname(p).toLowerCase())) {
    candidates = suffixes.map((s) => p + s);
  }
  const found = candidates.find((c) => exists(c));
  if (!found) throw new SpawnRefused(code, "the configured executable is not a runnable file");
  return found;
}

/** [as written, unquoted] for each PATH entry that is an absolute path. */
function pathEntries(value, windows) {
  return (value || "").split(windows ? ";" : ":")
    .map((r) => [r, r.trim().replace(/^"|"$/g, "")]).filter(([, b]) => b && isAbsolute(b, windows));
}

/** The absolute path of `name` (a bare name, or an absolute path), or SpawnRefused. */
export function resolve(name, { overrideVar, environ = process.env, exists = runnable,
  windows = IS_WINDOWS } = {}) {
  const listed = windows ? (getVar(environ, "PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";") : [];
  const suffixes = listed.filter((s) => STARTABLE.includes(s.toLowerCase()));
  const configured = overrideVar ? (getVar(environ, overrideVar) || "").trim() : "";
  if (configured) return fromAbsolute(configured, exists, windows, suffixes, "BAD_OVERRIDE");
  if (name.includes("/") || name.includes("\\")) {
    return fromAbsolute(name, exists, windows, suffixes, "BAD_PATH");
  }
  const lib = windows ? path.win32 : path.posix;
  const dirs = pathEntries(getVar(environ, "PATH"), windows).map(([, bare]) => bare);
  const groups = windows ? [[name + ".exe"], suffixes.map((s) => name + s)] : [[name]];
  for (const group of groups) {
    for (const d of dirs) {
      for (const n of group) {
        const candidate = lib.join(d, n);
        if (exists(candidate)) return candidate;
      }
    }
  }
  const hint = overrideVar ? ` or set ${overrideVar} to its full path` : "";
  throw new SpawnRefused("NOT_FOUND", `${name} was not found on PATH; install it${hint}`);
}

export function isBatch(p, windows = IS_WINDOWS) {
  return windows && BATCH_SUFFIXES.includes(path.win32.extname(p).toLowerCase());
}

/** True when cmd.exe would read part of this argument as a command. */
export function cmdUnsafe(arg) {
  if ([...arg].some((c) => CMD_UNSAFE.has(c))) return true;
  const quoted = arg === "" || arg.includes(" ") || arg.includes("\t");
  return !quoted && [...arg].some((c) => CMD_UNSAFE_UNQUOTED.has(c));
}

export function isPython(p) {
  const base = path.win32.basename(p).toLowerCase().replace(/\.[^.]*$/, (e) =>
    /^\.\d+$/.test(e) ? e : "");
  return PYTHON_NAMES.includes(base) || /^python3\.\d+$/.test(base);
}

/** The platform base plus `allow`, then `setEnv` on top. Nothing else passes. */
export function childEnv({ allow = [], setEnv = {}, environ = process.env,
  windows = IS_WINDOWS, python = false } = {}) {
  const norm = (k) => (windows ? k.toLowerCase() : k);
  const wanted = new Set([...(windows ? WINDOWS_BASE_ENV : POSIX_BASE_ENV), ...allow].map(norm));
  let out = Object.fromEntries(Object.entries(environ).filter(([k]) => wanted.has(norm(k))));
  for (const key of Object.keys(out).filter((k) => k.toUpperCase() === "PATH")) {
    out[key] = pathEntries(out[key], windows).map(([r]) => r).join(windows ? ";" : ":");
  }
  const forced = { ...setEnv };
  if (python) forced.PYTHONSAFEPATH = "1";
  if (windows) forced[NO_CWD_SEARCH] = "1";
  for (const [key, value] of Object.entries(forced)) {
    if (windows) out = Object.fromEntries(Object.entries(out).filter(([k]) => norm(k) !== norm(key)));
    out[key] = value;
  }
  return out;
}

/** The full argv after the profile and batch checks, or SpawnRefused. */
export function buildArgv(exe, args, { profile = null, grants = [], windows = IS_WINDOWS } = {}) {
  const prof = typeof profile === "string" ? PROFILES[profile] : profile;
  if (typeof profile === "string" && !prof) {
    throw new SpawnRefused("UNKNOWN_PROFILE", "no isolation profile has that name");
  }
  if (prof && !prof.proven && !grants.includes(prof.name)) {
    throw new SpawnRefused("GRANT_REQUIRED",
      `the ${prof.name} CLI has no proven isolation profile; a launch grant must name it`);
  }
  const argv = [exe, ...(isPython(exe) ? ["-P"] : []), ...(prof ? prof.before : []),
    ...args, ...(prof ? prof.after : [])];
  if (isBatch(exe, windows) && argv.some(cmdUnsafe)) {
    throw new SpawnRefused("UNSAFE_ARGUMENT", "a batch-file target was refused: an "
      + "argument holds characters cmd.exe would reinterpret");
  }
  return { argv, prof };
}

/** A private folder for files the child reads, and an empty working folder. */
export class Session {
  constructor(tmpdir = os.tmpdir(), prefix = "spawn-") {
    this.root = fs.mkdtempSync(path.join(tmpdir, prefix));
    this.cwd = path.join(this.root, "cwd");
    try {
      fs.mkdirSync(this.cwd);
    } catch (err) {
      this.close();
      throw err;
    }
  }

  write(name, text) {
    if (path.basename(name) !== name || ["", ".", "..", "cwd"].includes(name) || name.includes("\\")) {
      throw new Error("a session file name must be a plain name");
    }
    const p = path.join(this.root, name);
    fs.writeFileSync(p, text, { encoding: "utf8", flag: "wx" });
    return p;
  }

  close() {
    try {
      fs.rmSync(this.root, { recursive: true, force: true });
    } catch (err) {
      process.stderr.write(`[safe_spawn] could not remove a private folder (${err.code})\n`);
    }
  }
}

function stopTree(child) {
  if (IS_WINDOWS) {
    const root = getVar(process.env, "SystemRoot") || "C:\\Windows";
    const r = spawnSync(path.join(root, "System32", "taskkill.exe"),
      ["/F", "/T", "/PID", String(child.pid)], { windowsHide: true, timeout: DRAIN_MS });
    if (r.error) process.stderr.write("[safe_spawn] could not stop the process tree; "
      + "stopping the direct child only\n");
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // the group has already exited
    }
  }
  try { child.kill("SIGKILL"); } catch { /* already gone */ }
}

/** Start argv; resolve {status, stdout, stderr}; a timeout stops the whole tree. */
export function boundedRun(argv, { input, timeout, cwd, env, label = "child" } = {}) {
  let file = argv[0];
  let rest = argv.slice(1);
  const opts = { cwd, env, windowsHide: true, detached: !IS_WINDOWS };
  if (isBatch(file)) {
    const root = getVar(process.env, "SystemRoot") || "C:\\Windows";
    rest = ["/d", "/v:off", "/s", "/c", `"${argv.map((a) => `"${a}"`).join(" ")}"`];
    file = path.join(root, "System32", "cmd.exe");
    opts.windowsVerbatimArguments = true;
  }
  return new Promise((done, fail) => {
    const child = spawn(file, rest, opts);
    let stdout = "";
    let stderr = "";
    let timer = null;
    child.stdout.setEncoding("utf8").on("data", (d) => { stdout += d; });
    child.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
    child.on("error", (err) => { clearTimeout(timer); fail(err); });
    child.on("close", (status) => {
      if (timer === "fired") return;
      clearTimeout(timer);
      done({ status, stdout, stderr });
    });
    if (timeout) {
      timer = setTimeout(() => {
        timer = "fired";
        stopTree(child);
        const err = new Error(`${label} timed out after ${timeout / 1000} s`);
        err.code = "ETIMEDOUT";
        fail(err);
      }, timeout);
    }
    child.stdin.on("error", () => { /* the child closed stdin early; its output still counts */ });
    child.stdin.end(input ?? "");
  });
}

/** Resolve, check and start `name`. `args` may be a function of {name: path} for `files`. */
export async function run(name, args = [], { profile = null, overrideVar, input, timeout = 600000,
  allowEnv = [], setEnv = {}, grants = [], cwd = null, files = {}, environ = process.env,
  exists = runnable, windows = IS_WINDOWS, tmpdir, runner = boundedRun } = {}) {
  const exe = resolve(name, { overrideVar, environ, exists, windows });
  const label = path.win32.basename(name); // never the resolved path
  let session;
  try {
    session = new Session(tmpdir);
  } catch (err) {
    throw new SpawnRefused("UNAVAILABLE", `the private folder could not be made (${err.code})`);
  }
  try {
    const paths = Object.fromEntries(Object.entries(files).map(([n, t]) => [n, session.write(n, t)]));
    const { argv, prof } = buildArgv(exe, typeof args === "function" ? args(paths) : [...args],
      { profile, grants, windows });
    const env = childEnv({ allow: [...allowEnv, ...(prof ? prof.env : [])], setEnv, environ,
      windows, python: isPython(exe) });
    return await runner(argv, { input, timeout, cwd: cwd ?? session.cwd, env, label });
  } catch (err) {
    if (err instanceof SpawnRefused || err.code === "ETIMEDOUT") throw err;
    throw new SpawnRefused("UNAVAILABLE", `${label} could not be started (${err.code || err.name})`);
  } finally {
    session.close();
  }
}
