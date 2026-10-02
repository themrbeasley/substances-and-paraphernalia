// test/unit/withdrawal-duration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  durationToSeconds,
  WITHDRAWAL_DURATION_UNITS,
  withdrawalSeconds,
  describeLength,
} from "../../scripts/data/withdrawal-duration.js";

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

test("withdrawalSeconds: a failed save gets the full length, a passed save half", () => {
  assert.equal(withdrawalSeconds({ value: 5, unit: "days" }), 432000);
  assert.equal(withdrawalSeconds({ value: 5, unit: "days" }, { halved: true }), 216000);
});

test("withdrawalSeconds: permanent stays permanent on a passed save", () => {
  assert.equal(withdrawalSeconds({ value: 0, unit: "days" }, { halved: true }), 0);
  assert.equal(withdrawalSeconds(null, { halved: true }), 0);
  assert.equal(withdrawalSeconds(null), 0);
});

test("withdrawalSeconds: a halved tiny length never rounds down to permanent", () => {
  assert.equal(withdrawalSeconds({ value: 1, unit: "minutes" }, { halved: true }), 30);
});

test("describeLength says days when it's whole days, else hours", () => {
  assert.deepEqual(describeLength(432000), { key: "days", n: 5 });
  assert.deepEqual(describeLength(86400), { key: "day", n: 1 });
  assert.deepEqual(describeLength(216000), { key: "hours", n: 60 });
  assert.deepEqual(describeLength(3600), { key: "hour", n: 1 });
  assert.deepEqual(describeLength(0), { key: "permanent", n: 0 });
});
