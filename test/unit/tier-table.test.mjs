// test/unit/tier-table.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LADDER,
  RATES,
  THRESHOLDS,
  MAX_COUNTS,
  DEFAULT_ATTENUATION_CURVE,
  snapDcToTier,
  tierProfile,
} from "../../scripts/data/tier-table.js";

test("LADDER is [5,10,15,20,25,30]", () => {
  assert.deepEqual(LADDER, [5, 10, 15, 20, 25, 30]);
});

test("RATES is Fibonacci [1,2,3,5,8,13]", () => {
  assert.deepEqual(RATES, [1, 2, 3, 5, 8, 13]);
});

test("THRESHOLDS is [8,12,15,20,24,26]", () => {
  assert.deepEqual(THRESHOLDS, [8, 12, 15, 20, 24, 26]);
});

test("MAX_COUNTS is ceil(threshold/rate) per tier", () => {
  // [8/1=8, 12/2=6, 15/3=5, 20/5=4, 24/8=3, 26/13=2]
  assert.deepEqual(MAX_COUNTS, [8, 6, 5, 4, 3, 2]);
});

test("DEFAULT_ATTENUATION_CURVE is halving array", () => {
  assert.deepEqual(DEFAULT_ATTENUATION_CURVE, [1.0, 0.5, 0.25, 0.125, 0]);
});

test("snapDcToTier clamps DC <= 5 to tier 1", () => {
  assert.equal(snapDcToTier(-5), 1);
  assert.equal(snapDcToTier(1), 1);
  assert.equal(snapDcToTier(5), 1);
});

test("snapDcToTier clamps DC >= 30 to tier 6", () => {
  assert.equal(snapDcToTier(30), 6);
  assert.equal(snapDcToTier(35), 6);
  assert.equal(snapDcToTier(99), 6);
});

test("snapDcToTier maps each ladder DC to its own tier", () => {
  assert.equal(snapDcToTier(5), 1);
  assert.equal(snapDcToTier(10), 2);
  assert.equal(snapDcToTier(15), 3);
  assert.equal(snapDcToTier(20), 4);
  assert.equal(snapDcToTier(25), 5);
  assert.equal(snapDcToTier(30), 6);
});

test("snapDcToTier snaps to nearest tier mid-ladder", () => {
  assert.equal(snapDcToTier(7), 1);   // closer to 5
  assert.equal(snapDcToTier(8), 2);   // |8-5|=3, |8-10|=2
  assert.equal(snapDcToTier(12), 2);  // closer to 10
  assert.equal(snapDcToTier(13), 3);  // |13-10|=3, |13-15|=2
  assert.equal(snapDcToTier(17), 3);  // closer to 15
  assert.equal(snapDcToTier(22), 4);  // closer to 20
  assert.equal(snapDcToTier(28), 6);  // closer to 30
});

test("tierProfile returns full profile for each tier", () => {
  assert.deepEqual(tierProfile(1), { tier: 1, dc: 5, rate: 1, threshold: 8, maxCount: 8 });
  assert.deepEqual(tierProfile(3), { tier: 3, dc: 15, rate: 3, threshold: 15, maxCount: 5 });
  assert.deepEqual(tierProfile(6), { tier: 6, dc: 30, rate: 13, threshold: 26, maxCount: 2 });
});

test("tierProfile clamps out-of-range tiers", () => {
  assert.equal(tierProfile(0).tier, 1);
  assert.equal(tierProfile(7).tier, 6);
});
