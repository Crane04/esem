/**
 * PyJS Bridge — Proxy System
 * Wraps Python modules, functions, and objects as natural JS-callable proxies.
 */

import { rpc, PythonError } from "./bridge.js";

/**
 * Serialize a JS value to the wire format the Python worker expects.
 */
function serialize(value) {
  if (value === null || value === undefined) {
    return { type: "null", value: null };
  }
  if (typeof value === "boolean") {
    return { type: "bool", value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { type: "int", value }
      : { type: "float", value };
  }
  if (typeof value === "string") {
    return { type: "str", value };
  }
  if (Array.isArray(value)) {
    return { type: "list", value: value.map(serialize) };
  }
  if (typeof value === "object") {
    if (value.__pyjs_ref_id) {
      // Passing a Python proxy back to Python
      return { type: "proxy", ref_id: value.__pyjs_ref_id };
    }
    return {
      type: "dict",
      value: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, serialize(v)])
      ),
    };
  }
  // Fallback
  return { type: "str", value: String(value) };
}

/**
 * Deserialize a wire-format value from Python into a JS value.
 */
function deserialize(data) {
  if (!data || typeof data !== "object" || !("type" in data)) return data;
  const { type, value } = data;
  if (type === "null") return null;
  if (type === "bool" || type === "int" || type === "float" || type === "str") return value;
  if (type === "list") return value.map(deserialize);
  if (type === "dict") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deserialize(v)])
    );
  }
  if (type === "proxy") {
    // Return a lazy proxy object for now — methods resolved on demand
    return createObjectProxy(data.ref_id, {});
  }
  return value;
}


/**
 * createModuleProxy — wraps an entire Python module.
 * Returns an object where each export is a callable JS function.
 */
export async function createModuleProxy(moduleSpec) {
  const response = await rpc("load", { module: moduleSpec });
  const { exports } = response;

  const proxy = {};

  for (const [name, meta] of Object.entries(exports)) {
    if (meta.kind === "function") {
      proxy[name] = createFunctionProxy(moduleSpec, name);
    } else if (meta.kind === "class") {
      proxy[name] = createClassProxy(moduleSpec, name);
    } else {
      // It's a plain value — fetch it lazily
      Object.defineProperty(proxy, name, {
        get: async () => {
          const res = await rpc("call", {
            module: moduleSpec,
            function: name,
            args: [],
          });
          return deserialize(res.result);
        },
        enumerable: true,
      });
    }
  }

  return proxy;
}


/**
 * createFunctionProxy — wraps a single Python function.
 */
export function createFunctionProxy(moduleSpec, funcName) {
  return async function (...args) {
    const serializedArgs = args.map(serialize);
    const response = await rpc("call", {
      module: moduleSpec,
      function: funcName,
      args: serializedArgs,
    });
    return deserialize(response.result);
  };
}


/**
 * createClassProxy — returns an async factory function.
 *
 * Usage:  const obj = await new tools.Counter(10);
 *   OR:   const obj = await tools.Counter(10);
 *
 * Note: `new` on an async function returns a Promise in JS — which is what
 * we want. Calling without `new` also works since we return a Promise either way.
 */
export function createClassProxy(moduleSpec, className) {
  async function PythonClass(...args) {
    const serializedArgs = args.map(serialize);
    const { ref_id, methods } = await rpc("construct", {
      module: moduleSpec,
      class: className,
      args: serializedArgs,
    });
    return createObjectProxy(ref_id, methods);
  }
  PythonClass.__pyjs_class = true;
  PythonClass.__pyjs_module = moduleSpec;
  PythonClass.__pyjs_name = className;
  return PythonClass;
}


/**
 * createObjectProxy — wraps a live Python object instance.
 * Exposes its methods as async JS functions.
 */
export function createObjectProxy(refId, methods) {
  const proxy = {
    __pyjs_ref_id: refId,
    __pyjs_methods: methods,
    release() {
      return rpc("release", { ref_id: refId });
    },
  };

  // Add known methods
  for (const [methodName] of Object.entries(methods || {})) {
    proxy[methodName] = async (...args) => {
      const serializedArgs = args.map(serialize);
      const response = await rpc("method_call", {
        ref_id: refId,
        method: methodName,
        args: serializedArgs,
      });
      return deserialize(response.result);
    };
  }

  // Use a Proxy so unknown attribute access also works
  return new Proxy(proxy, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Block .then so JS doesn't treat this as a thenable/Promise
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
      // Unknown method — create it dynamically
      if (typeof prop === "string" && !prop.startsWith("_")) {
        return async (...args) => {
          const serializedArgs = args.map(serialize);
          const response = await rpc("method_call", {
            ref_id: refId,
            method: prop,
            args: serializedArgs,
          });
          return deserialize(response.result);
        };
      }
      return undefined;
    },
  });
}


export { serialize, deserialize };
