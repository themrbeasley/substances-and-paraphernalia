import test from "node:test";
import assert from "node:assert/strict";
import {
  actorSatisfiesAdmin,
  gearHasUse,
  nextGearUses,
  pickGearToSpend,
} from "../../scripts/data/admin-match.js";
import { inspectParaphernaliaItem } from "../../scripts/data/references.js";

test("returns false when no paraphernalia owned", () => {
  assert.equal(actorSatisfiesAdmin([], "inhaled"), false);
});

test("returns true when one usable paraphernalia covers the admin", () => {
  const owned = [{ appliesTo: ["inhaled"], usable: true }];
  assert.equal(actorSatisfiesAdmin(owned, "inhaled"), true);
});

test("returns false when the admin matches but item is not usable", () => {
  const owned = [{ appliesTo: ["inhaled"], usable: false }];
  assert.equal(actorSatisfiesAdmin(owned, "inhaled"), false);
});

test("returns false when no item covers the admin", () => {
  const owned = [
    { appliesTo: ["ingested"], usable: true },
    { appliesTo: ["injury"], usable: true },
  ];
  assert.equal(actorSatisfiesAdmin(owned, "inhaled"), false);
});

test("treats missing/non-array appliesTo as no-coverage", () => {
  const owned = [{ usable: true }, { appliesTo: null, usable: true }];
  assert.equal(actorSatisfiesAdmin(owned, "inhaled"), false);
});

test("returns false for empty or non-string admin", () => {
  const owned = [{ appliesTo: ["inhaled"], usable: true }];
  assert.equal(actorSatisfiesAdmin(owned, ""), false);
  assert.equal(actorSatisfiesAdmin(owned, null), false);
  assert.equal(actorSatisfiesAdmin(owned, undefined), false);
  assert.equal(actorSatisfiesAdmin(owned, 42), false);
});

test("returns false for non-array ownedParaphernalia", () => {
  assert.equal(actorSatisfiesAdmin(null, "inhaled"), false);
  assert.equal(actorSatisfiesAdmin(undefined, "inhaled"), false);
  assert.equal(actorSatisfiesAdmin({}, "inhaled"), false);
});

test("returns true when at least one paraphernalia among many covers the admin", () => {
  const owned = [
    { appliesTo: ["ingested"], usable: true },
    { appliesTo: ["inhaled", "contact"], usable: true },
    { appliesTo: ["injury"], usable: false },
  ];
  assert.equal(actorSatisfiesAdmin(owned, "inhaled"), true);
});

const papers = { id: "papers0000000002", appliesTo: ["inhaled"], usable: true, consumable: true };
const papersB = { id: "papers0000000001", appliesTo: ["inhaled"], usable: true, consumable: true };
const inhaler = { id: "inhaler000000001", appliesTo: ["inhaled"], usable: true, consumable: false };

test("pickGearToSpend spends nothing when ready reusable gear covers the drug", () => {
  assert.equal(pickGearToSpend([papers, inhaler], "inhaled"), null);
});

test("pickGearToSpend spends the lowest-id ready consumable otherwise", () => {
  assert.equal(pickGearToSpend([papers, papersB], "inhaled"), "papers0000000001");
});

test("pickGearToSpend spends nothing when nothing ready applies", () => {
  assert.equal(pickGearToSpend([{ ...papers, usable: false }], "inhaled"), null);
  assert.equal(pickGearToSpend([papers], "ingested"), null);
  assert.equal(pickGearToSpend(null, "inhaled"), null);
});

test("pickGearToSpend ignores a reusable item that is not ready", () => {
  const brokenInhaler = { ...inhaler, usable: false };
  assert.equal(pickGearToSpend([papers, brokenInhaler], "inhaled"), "papers0000000002");
});

test("a consumable with uses is ready until they are spent (max may be a string)", () => {
  const gear = (uses) => ({ type: "consumable", system: { uses } });
  assert.equal(inspectParaphernaliaItem(gear({ max: "50", spent: 49 })).ready, true);
  assert.equal(inspectParaphernaliaItem(gear({ max: "50", spent: 50 })).ready, false);
  assert.equal(inspectParaphernaliaItem(gear({ max: "50", spent: 50 })).reason, "missing");
  assert.equal(inspectParaphernaliaItem(gear({ max: "", spent: 0 })).ready, true);
  assert.equal(
    inspectParaphernaliaItem({ type: "consumable", system: { quantity: 0 } }).ready,
    false,
  );
});

test("a used-up pack restocked with another is ready (dnd5e stacks the drop)", () => {
  const gear = { type: "consumable", system: { quantity: 2, uses: { max: "50", spent: 50 } } };
  assert.equal(inspectParaphernaliaItem(gear).ready, true);
  assert.equal(gearHasUse({ spent: 50, max: "50", quantity: 2 }), true);
  assert.equal(gearHasUse({ spent: 49, max: "50", quantity: 1 }), true);
  assert.equal(gearHasUse({ spent: 50, max: "50", quantity: 1 }), false);
});

test("nextGearUses spends one use the way dnd5e rolls over to the next pack", () => {
  // A fresh pack.
  assert.deepEqual(nextGearUses({ spent: 0, max: "50", quantity: 1 }), { spent: 1, quantity: 1 });
  // The last use of a pack with more packs opens the next one.
  assert.deepEqual(nextGearUses({ spent: 49, max: "50", quantity: 2 }), { spent: 0, quantity: 1 });
  // A used-up pack restocked: the empty pack goes, the new one loses a use.
  assert.deepEqual(nextGearUses({ spent: 50, max: "50", quantity: 2 }), { spent: 1, quantity: 1 });
  // The last use of the last pack stays at max and is no longer ready.
  const last = nextGearUses({ spent: 49, max: "50", quantity: 1 });
  assert.deepEqual(last, { spent: 50, quantity: 1 });
  assert.equal(gearHasUse({ ...last, max: "50" }), false);
});
