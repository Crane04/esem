import assert from "node:assert/strict";
import test from "node:test";

import { PythonError, python, shutdown } from "../index.js";

test("calls Python functions and class methods", async (t) => {
  t.after(shutdown);

  const { add, greet, Counter } = await python("./test/fixture.py");

  assert.equal(await add(2, 3), 5);
  assert.equal(await greet("Ada"), "Hello, Ada!");

  const counter = await Counter(4);
  assert.equal(await counter.increment(), 5);
  assert.equal(await counter.increment(3), 8);
  await counter.release();
});

test("preserves Python error details", async (t) => {
  t.after(shutdown);

  const { fail } = await python("./test/fixture.py");

  await assert.rejects(fail(), (error) => {
    assert.ok(error instanceof PythonError);
    assert.equal(error.name, "PythonError(ValueError)");
    assert.match(error.message, /example failure/);
    assert.match(error.pythonTraceback, /ValueError: example failure/);
    return true;
  });
});
