/**
 * PyJS Bridge — Node.js ESM Loader Hook
 *
 * Intercepts:
 *   import tools from "python:./tools.py"
 *   import numpy from "python:numpy"
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_URL = new URL("./bridge.js", import.meta.url).href;
const PROXY_URL = new URL("./proxy.js", import.meta.url).href;

const PYTHON_PREFIX = "python:";

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(PYTHON_PREFIX)) {
    const moduleSpec = specifier.slice(PYTHON_PREFIX.length);
    return {
      shortCircuit: true,
      url: `pyjs://${encodeURIComponent(moduleSpec)}`,
    };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (!url.startsWith("pyjs://")) {
    return nextLoad(url, context);
  }

  const moduleSpec = decodeURIComponent(url.slice("pyjs://".length));

  const source = `
import { ensureWorker } from ${JSON.stringify(BRIDGE_URL)};
import { createModuleProxy } from ${JSON.stringify(PROXY_URL)};

await ensureWorker();
const __mod = await createModuleProxy(${JSON.stringify(moduleSpec)});

export default __mod;
export { __mod as mod };
`;

  return {
    shortCircuit: true,
    format: "module",
    source,
  };
}
