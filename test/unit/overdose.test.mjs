import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rollOverdose } from "../../scripts/data/overdose.js";

// Mulberry32 PRNG — deterministic, fast, well-distributed enough for hit-rate
// assertions over a 1k-trial budget.
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe("rollOverdose", () => {
  it("never hits when chancePercent is 0", () => {
    const rng = seededRandom(123);
    for (let i = 0; i < 100; i++) {
      const r = rollOverdose(0, rng);
      assert.equal(r.hit, false);
    }
  });

  it("always hits when chancePercent is 100", () => {
    const rng = seededRandom(456);
    for (let i = 0; i < 100; i++) {
      const r = rollOverdose(100, rng);
      assert.equal(r.hit, true);
    }
  });

  it("reports the rolled die in [1, 100]", () => {
    const rng = seededRandom(789);
    for (let i = 0; i < 200; i++) {
      const r = rollOverdose(50, rng);
      assert.ok(r.roll >= 1 && r.roll <= 100, `roll out of range: ${r.roll}`);
    }
  });

  it("hit-rate over 1000 trials matches chancePercent ±5", () => {
    const cases = [5, 10, 25, 50, 75];
    for (const pct of cases) {
      const rng = seededRandom(0x1234 + pct);
      let hits = 0;
      for (let i = 0; i < 1000; i++) {
        if (rollOverdose(pct, rng).hit) hits++;
      }
      const observed = hits / 10; // percent
      assert.ok(
        Math.abs(observed - pct) <= 5,
        `chance=${pct}% observed=${observed}% (Δ=${Math.abs(observed - pct)})`,
      );
    }
  });

  it("clamps negative chancePercent to 0", () => {
    const rng = seededRandom(1);
    const r = rollOverdose(-50, rng);
    assert.equal(r.hit, false);
    assert.equal(r.chancePercent, 0);
  });

  it("clamps over-100 chancePercent to 100", () => {
    const rng = seededRandom(1);
    const r = rollOverdose(500, rng);
    assert.equal(r.hit, true);
    assert.equal(r.chancePercent, 100);
  });

  it("treats non-numeric chancePercent as 0 (no hit)", () => {
    assert.equal(rollOverdose("oops", seededRandom(2)).hit, false);
    assert.equal(rollOverdose(undefined, seededRandom(2)).hit, false);
    assert.equal(rollOverdose(NaN, seededRandom(2)).hit, false);
  });
});
