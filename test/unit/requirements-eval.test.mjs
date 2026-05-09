import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickGroupReason } from "../../scripts/data/requirements-core.js";
import { evaluateSubtypeRequirements } from "../../scripts/data/subtype-requirements.js";

const SCOPE = "substances-and-paraphernalia";

/**
 * Build a minimal Foundry-shaped Item duck for `inspectSubtypeOnActor`:
 *  - getFlag(scope, key) for kind/subtype reads
 *  - type / system fields for readiness inspection
 */
function makeParaphernaliaItem({
  subtype,
  type = "equipment",
  equipped = true,
  attunement = null,
  attuned = false,
  quantity = 1,
} = {}) {
  const flagBag = { kind: "paraphernalia", subtype };
  return {
    type,
    system: {
      equipped,
      attunement,
      attuned,
      quantity,
    },
    getFlag(scope, key) {
      if (scope !== SCOPE) return null;
      return flagBag[key] ?? null;
    },
  };
}

function makeActor(items) {
  return { items };
}

const ready = () => ({ ready: true, reason: null });
const missing = () => ({ ready: false, reason: "missing" });
const unequipped = () => ({ ready: false, reason: "unequipped" });
const unattuned = () => ({ ready: false, reason: "unattuned" });

describe("pickGroupReason(inspections)", () => {
  it("returns null when any candidate is ready", () => {
    assert.equal(pickGroupReason([ready()]), null);
    assert.equal(pickGroupReason([missing(), ready()]), null);
    assert.equal(pickGroupReason([unequipped(), unattuned(), ready()]), null);
  });

  it("returns 'missing' when all candidates are missing", () => {
    assert.equal(pickGroupReason([missing()]), "missing");
    assert.equal(pickGroupReason([missing(), missing(), missing()]), "missing");
  });

  it("prefers 'unequipped' over 'missing' (closer to ready)", () => {
    assert.equal(pickGroupReason([missing(), unequipped()]), "unequipped");
    assert.equal(pickGroupReason([unequipped(), missing()]), "unequipped");
  });

  it("prefers 'unattuned' over 'unequipped' (closer to ready)", () => {
    assert.equal(pickGroupReason([unequipped(), unattuned()]), "unattuned");
    assert.equal(pickGroupReason([unattuned(), unequipped()]), "unattuned");
  });

  it("prefers 'unattuned' over 'missing'", () => {
    assert.equal(pickGroupReason([missing(), unattuned()]), "unattuned");
  });

  it("returns null for empty input (no constraints to fail)", () => {
    assert.equal(pickGroupReason([]), null);
  });

  it("returns null for non-array input", () => {
    assert.equal(pickGroupReason(null), null);
    assert.equal(pickGroupReason(undefined), null);
    assert.equal(pickGroupReason("not an array"), null);
  });

  it("falls back to 'missing' when reasons are unrecognized", () => {
    assert.equal(
      pickGroupReason([{ ready: false, reason: "weird-reason" }]),
      "weird-reason",
    );
    assert.equal(
      pickGroupReason([{ ready: false, reason: undefined }]),
      "missing",
    );
  });

  it("handles a mix of all three reasons (returns highest rank)", () => {
    assert.equal(
      pickGroupReason([missing(), unequipped(), unattuned()]),
      "unattuned",
    );
  });
});

describe("evaluateSubtypeRequirements(actor, subtypes) — AND of OR-groups", () => {
  it("returns ok for empty / non-array input (no constraint)", () => {
    const actor = makeActor([]);
    assert.deepEqual(evaluateSubtypeRequirements(actor, []), { ok: true, missing: [] });
    assert.deepEqual(evaluateSubtypeRequirements(actor, null), { ok: true, missing: [] });
    assert.deepEqual(evaluateSubtypeRequirements(actor, undefined), { ok: true, missing: [] });
  });

  it("bare-string entry: passes when actor owns a ready paraphernalia of that subtype", () => {
    const actor = makeActor([makeParaphernaliaItem({ subtype: "pipe", equipped: true })]);
    const result = evaluateSubtypeRequirements(actor, ["pipe"]);
    assert.deepEqual(result, { ok: true, missing: [] });
  });

  it("bare-string entry: reports 'missing' when actor owns nothing of that subtype", () => {
    const actor = makeActor([makeParaphernaliaItem({ subtype: "pipe", equipped: true })]);
    const result = evaluateSubtypeRequirements(actor, ["syringe"]);
    assert.deepEqual(result, {
      ok: false,
      missing: [{ subtype: "syringe", reason: "missing" }],
    });
  });

  it("bare-string entry: reports closest-to-ready reason when owned but not ready", () => {
    const actor = makeActor([makeParaphernaliaItem({ subtype: "pipe", equipped: false })]);
    const result = evaluateSubtypeRequirements(actor, ["pipe"]);
    assert.deepEqual(result, {
      ok: false,
      missing: [{ subtype: "pipe", reason: "unequipped" }],
    });
  });

  it("OR-group: passes when any subtype in the group is ready", () => {
    const actor = makeActor([
      makeParaphernaliaItem({ subtype: "incense-burner", equipped: true }),
    ]);
    const result = evaluateSubtypeRequirements(actor, [["snuff-horn", "incense-burner"]]);
    assert.deepEqual(result, { ok: true, missing: [] });
  });

  it("OR-group: passes when only one of the alternatives is owned and ready", () => {
    const actor = makeActor([makeParaphernaliaItem({ subtype: "snuff-horn", equipped: true })]);
    const result = evaluateSubtypeRequirements(actor, [["snuff-horn", "incense-burner"]]);
    assert.deepEqual(result, { ok: true, missing: [] });
  });

  it("OR-group: reports 'missing' when actor owns NONE of the alternatives, preserving array shape", () => {
    const actor = makeActor([makeParaphernaliaItem({ subtype: "syringe", equipped: true })]);
    const result = evaluateSubtypeRequirements(actor, [["snuff-horn", "incense-burner"]]);
    assert.deepEqual(result, {
      ok: false,
      missing: [{ subtype: ["snuff-horn", "incense-burner"], reason: "missing" }],
    });
  });

  it("OR-group: reports closest-to-ready reason across alternatives owned but not ready", () => {
    const actor = makeActor([
      makeParaphernaliaItem({ subtype: "snuff-horn", equipped: false }),
      makeParaphernaliaItem({
        subtype: "incense-burner",
        attunement: "required",
        attuned: false,
      }),
    ]);
    const result = evaluateSubtypeRequirements(actor, [["snuff-horn", "incense-burner"]]);
    // snuff-horn is unequipped (rank 2); incense-burner is unattuned (rank 3, closest to ready).
    assert.deepEqual(result, {
      ok: false,
      missing: [{ subtype: ["snuff-horn", "incense-burner"], reason: "unattuned" }],
    });
  });

  it("AND across entries: all must be satisfied (mix of bare and OR-group)", () => {
    const actor = makeActor([
      makeParaphernaliaItem({ subtype: "syringe", equipped: true }),
      // No incense-burner OR snuff-horn — second AND slot fails.
    ]);
    const result = evaluateSubtypeRequirements(actor, [
      "syringe",
      ["snuff-horn", "incense-burner"],
    ]);
    assert.deepEqual(result, {
      ok: false,
      missing: [{ subtype: ["snuff-horn", "incense-burner"], reason: "missing" }],
    });
  });

  it("AND across entries: passes when every slot satisfied (mix of bare and OR-group)", () => {
    const actor = makeActor([
      makeParaphernaliaItem({ subtype: "syringe", equipped: true }),
      makeParaphernaliaItem({ subtype: "incense-burner", equipped: true }),
    ]);
    const result = evaluateSubtypeRequirements(actor, [
      "syringe",
      ["snuff-horn", "incense-burner"],
    ]);
    assert.deepEqual(result, { ok: true, missing: [] });
  });

  it("ignores empty/garbage entries and OR-groups with no valid strings", () => {
    const actor = makeActor([makeParaphernaliaItem({ subtype: "pipe", equipped: true })]);
    const result = evaluateSubtypeRequirements(actor, ["", null, [], [null, ""], "pipe"]);
    assert.deepEqual(result, { ok: true, missing: [] });
  });
});
