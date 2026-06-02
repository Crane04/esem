"""
Esem Bridge — Python Worker
Runs as a persistent subprocess. Communicates with Node.js over stdin/stdout
using newline-delimited JSON-RPC.
"""

import sys
import json
import importlib
import importlib.util
import traceback
import inspect
import os


# --- Object registry for proxies ---
_object_registry = {}
_object_counter = 0

def _register_object(obj):
    global _object_counter
    _object_counter += 1
    ref_id = f"py_obj_{_object_counter}"
    _object_registry[ref_id] = obj
    return ref_id

def _get_object(ref_id):
    return _object_registry.get(ref_id)

def _release_object(ref_id):
    _object_registry.pop(ref_id, None)


# --- Serialization ---
def _serialize(value):
    """Convert a Python value to a JSON-safe structure."""
    if value is None:
        return {"type": "null", "value": None}
    elif isinstance(value, bool):
        return {"type": "bool", "value": value}
    elif isinstance(value, int):
        return {"type": "int", "value": value}
    elif isinstance(value, float):
        return {"type": "float", "value": value}
    elif isinstance(value, str):
        return {"type": "str", "value": value}
    elif isinstance(value, list):
        return {"type": "list", "value": [_serialize(item) for item in value]}
    elif isinstance(value, dict):
        return {"type": "dict", "value": {k: _serialize(v) for k, v in value.items()}}
    elif isinstance(value, tuple):
        return {"type": "list", "value": [_serialize(item) for item in value]}
    elif callable(value) or (inspect.isclass(value)):
        ref_id = _register_object(value)
        return {"type": "proxy", "ref_id": ref_id}
    else:
        # Try to register as a proxy object
        ref_id = _register_object(value)
        return {"type": "proxy", "ref_id": ref_id}


def _deserialize(data):
    """Convert a JSON-safe structure back to a Python value."""
    if not isinstance(data, dict) or "type" not in data:
        return data
    t = data["type"]
    v = data.get("value")
    if t == "null":
        return None
    elif t in ("bool", "int", "float", "str"):
        return v
    elif t == "list":
        return [_deserialize(item) for item in v]
    elif t == "dict":
        return {k: _deserialize(val) for k, val in v.items()}
    elif t == "proxy":
        return _get_object(data["ref_id"])
    else:
        return v


# --- Module loader ---
_loaded_modules = {}

def _load_module(module_spec):
    """Load a Python module by path or package name."""
    if module_spec in _loaded_modules:
        return _loaded_modules[module_spec]

    # Try as a file path first
    if module_spec.startswith("./") or module_spec.startswith("/") or module_spec.endswith(".py"):
        abs_path = os.path.abspath(module_spec)
        spec = importlib.util.spec_from_file_location("_esem_module", abs_path)
        if spec is None:
            raise ImportError(f"Cannot load module from path: {module_spec}")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    else:
        # Try as installed package
        mod = importlib.import_module(module_spec)

    _loaded_modules[module_spec] = mod
    return mod


def _get_exports(module_spec):
    """Return all public callables and values from a module."""
    mod = _load_module(module_spec)
    exports = {}

    for name in dir(mod):
        if name.startswith("_"):
            continue
        obj = getattr(mod, name)
        if callable(obj):
            # Get signature for metadata
            try:
                sig = inspect.signature(obj)
                params = list(sig.parameters.keys())
            except (ValueError, TypeError):
                params = []
            exports[name] = {
                "kind": "class" if inspect.isclass(obj) else "function",
                "params": params,
            }
        else:
            exports[name] = {"kind": "value"}

    return exports


# --- Request handlers ---
def handle_load(req):
    """Load a module and return its exports."""
    module_spec = req["module"]
    exports = _get_exports(module_spec)
    return {"exports": exports}


def handle_call(req):
    """Call a function in a loaded module."""
    module_spec = req["module"]
    func_name = req["function"]
    args = [_deserialize(a) for a in req.get("args", [])]
    kwargs = {k: _deserialize(v) for k, v in req.get("kwargs", {}).items()}

    mod = _load_module(module_spec)
    func = getattr(mod, func_name)
    result = func(*args, **kwargs)

    return {"result": _serialize(result)}


def handle_construct(req):
    """Instantiate a class from a loaded module."""
    module_spec = req["module"]
    class_name = req["class"]
    args = [_deserialize(a) for a in req.get("args", [])]
    kwargs = {k: _deserialize(v) for k, v in req.get("kwargs", {}).items()}

    mod = _load_module(module_spec)
    cls = getattr(mod, class_name)
    instance = cls(*args, **kwargs)
    ref_id = _register_object(instance)

    # Get instance methods
    methods = {}
    for name in dir(instance):
        if name.startswith("_"):
            continue
        attr = getattr(instance, name)
        if callable(attr):
            try:
                sig = inspect.signature(attr)
                params = list(sig.parameters.keys())
            except (ValueError, TypeError):
                params = []
            methods[name] = {"kind": "method", "params": params}

    return {"ref_id": ref_id, "methods": methods}


def handle_method_call(req):
    """Call a method on a proxied object."""
    ref_id = req["ref_id"]
    method_name = req["method"]
    args = [_deserialize(a) for a in req.get("args", [])]
    kwargs = {k: _deserialize(v) for k, v in req.get("kwargs", {}).items()}

    obj = _get_object(ref_id)
    if obj is None:
        raise ValueError(f"Object {ref_id} not found — it may have been released")

    method = getattr(obj, method_name)
    result = method(*args, **kwargs)

    return {"result": _serialize(result)}


def handle_release(req):
    """Release a proxied object from the registry."""
    _release_object(req["ref_id"])
    return {}


def handle_get_attr(req):
    """Get an attribute value from a proxied object."""
    ref_id = req["ref_id"]
    attr_name = req["attr"]
    obj = _get_object(ref_id)
    if obj is None:
        raise ValueError(f"Object {ref_id} not found")
    value = getattr(obj, attr_name)
    return {"value": _serialize(value)}


HANDLERS = {
    "load": handle_load,
    "call": handle_call,
    "construct": handle_construct,
    "method_call": handle_method_call,
    "release": handle_release,
    "get_attr": handle_get_attr,
}


# --- Main loop ---
def main():
    # Signal ready
    _send({"type": "ready"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            _send({"type": "error", "id": None, "error": f"Invalid JSON: {e}"})
            continue

        req_id = req.get("id")
        action = req.get("action")

        try:
            handler = HANDLERS.get(action)
            if handler is None:
                raise ValueError(f"Unknown action: {action}")
            result = handler(req)
            _send({"type": "result", "id": req_id, **result})
        except Exception as e:
            tb = traceback.format_exc()
            _send({
                "type": "error",
                "id": req_id,
                "error": str(e),
                "traceback": tb,
                "error_type": type(e).__name__,
            })


def _send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
