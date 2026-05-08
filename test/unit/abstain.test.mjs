import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultAbstainDc, applyAbstainOutcome } from "../../scripts/data/abstain.js";

describe("defaultAbstainDc", () => {
  it("returns 8 + withdrawalMod", () => {
    assert.equal(defaultAbstainDc(0), 8);
    assert.equal(defaultAbstainDc(2), 10);
    assert.equal(defaultAbstainDc(5), 13);
  });

  it("floors a fractional withdrawalMod", () => {
    assert.equal(defaultAbstainDc(2.7), 10);
  });

  it("returns 8 for non-numeric / NaN inputs", () => {
    assert.equal(defaultAbstainDc(NaN), 8);
    assert.equal(defaultAbstainDc("oops"), 8);
    assert.equal(defaultAbstainDc(undefined), 8);
  });

  it("accepts negative withdrawalMod (DC < 8 if author chose to)", () => {
    assert.equal(defaultAbstainDc(-2), 6);
  });
});

describe("applyAbstainOutcome", () => {
  it("pass: subtracts 2 rests", () => {
    assert.deepEqual(applyAbstainOutcome(true, 5), { newRests: 3, removed: false });
  });

  it("fail: subtracts 1 rest, no penalty", () => {
    assert.deepEqual(applyAbstainOutcome(false, 5), { newRests: 4, removed: false });
  });

  it("pass: clamps at 0 and flags removed", () => {
    assert.deepEqual(applyAbstainOutcome(true, 1), { newRests: 0, removed: true });
    assert.deepEqual(applyAbstainOutcome(true, 2), { newRests: 0, removed: true });
  });

  it("fail: clamps at 0 and flags removed when last rest", () => {
    assert.deepEqual(applyAbstainOutcome(false, 1), { newRests: 0, removed: true });
  });

  it("treats already-zero current as 0 (no negative)", () => {
    assert.deepEqual(applyAbstainOutcome(true, 0), { newRests: 0, removed: true });
    assert.deepEqual(applyAbstainOutcome(false, 0), { newRests: 0, removed: true });
  });

  it("coerces non-numeric currentRests to 0", () => {
    assert.deepEqual(applyAbstainOutcome(true, "x"), { newRests: 0, removed: true });
    assert.deepEqual(applyAbstainOutcome(false, undefined), { newRests: 0, removed: true });
  });
});
