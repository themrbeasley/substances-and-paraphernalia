// test/unit/tolerance.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPoints, applyAttenuation, decayCount, attenuateChangeRows } from "../../scripts/data/tolerance.js";

test("currentPoints returns count * rate", () => {
  assert.equal(currentPoints(0, 3), 0);
  assert.equal(currentPoints(1, 3), 3);
  assert.equal(currentPoints(5, 3), 15);
  assert.equal(currentPoints(8, 1), 8);
});

test("currentPoints coerces non-finite inputs to 0", () => {
  assert.equal(currentPoints(NaN, 3), 0);
  assert.equal(currentPoints(5, NaN), 0);
  assert.equal(currentPoints("foo", 3), 0);
});

test("applyAttenuation halves at each count step on the default halving curve", () => {
  const curve = [1.0, 0.5, 0.25, 0.125, 0];
  assert.equal(applyAttenuation(10, 0, curve), 10);
  assert.equal(applyAttenuation(10, 1, curve), 5);
  assert.equal(applyAttenuation(10, 2, curve), 2.5);
  assert.equal(applyAttenuation(10, 3, curve), 1.25);
  assert.equal(applyAttenuation(10, 4, curve), 0);
});

test("applyAttenuation clamps counts past the curve to the last entry", () => {
  const curve = [1.0, 0.5, 0.25, 0.125, 0];
  assert.equal(applyAttenuation(10, 5, curve), 0);
  assert.equal(applyAttenuation(10, 8, curve), 0);
  assert.equal(applyAttenuation(10, 99, curve), 0);
});

test("applyAttenuation honours custom curve override", () => {
  const linear = [1.0, 0.75, 0.5, 0.25, 0];
  assert.equal(applyAttenuation(8, 0, linear), 8);
  assert.equal(applyAttenuation(8, 1, linear), 6);
  assert.equal(applyAttenuation(8, 2, linear), 4);
  assert.equal(applyAttenuation(8, 3, linear), 2);
  assert.equal(applyAttenuation(8, 4, linear), 0);
});

test("applyAttenuation returns input when curve is empty/missing", () => {
  assert.equal(applyAttenuation(10, 3, []), 10);
  assert.equal(applyAttenuation(10, 3, null), 10);
  assert.equal(applyAttenuation(10, 3, undefined), 10);
});

test("applyAttenuation passes non-numeric values through unchanged", () => {
  const curve = [1.0, 0.5];
  assert.equal(applyAttenuation("hello", 1, curve), "hello");
  assert.equal(applyAttenuation(null, 1, curve), null);
});

test("decayCount subtracts decay from count and clamps at 0", () => {
  assert.equal(decayCount(5, 1), 4);
  assert.equal(decayCount(5, 3), 2);
  assert.equal(decayCount(1, 1), 0);
  assert.equal(decayCount(0, 1), 0);
  assert.equal(decayCount(2, 5), 0);
});

test("decayCount coerces non-finite decay to 0", () => {
  assert.equal(decayCount(5, NaN), 5);
  assert.equal(decayCount(5, "foo"), 5);
});

const CURVE = [1, 0.5];

test("attenuateChangeRows scales numeric string values and writes them back as strings", () => {
  const rows = [{ key: "system.bonuses.mwak.attack", type: "add", value: "4" }];
  assert.deepEqual(attenuateChangeRows(rows, 1, CURVE), [
    { key: "system.bonuses.mwak.attack", type: "add", value: "2" },
  ]);
});

test("attenuateChangeRows scales native number values (V14-migrated world items)", () => {
  const rows = [{ key: "system.attributes.movement.walk", type: "add", value: 10 }];
  assert.equal(attenuateChangeRows(rows, 1, CURVE)[0].value, "5");
});

test("attenuateChangeRows passes non-numeric values through untouched (Token Magic preset names)", () => {
  const rows = [{ key: "macro.tokenMagic", type: "custom", value: "fishut-tmfx-fantasy-stimulant" }];
  assert.deepEqual(attenuateChangeRows(rows, 1, CURVE), rows);
});

test("attenuateChangeRows leaves a missing value alone", () => {
  const rows = [{ key: "k", type: "add" }];
  assert.equal(attenuateChangeRows(rows, 1, CURVE)[0].value, undefined);
});

test("attenuateChangeRows does not mutate the input rows", () => {
  const rows = [{ key: "k", type: "add", value: "4" }];
  attenuateChangeRows(rows, 1, CURVE);
  assert.equal(rows[0].value, "4");
});

test("attenuateChangeRows returns [] for a missing row list", () => {
  assert.deepEqual(attenuateChangeRows(undefined, 1, CURVE), []);
});

test("attenuateChangeRows leaves non-numeric values untouched at any tolerance (V14 sheets save native types)", () => {
  for (const count of [0, 1]) {
    for (const value of [true, false, null, [], "", "  "]) {
      const rows = [{ key: "system.attributes.movement.hover", type: "override", value }];
      assert.deepEqual(attenuateChangeRows(rows, count, CURVE)[0].value, value, `count ${count}, value ${JSON.stringify(value)}`);
    }
  }
});
