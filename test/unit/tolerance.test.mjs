import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeTolerance, zeroTolerance } from "../../scripts/data/tolerance.js";

describe("composeTolerance", () => {
  it("returns a 1-baseline / 0-bump zero effect for empty input", () => {
    const r = composeTolerance([]);
    assert.deepEqual(r, zeroTolerance());
    assert.equal(r.attenuateAltered.durationFactor, 1);
    assert.equal(r.attenuateAltered.modifierFactor, 1);
    assert.equal(r.attenuateAltered.dropAdvantage, false);
    assert.equal(r.addictionDcBump, 0);
    assert.equal(r.withdrawalAmplify.durationFactor, 1);
    assert.equal(r.withdrawalAmplify.modifierFactor, 1);
    assert.equal(r.withdrawalAmplify.addDisadvantage, false);
  });

  it("applies addictionDcBump as additive bonus × stacks", () => {
    const r = composeTolerance([{ stacks: 3, addictionDcBump: 1 }]);
    assert.equal(r.addictionDcBump, 3);
  });

  it("treats missing stacks as 1", () => {
    const r = composeTolerance([{ addictionDcBump: 2 }]);
    assert.equal(r.addictionDcBump, 2);
  });

  it("treats fractional stacks as floored, sub-1 as 1", () => {
    const r1 = composeTolerance([{ stacks: 2.7, addictionDcBump: 1 }]);
    assert.equal(r1.addictionDcBump, 2);
    const r2 = composeTolerance([{ stacks: 0.5, addictionDcBump: 1 }]);
    assert.equal(r2.addictionDcBump, 1);
  });

  it("attenuateAltered: 3 stacks of -0.1 durationFactor → 0.7×", () => {
    const r = composeTolerance([{ stacks: 3, attenuateAltered: { durationFactor: -0.1 } }]);
    assert.ok(Math.abs(r.attenuateAltered.durationFactor - 0.7) < 1e-9);
  });

  it("withdrawalAmplify: 2 stacks of +0.25 durationFactor → 1.5×", () => {
    const r = composeTolerance([{ stacks: 2, withdrawalAmplify: { durationFactor: 0.25 } }]);
    assert.ok(Math.abs(r.withdrawalAmplify.durationFactor - 1.5) < 1e-9);
  });

  it("clamps factors at 0 (no negative durations)", () => {
    const r = composeTolerance([{ stacks: 100, attenuateAltered: { durationFactor: -1 } }]);
    assert.equal(r.attenuateAltered.durationFactor, 0);
  });

  it("OR's dropAdvantage and addDisadvantage booleans across candidates", () => {
    const r = composeTolerance([
      { stacks: 1, attenuateAltered: { dropAdvantage: false } },
      { stacks: 2, attenuateAltered: { dropAdvantage: true } },
      { stacks: 1, withdrawalAmplify: { addDisadvantage: true } },
    ]);
    assert.equal(r.attenuateAltered.dropAdvantage, true);
    assert.equal(r.withdrawalAmplify.addDisadvantage, true);
  });

  it("sums values across multiple candidates (e.g. two AEs × 3 stacks each)", () => {
    const r = composeTolerance([
      { stacks: 3, addictionDcBump: 1 },
      { stacks: 3, addictionDcBump: 1 },
    ]);
    assert.equal(r.addictionDcBump, 6);
  });

  it("ignores null / non-object candidates", () => {
    const r = composeTolerance([null, undefined, "x", { stacks: 2, addictionDcBump: 1 }]);
    assert.equal(r.addictionDcBump, 2);
  });

  it("returns a fresh zero-baseline object each call (no shared mutation)", () => {
    const a = zeroTolerance();
    a.addictionDcBump = 99;
    const b = zeroTolerance();
    assert.equal(b.addictionDcBump, 0);
  });
});

describe("composeTolerance — soft caps", () => {
  const DEFAULTS = {
    maxStacks: 5,
    modifierFactorFloor: 0.25,
    addictionDcBumpCap: 5,
    withdrawalDurationFactorCap: 2.0,
  };

  it("clamps stacks at maxStacks=5 (10 stacks treated as 5)", () => {
    const big = composeTolerance([{ stacks: 10, addictionDcBump: 1 }], DEFAULTS);
    const five = composeTolerance([{ stacks: 5, addictionDcBump: 1 }], DEFAULTS);
    assert.equal(big.addictionDcBump, five.addictionDcBump);
  });

  it("floors attenuateAltered.modifierFactor at modifierFactorFloor=0.25", () => {
    const r = composeTolerance(
      [{ stacks: 5, attenuateAltered: { modifierFactor: -0.5 } }],
      DEFAULTS,
    );
    assert.ok(r.attenuateAltered.modifierFactor >= 0.25 - 1e-9, "must not drop below 0.25");
  });

  it("caps addictionDcBump at 5 even when raw total would be higher", () => {
    const r = composeTolerance([{ stacks: 5, addictionDcBump: 3 }], DEFAULTS);
    assert.equal(r.addictionDcBump, 5);
  });

  it("caps withdrawalAmplify.durationFactor at 2.0", () => {
    const r = composeTolerance(
      [{ stacks: 5, withdrawalAmplify: { durationFactor: 0.5 } }],
      DEFAULTS,
    );
    assert.ok(r.withdrawalAmplify.durationFactor <= 2.0 + 1e-9);
  });

  it("per-substance override loosens the cap when caps={maxStacks:10}", () => {
    const looser = { ...DEFAULTS, maxStacks: 10 };
    const r = composeTolerance([{ stacks: 10, addictionDcBump: 1 }], looser);
    // Without clamp: 10 × 1 = 10, but addictionDcBumpCap stays at 5
    assert.equal(r.addictionDcBump, 5);
  });

  it("when caps omitted (legacy callers), behavior matches pre-v0.7 — no clamp", () => {
    const r = composeTolerance([{ stacks: 10, addictionDcBump: 1 }]);
    assert.equal(r.addictionDcBump, 10);
  });
});
