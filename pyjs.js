#!/usr/bin/env node
/**
 * esem CLI
 *
 * Usage:
 *   esem run index.js          — run a JS file with python: imports enabled
 *   esem node index.js         — alias for run
 *   esem --version             — show version
 *   esem --help                — show help
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { createRequire } from "module";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const LOADER_PATH = join(__dirname, "loader.js");

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log(`
  esem v${pkg.version}

  Import Python in JavaScript. No APIs needed.

  Usage:
    esem run <file.js>     Run a JS file with python: import support
    esem node <file.js>    Alias for run

  Options:
    --help, -h             Show this help
    --version, -v          Show version

  Example:
    esem run index.js

  In your JS file:
    import { python } from "esem";
    const { add } = await python("./tools.py");
    console.log(await add(2, 3)); // → 5

  Or with the import syntax:
    import tools from "python:./tools.py";
    console.log(await tools.add(2, 3));
  `);
  process.exit(0);
}

if (args[0] === "--version" || args[0] === "-v") {
  console.log(pkg.version);
  process.exit(0);
}

const command = args[0];
if (command !== "run" && command !== "node") {
  console.error(`Unknown command: ${command}. Use "esem run <file.js>"`);
  process.exit(1);
}

const scriptArgs = args.slice(1);
if (scriptArgs.length === 0) {
  console.error("No file specified. Usage: esem run <file.js>");
  process.exit(1);
}

const scriptFile = resolve(process.cwd(), scriptArgs[0]);
const extraArgs = scriptArgs.slice(1);

// Spawn Node with our loader hook
const nodeArgs = [
  `--experimental-loader=${LOADER_PATH}`,
  scriptFile,
  ...extraArgs,
];

const child = spawn(process.execPath, nodeArgs, {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd(),
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
