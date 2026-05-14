// test/unit/flag-schema-lifecycle.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getWithdrawalDc,
  getAbstain,
  getWithdrawalDuration,
  getToleranceDecay,
  getAttenuationCurve,
  getActorTolerance,
  getActorToleranceEntry,
} from "../../scripts/data/flag-schema.js";

// Simulate a Foundry document's `getFlag(scope, path)` interface using a
// nested object literal so unit tests don't pull in Foundry globals.
function mockDoc(flags) {
  return {
    getFlag(scope, path) {
      const obj = flags[scope];
      if (!obj) return undefined;
      return path
        .split(".")
        .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
    },
  };
}

test("getWithdrawalDc reads withdrawal.dc", () => {
  const item = mockDoc({
    "substances-and-paraphernalia": { withdrawal: { dc: 15 } },
  });
  assert.equal(getWithdrawalDc(item), 15);
});

test("getWithdrawalDc returns null when missing", () => {
  const item = mockDoc({ "substances-and-paraphernalia": { withdrawal: {} } });
  assert.equal(getWithdrawalDc(item), null);
});

test("getAbstain returns {ability, dc} with default Wis ability", () => {
  const item = mockDoc({
    "substances-and-paraphernalia": {
      withdrawal: { abstain: { ability: "wis", dc: 12 } },
    },
  });
  assert.deepEqual(getAbstain(item), { ability: "wis", dc: 12 });
});

test("getAbstain defaults ability to wis when absent", () => {
  const item = mockDoc({
    "substances-and-paraphernalia": { withdrawal: { abstain: { dc: 12 } } },
  });
  assert.deepEqual(getAbstain(item), { ability: "wis", dc: 12 });
});

test("getAbstain returns null when block missing", () => {
  const item = mockDoc({ "substances-and-paraphernalia": { withdrawal: {} } });
  assert.equal(getAbstain(item), null);
});

test("getWithdrawalDuration returns {value, unit}", () => {
  const item = mockDoc({
    "substances-and-paraphernalia": {
      withdrawal: { duration: { value: 3, unit: "days" } },
    },
  });
  assert.deepEqual(getWithdrawalDuration(item), { value: 3, unit: "days" });
});

test("getToleranceDecay defaults to 1 when missing", () => {
  const item = mockDoc({ "substances-and-paraphernalia": { tolerance: {} } });
  assert.equal(getToleranceDecay(item), 1);
});

test("getToleranceDecay reads authored value", () => {
  const item = mockDoc({
    "substances-and-paraphernalia": { tolerance: { decay: 2 } },
  });
  assert.equal(getToleranceDecay(item), 2);
});

test("getAttenuationCurve returns authored override", () => {
  const item = mockDoc({
    "substances-and-paraphernalia": {
      tolerance: { attenuationCurve: [1, 0.8, 0.6, 0.4, 0.2, 0] },
    },
  });
  assert.deepEqual(getAttenuationCurve(item), [1, 0.8, 0.6, 0.4, 0.2, 0]);
});

test("getAttenuationCurve returns null when missing (caller falls back to default)", () => {
  const item = mockDoc({ "substances-and-paraphernalia": { tolerance: {} } });
  assert.equal(getAttenuationCurve(item), null);
});

test("getActorTolerance returns full map", () => {
  const actor = mockDoc({
    "substances-and-paraphernalia": {
      tolerance: {
        item1: { count: 2, lastIncrementedAt: "2026-01-01T00:00:00Z" },
      },
    },
  });
  assert.deepEqual(getActorTolerance(actor), {
    item1: { count: 2, lastIncrementedAt: "2026-01-01T00:00:00Z" },
  });
});

test("getActorTolerance returns {} when missing", () => {
  const actor = mockDoc({ "substances-and-paraphernalia": {} });
  assert.deepEqual(getActorTolerance(actor), {});
});

test("getActorToleranceEntry returns the per-substance entry", () => {
  const actor = mockDoc({
    "substances-and-paraphernalia": {
      tolerance: { item1: { count: 3 } },
    },
  });
  assert.deepEqual(getActorToleranceEntry(actor, "item1"), { count: 3 });
});

test("getActorToleranceEntry returns null for unknown substance", () => {
  const actor = mockDoc({ "substances-and-paraphernalia": { tolerance: {} } });
  assert.equal(getActorToleranceEntry(actor, "missing"), null);
});
