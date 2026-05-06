import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRestsRemaining } from "../../scripts/data/withdrawal.js";

describe("computeRestsRemaining(wMod, abilityMod)", () => {
  it("clamps to a minimum of 1 long rest", () => {
    assert.equal(computeRestsRemaining(0, 0), 1);
    assert.equal(computeRestsRemaining(1, 10), 1);
  });

  it("returns wMod when ability mod is 0 and wMod >= 1", () => {
    assert.equal(computeRestsRemaining(4, 0), 4);
    assert.equal(computeRestsRemaining(6, 0), 6);
    assert.equal(computeRestsRemaining(3, 0), 3);
  });

  it("subtracts ability mod from wMod down to the ceil(wMod/2) floor", () => {
    // WMod 4, Con +1 → max(3, 2) = 3
    assert.equal(computeRestsRemaining(4, 1), 3);
    // WMod 4, Con +2 → max(2, 2) = 2
    assert.equal(computeRestsRemaining(4, 2), 2);
    // WMod 4, Con +5 → max(-1, 2) = 2 (floor wins)
    assert.equal(computeRestsRemaining(4, 5), 2);
  });

  it("respects the ceil(wMod/2) floor for odd wMod", () => {
    // WMod 3, Con +5 → max(-2, 2) = 2
    assert.equal(computeRestsRemaining(3, 5), 2);
    // WMod 5, Con +10 → max(-5, 3) = 3
    assert.equal(computeRestsRemaining(5, 10), 3);
  });

  it("respects the floor for heavy WMod even with high Con", () => {
    // WMod 6, Con +5 → max(1, 3) = 3
    assert.equal(computeRestsRemaining(6, 5), 3);
    // WMod 6, Con +10 → max(-4, 3) = 3 (floor wins, never below ceil(6/2)=3)
    assert.equal(computeRestsRemaining(6, 10), 3);
  });

  it("treats negative ability mods as additive (sicker actors suffer longer)", () => {
    // WMod 4, Con -2 → max(6, 2) = 6
    assert.equal(computeRestsRemaining(4, -2), 6);
    // WMod 3, Con -1 → max(4, 2) = 4
    assert.equal(computeRestsRemaining(3, -1), 4);
  });

  it("coerces non-numeric inputs to 0", () => {
    assert.equal(computeRestsRemaining("4", "1"), 3);
    assert.equal(computeRestsRemaining(undefined, undefined), 1);
    assert.equal(computeRestsRemaining(null, null), 1);
    assert.equal(computeRestsRemaining("not a number", "also not"), 1);
  });
});
