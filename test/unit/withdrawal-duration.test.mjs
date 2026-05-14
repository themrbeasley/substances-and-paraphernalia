// test/unit/withdrawal-duration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { durationToSeconds, WITHDRAWAL_DURATION_UNITS } from "../../scripts/data/withdrawal-duration.js";

test("WITHDRAWAL_DURATION_UNITS is the documented enum", () => {
  assert.deepEqual(WITHDRAWAL_DURATION_UNITS, ["minutes", "hours", "days", "weeks", "months"]);
});

test("durationToSeconds converts minutes", () => {
  assert.equal(durationToSeconds(1, "minutes"), 60);
  assert.equal(durationToSeconds(30, "minutes"), 1800);
});

test("durationToSeconds converts hours", () => {
  assert.equal(durationToSeconds(1, "hours"), 3600);
  assert.equal(durationToSeconds(8, "hours"), 28800);
});

test("durationToSeconds converts days", () => {
  assert.equal(durationToSeconds(1, "days"), 86400);
  assert.equal(durationToSeconds(3, "days"), 259200);
});

test("durationToSeconds converts weeks", () => {
  assert.equal(durationToSeconds(1, "weeks"), 604800);
  assert.equal(durationToSeconds(2, "weeks"), 1209600);
});

test("durationToSeconds converts months (30-day month)", () => {
  assert.equal(durationToSeconds(1, "months"), 2592000);
  assert.equal(durationToSeconds(6, "months"), 15552000);
});

test("durationToSeconds returns 0 for invalid inputs", () => {
  assert.equal(durationToSeconds(0, "days"), 0);
  assert.equal(durationToSeconds(NaN, "days"), 0);
  assert.equal(durationToSeconds(3, "fortnights"), 0);
  assert.equal(durationToSeconds(3, ""), 0);
  assert.equal(durationToSeconds(3, null), 0);
});
