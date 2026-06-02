/**
 * Esem Bridge — Bridge Runtime
 * Spawns and manages the Python worker process.
 * All communication goes through this module.
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "worker.py");

let workerProcess = null;
let pendingRequests = new Map(); // id → { resolve, reject }
let requestCounter = 0;
let isReady = false;
let readyResolve = null;
let readyPromise = new Promise((res) => (readyResolve = res));

function setWorkerReferenced(childProcess, referenced) {
  const method = referenced ? "ref" : "unref";

  childProcess[method]();
  for (const stream of childProcess.stdio) {
    if (typeof stream?.[method] === "function") stream[method]();
  }
}

function unrefWorkerIfIdle(childProcess) {
  if (pendingRequests.size === 0 && workerProcess === childProcess) {
    setWorkerReferenced(childProcess, false);
  }
}

/**
 * Start the Python worker if it isn't running yet.
 */
export function ensureWorker() {
  if (workerProcess) return readyPromise;

  const pythonBin = process.env.ESEM_PYTHON || "python3";

  const childProcess = spawn(pythonBin, [WORKER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    // Pass the calling project's cwd so relative imports resolve correctly
    cwd: process.cwd(),
  });
  workerProcess = childProcess;

  // Read responses line by line
  const rl = createInterface({ input: childProcess.stdout });

  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("[esem] Bad JSON from worker:", line);
      return;
    }

    if (msg.type === "ready") {
      isReady = true;
      readyResolve();
      unrefWorkerIfIdle(childProcess);
      return;
    }

    const pending = pendingRequests.get(msg.id);
    if (!pending) return;
    pendingRequests.delete(msg.id);

    if (msg.type === "error") {
      const err = new PythonError(msg.error, msg.traceback, msg.error_type);
      pending.reject(err);
    } else {
      pending.resolve(msg);
    }
    unrefWorkerIfIdle(childProcess);
  });

  childProcess.stderr.on("data", (data) => {
    // Python stderr — print it but don't crash
    process.stderr.write(`[python] ${data}`);
  });

  childProcess.on("exit", (code) => {
    // A previous worker can finish exiting after a new one has started.
    if (workerProcess !== childProcess) return;

    if (code !== 0 && code !== null) {
      console.error(`[esem] Python worker exited with code ${code}`);
    }
    workerProcess = null;
    isReady = false;
    // Reject all pending requests
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error("Python worker exited unexpectedly"));
    }
    pendingRequests.clear();
  });

  return readyPromise;
}

/**
 * Send a request to the Python worker and wait for a response.
 */
export async function rpc(action, payload = {}) {
  await ensureWorker();

  const id = ++requestCounter;

  return new Promise((resolve, reject) => {
    const childProcess = workerProcess;
    pendingRequests.set(id, { resolve, reject });
    const message = JSON.stringify({ id, action, ...payload }) + "\n";
    setWorkerReferenced(childProcess, true);
    childProcess.stdin.write(message);
  });
}

/**
 * Shut down the Python worker cleanly.
 */
export function shutdown() {
  if (workerProcess) {
    const childProcess = workerProcess;
    workerProcess = null;
    childProcess.stdin.end();
  }
  pendingRequests.clear();
  isReady = false;
  // Reset for next potential startup
  readyPromise = new Promise((res) => (readyResolve = res));
}

// Shut down cleanly on process exit
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });


/**
 * PythonError — an Error subclass that carries Python traceback info.
 */
export class PythonError extends Error {
  constructor(message, traceback, errorType) {
    super(message);
    this.name = errorType ? `PythonError(${errorType})` : "PythonError";
    this.pythonTraceback = traceback || "";
    this.isPythonError = true;
  }
}
