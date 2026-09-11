import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { handle, readPackageVersion } from "../src/mcp.mjs";

const packageJsonUrl = new URL("../package.json", import.meta.url);

test("readPackageVersion derives the MCP version from package metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "learn-mcp-version-"));
  const packageJsonPath = join(dir, "package.json");
  writeFileSync(packageJsonPath, JSON.stringify({ version: "9.8.7-fixture" }), "utf8");

  assert.equal(readPackageVersion(pathToFileURL(packageJsonPath)), "9.8.7-fixture");
});

test("initialize reports the package.json version in serverInfo", async () => {
  const packageVersion = JSON.parse(readFileSync(packageJsonUrl, "utf8")).version;

  const response = await handle({ jsonrpc: "2.0", id: 1, method: "initialize" });

  assert.equal(response.result.serverInfo.name, "learn");
  assert.equal(response.result.serverInfo.version, packageVersion);
});
