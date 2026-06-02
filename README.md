# esem

**Import Python in JavaScript. No APIs needed.**

```js
import { python } from "esem-bridge";

const { predict } = await python("./model.py");
const result = await predict({ age: 22, country: "NG" });
console.log(result); // { score: 87, risk: "low" }
```

No FastAPI. No Express endpoint. No subprocess boilerplate. No JSON over HTTP.

Just import and call.

---

## The problem

Building with Python and JavaScript together is annoying.

Python is better for AI, ML, data processing, and scientific computing. JavaScript is better for frontends, Node.js backends, and real-time apps. But connecting both usually means:

- wrapping Python in FastAPI
- running a Python server separately
- creating HTTP endpoints
- serializing/deserializing manually
- deploying and monitoring two services

That's too much infrastructure for what should be a function call.

## Install

```bash
npm install esem-bridge
```

Requires Node.js 18+ and Python 3.8+.

---

## Usage

### Option 1 — `python()` helper (recommended)

```js
import { python } from "esem-bridge";

const tools = await python("./tools.py");

// Call functions
const result = await tools.add(2, 3);        // 5
const msg = await tools.greet("Crane");      // "Hello, Crane!"

// Destructure
const { add, greet } = await python("./tools.py");
```

### Option 2 — `python:` import syntax

```js
import tools from "python:./tools.py";

const result = await tools.add(2, 3);
```

Requires running with the loader hook:

```bash
node --experimental-loader esem-bridge/loader yourfile.js
```

Or use the CLI after installing `esem-bridge`:

```bash
npx esem run yourfile.js
```

To run the CLI without installing first:

```bash
npx --package esem-bridge esem run yourfile.js
```

---

## Examples

### AI/ML in a Node.js app

```python
# model.py
def predict_score(user):
    # your ML logic here
    return { "score": 87, "risk": "low" }
```

```js
import { python } from "esem-bridge";

const { predict_score } = await python("./model.py");
const result = await predict_score({ age: 22, country: "NG" });
console.log(result); // { score: 87, risk: "low" }
```

### Next.js API route calling Python logic

```js
// app/api/price/route.js
import { python } from "esem-bridge";

export async function POST(req) {
  const body = await req.json();
  const { calculatePrice } = await python("./pricing.py");
  const price = await calculatePrice(body);
  return Response.json({ price });
}
```

### Using Python classes

```python
# calculator.py
class Calculator:
    def __init__(self, precision=2):
        self.precision = precision

    def add(self, a, b):
        return round(a + b, self.precision)
```

```js
const { Calculator } = await python("./calculator.py");

const calc = await Calculator(2);              // instantiate with precision=2
const result = await calc.add(1.234, 2.345);   // 3.58
```

### Using installed Python packages

```js
const { python } = await import("esem-bridge");
const np = await python("numpy");              // pip-installed packages work too
```

---

## Error handling

Python errors cross the bridge cleanly:

```python
# tools.py
def parse_data(raw):
    if not raw:
        raise ValueError("Input cannot be empty")
    return process(raw)
```

```js
import { python, PythonError } from "esem-bridge";

const { parse_data } = await python("./tools.py");

try {
  await parse_data(null);
} catch (err) {
  console.log(err.message);          // "Input cannot be empty"
  console.log(err.pythonTraceback);  // full Python traceback
  console.log(err.name);             // "PythonError(ValueError)"
}
```

---

## Type mappings

| Python       | JavaScript     |
|--------------|----------------|
| `None`       | `null`         |
| `bool`       | `boolean`      |
| `int`        | `number`       |
| `float`      | `number`       |
| `str`        | `string`       |
| `list`       | `Array`        |
| `dict`       | `object`       |
| class inst.  | proxy object   |

---

## CLI

```bash
npx esem run index.js        # run with python: import support
npx esem --version
npx esem --help
```

---

## Configuration

Set `ESEM_PYTHON` to use a specific Python binary (e.g. inside a venv):

```bash
ESEM_PYTHON=.venv/bin/python npx esem run index.js
```

## Worker lifecycle

You do not need to call `shutdown()` in short scripts. esem automatically lets
Node.js exit after your Python calls finish.

In a long-running application, the Python worker remains available for later
calls. You can still release it early when you know it is no longer needed:

```js
import { shutdown } from "esem-bridge";

shutdown();
```

---

## How it works

esem spawns a Python worker process when you first call `python()`. The same worker is reused while your Node.js application is running, so there is no cold start on every call. When no Python calls are active, the worker does not prevent Node.js from exiting naturally.

Communication is JSON-RPC over stdin/stdout. When you call a proxied function, a message goes to the worker, Python executes it, and the result comes back serialized. The round-trip is microseconds on local processes.

```
JS runtime
  → python() call
  → bridge spawns Python worker (once)
  → JSON-RPC over stdin/stdout
  → Python loads module, runs function
  → result serialized back to JS
  → await resolves
```

Object instances (classes) live in Python. JS holds a reference ID. When you call methods on the proxy, they route to the real Python object.

---

## What's next

- Python importing JavaScript
- TypeScript type generation from Python type hints
- NumPy array optimization (zero-copy)
- Pandas DataFrame support
- Bun support
- VS Code extension

---

## License

MIT
