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
  getAddictedSubstanceIds,
  clearActorWithdrawalEntry,
  clearActorToleranceEntry,
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

const SCOPE = "substances-and-paraphernalia";

test("getAddictedSubstanceIds lists each addicted substance once", () => {
  const fx = (role, sid) => ({ name: "x", flags: { [SCOPE]: { aeRole: role, sourceSubstanceId: sid } } });
  const actor = {
    effects: [fx("addiction", "a"), fx("addiction", "a"), fx("addiction", "b"), fx("withdrawal", "c"), fx("addiction", undefined)],
  };
  assert.deepEqual(getAddictedSubstanceIds(actor), ["a", "b"]);
});

function actorWithRecords(records) {
  const calls = [];
  return { calls, actor: { ...mockDoc({ [SCOPE]: records }), update: async (u) => calls.push(u) } };
}

function withForcedDeletion(fn) {
  return async () => {
    class ForcedDeletion {}
    const previous = globalThis.foundry;
    globalThis.foundry = { data: { operators: { ForcedDeletion } } };
    try {
      await fn(ForcedDeletion);
    } finally {
      if (previous === undefined) delete globalThis.foundry;
      else globalThis.foundry = previous;
    }
  };
}

test("clearActorWithdrawalEntry removes the key with ForcedDeletion", withForcedDeletion(async (ForcedDeletion) => {
  const { actor, calls } = actorWithRecords({ withdrawal: { s1: {}, s2: {} } });
  await clearActorWithdrawalEntry(actor, "s1");
  assert.equal(calls.length, 1);
  const [[key, value]] = Object.entries(calls[0]);
  assert.equal(key, `flags.${SCOPE}.withdrawal.s1`);
  assert.ok(value instanceof ForcedDeletion);
}));

test("clearActorWithdrawalEntry does nothing when the key is absent", withForcedDeletion(async () => {
  const { actor, calls } = actorWithRecords({ withdrawal: { s2: {} } });
  await clearActorWithdrawalEntry(actor, "s1");
  assert.equal(calls.length, 0);
}));

test("clearActorToleranceEntry removes the key with ForcedDeletion", withForcedDeletion(async (ForcedDeletion) => {
  const { actor, calls } = actorWithRecords({ tolerance: { s1: { count: 2 } } });
  await clearActorToleranceEntry(actor, "s1");
  const [[key, value]] = Object.entries(calls[0]);
  assert.equal(key, `flags.${SCOPE}.tolerance.s1`);
  assert.ok(value instanceof ForcedDeletion);
}));

test("clearActorToleranceEntry does nothing when the key is absent", withForcedDeletion(async () => {
  const { actor, calls } = actorWithRecords({ tolerance: { s2: { count: 1 } } });
  await clearActorToleranceEntry(actor, "s1");
  assert.equal(calls.length, 0);
}));

// v0.9.2 D2: a blank DC on the Details tab is stored as null (or ""); it means
// "no roll", never 0.
const withWithdrawal = (withdrawal) =>
  mockDoc({ "substances-and-paraphernalia": { withdrawal } });

test("getWithdrawalDc reads a blank DC as no DC, not 0", () => {
  assert.equal(getWithdrawalDc(withWithdrawal({ dc: null })), null);
  assert.equal(getWithdrawalDc(withWithdrawal({ dc: "" })), null);
  assert.equal(getWithdrawalDc(withWithdrawal({ dc: "15" })), 15);
});

test("getAbstain returns null for a blank Abstain DC (no Wisdom check)", () => {
  assert.equal(getAbstain(withWithdrawal({ abstain: { ability: "wis", dc: null } })), null);
  assert.equal(getAbstain(withWithdrawal({ abstain: { ability: "wis", dc: "" } })), null);
  assert.equal(getAbstain(withWithdrawal({ abstain: { ability: "wis" } })), null);
  assert.deepEqual(getAbstain(withWithdrawal({ abstain: { dc: "12" } })), { ability: "wis", dc: 12 });
});

test("getToleranceDecay uses the default for a blank fade but keeps an explicit 0", () => {
  const withDecay = (decay) => mockDoc({ "substances-and-paraphernalia": { tolerance: { decay } } });
  assert.equal(getToleranceDecay(withDecay(null)), 1);
  assert.equal(getToleranceDecay(withDecay("")), 1);
  assert.equal(getToleranceDecay(withDecay(0)), 0);
  assert.equal(getToleranceDecay(withDecay(2)), 2);
});

test("getAddictedSubstanceIds counts a switched-off Addiction effect (v0.9.2 D7)", () => {
  const off = { name: "Foo Addiction", disabled: true, flags: { [SCOPE]: { aeRole: "addiction", sourceSubstanceId: "foo" } } };
  assert.deepEqual(getAddictedSubstanceIds({ appliedEffects: [], effects: [off] }), ["foo"]);
});
