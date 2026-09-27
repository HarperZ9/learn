// With LEARN_NATIVE_CONTROL unset, a native run fails at once with a setup message and imports
// nothing. Runs in a child process so the module reads a clean environment. Not run against the
// released 1.6.0 tree: that version would import from a local path instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DRIVER = pathToFileURL(fileURLToPath(new URL("../src/actuation/native-driver.mjs", import.meta.url))).href;

test("NativeDriver.open without LEARN_NATIVE_CONTROL fails with a setup instruction", () => {
  const env = { ...process.env };
  delete env.LEARN_NATIVE_CONTROL;
  const script = `import(${JSON.stringify(DRIVER)}).then((m) => m.NativeDriver.open()).then(() => console.log("OPENED"), (e) => console.log(e.message));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env, encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /set LEARN_NATIVE_CONTROL/);
  assert.doesNotMatch(r.stdout, /OPENED/);
});
