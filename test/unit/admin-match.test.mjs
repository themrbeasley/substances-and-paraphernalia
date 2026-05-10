import test from "node:test";
import assert from "node:assert/strict";
import { actorSatisfiesAdmin } from "../../scripts/data/admin-match.js";

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
