import assert from "node:assert/strict";
import test from "node:test";

import { PythonError, python, shutdown } from "../index.js";

test("calls Python functions and class methods", async (t) => {
  t.after(shutdown);

  const { add, greet, Counter } = await python("./test/fixture.py");

  assert.equal(await add(2, 3), 5);
  assert.equal(await greet("Ada"), "Hello, Ada!");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await add(4, 5), 9);

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

test("reads Python module constants", async (t) => {
  t.after(shutdown);

  const fixture = await python("./test/fixture.py");

  assert.equal(await fixture.VERSION, "0.1.2");
  assert.equal(await fixture.ENABLED, true);
  assert.equal(await fixture.RETRY_COUNT, 3);
  assert.equal(await fixture.NOTHING, null);
  assert.deepEqual(await fixture.SETTINGS, {
    debug: true,
    ports: [3000, 3001],
  });
});
