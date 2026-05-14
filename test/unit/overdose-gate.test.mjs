// test/unit/overdose-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRollOverdose, rollOverdoseChance } from "../../scripts/data/overdose-gate.js";

test("shouldRollOverdose returns false when points < threshold", () => {
  assert.equal(shouldRollOverdose(7, 15, 0), false);
  assert.equal(shouldRollOverdose(14, 15, 0), false);
});

test("shouldRollOverdose returns true when points >= threshold", () => {
  assert.equal(shouldRollOverdose(15, 15, 0), true);
  assert.equal(shouldRollOverdose(20, 15, 0), true);
});

test("shouldRollOverdose adds thresholdModifier to threshold", () => {
  // raises threshold by +5; need 20 to trigger
  assert.equal(shouldRollOverdose(15, 15, 5), false);
  assert.equal(shouldRollOverdose(19, 15, 5), false);
  assert.equal(shouldRollOverdose(20, 15, 5), true);
});

test("shouldRollOverdose tolerates a negative threshold modifier", () => {
  // lowers threshold to 10
  assert.equal(shouldRollOverdose(10, 15, -5), true);
  assert.equal(shouldRollOverdose(9, 15, -5), false);
});

test("rollOverdoseChance returns true when roll <= effective chance", () => {
  // chancePercent 5, no modifier; roll 5 → hit
  assert.equal(rollOverdoseChance(() => 5, 5, 0), true);
  assert.equal(rollOverdoseChance(() => 1, 5, 0), true);
  assert.equal(rollOverdoseChance(() => 6, 5, 0), false);
});

test("rollOverdoseChance applies chanceModifier (clamped 0..100)", () => {
  // chance 95 + modifier 10 → effective 100
  assert.equal(rollOverdoseChance(() => 100, 95, 10), true);
  // chance 5 - modifier 10 → effective 0; no roll <= 0
  assert.equal(rollOverdoseChance(() => 1, 5, -10), false);
});

test("rollOverdoseChance returns false when chance is 0", () => {
  assert.equal(rollOverdoseChance(() => 1, 0, 0), false);
});
