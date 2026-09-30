import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keepLastDose } from "../../scripts/data/last-dose.js";

const updates = (overrides = {}) => ({ item: [], delete: [], ...overrides });

describe("keepLastDose", () => {
  it("turns the pending delete into 0 doses left", () => {
    const u = updates({ delete: ["drug"] });
    assert.equal(keepLastDose(u, "drug"), true);
    assert.deepEqual(u.delete, []);
    assert.deepEqual(u.item, [{ _id: "drug", "system.quantity": 0, "system.uses.spent": 0 }]);
  });

  it("merges into an update dnd5e already queued for the item", () => {
    const u = updates({ delete: ["drug"], item: [{ _id: "drug", "system.uses.spent": 1 }] });
    keepLastDose(u, "drug");
    assert.deepEqual(u.item, [{ _id: "drug", "system.uses.spent": 0, "system.quantity": 0 }]);
  });

  it("leaves a normal dose from a stack alone", () => {
    const u = updates({ item: [{ _id: "drug", "system.quantity": 2, "system.uses.spent": 0 }] });
    assert.equal(keepLastDose(u, "drug"), false);
    assert.deepEqual(u.item, [{ _id: "drug", "system.quantity": 2, "system.uses.spent": 0 }]);
  });

  it("leaves other deletes alone", () => {
    const u = updates({ delete: ["arrow", "drug"] });
    keepLastDose(u, "drug");
    assert.deepEqual(u.delete, ["arrow"]);
  });
});
