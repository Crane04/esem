/**
 * Esem Bridge — Public API
 *
 * The main way to use Esem Bridge:
 *
 *   import { python } from "esem-bridge";
 *   const tools = await python("./tools.py");
 *   const result = await tools.add(2, 3);
 *
 * Or with destructuring:
 *   const { add, greet } = await python("./tools.py");
 *
 * OR use the import syntax (requires --loader flag):
 *   import tools from "python:./tools.py";
 */

import { ensureWorker, shutdown, PythonError } from "./bridge.js";
import { createModuleProxy } from "./proxy.js";

/**
 * python(moduleSpec) — load a Python module and return its proxy.
 *
 * @param {string} moduleSpec — a file path ("./tools.py") or package name ("numpy")
 * @returns {Promise<object>} — proxy object with all module exports as async functions
 *
 * @example
 * const { predict } = await python("./model.py");
 * const result = await predict({ age: 22 });
 */
export async function python(moduleSpec) {
  await ensureWorker();
  return createModuleProxy(moduleSpec);
}

export { shutdown, PythonError };
export { ensureWorker };
