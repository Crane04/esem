import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("supports python: imports through the loader", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-loader", "./loader.js", "./example/loader-entry.js"],
    { cwd: root, encoding: "utf8", timeout: 5000 }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "42");
});

test("exits automatically after API calls finish", () => {
  const result = spawnSync(
    process.execPath,
    ["./example/api-auto-shutdown-entry.js"],
    { cwd: root, encoding: "utf8", timeout: 5000 }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "42");
});
