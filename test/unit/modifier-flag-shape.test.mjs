import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readModifier,
  readModifierFromChanges,
  writeModifierAsChanges,
  mergeModifierIntoChanges,
  modifierChangeKeyPrefix,
} from "../../scripts/data/modifier-flag.js";

const SCOPE = "substances-and-paraphernalia";
const PREFIX = modifierChangeKeyPrefix(SCOPE);
const OVERRIDE_MODE = 5;

describe("readModifier(flagsScope)", () => {
  it("returns the modifier block verbatim when present", () => {
    const block = {
      kind: "bypass",
      type: "auto-pass",
      appliesTo: ["inhaled"],
      usesPerDay: 3,
    };
    assert.deepEqual(readModifier({ modifier: block }), block);
  });

  it("returns null when the scope is null or undefined", () => {
    assert.equal(readModifier(null), null);
    assert.equal(readModifier(undefined), null);
  });

  it("returns null when the scope has no modifier key", () => {
    assert.equal(readModifier({}), null);
    assert.equal(readModifier({ category: "stimulant", kind: "substance" }), null);
  });

  it("returns null when modifier is explicitly null/undefined", () => {
    assert.equal(readModifier({ modifier: null }), null);
    assert.equal(readModifier({ modifier: undefined }), null);
  });

  it("returns the advantage shape unchanged", () => {
    const block = {
      kind: "bypass",
      type: "advantage",
      appliesTo: ["inhaled", "ingested"],
    };
    assert.deepEqual(readModifier({ modifier: block }), block);
  });

  it("does not normalize partial blocks (caller's responsibility)", () => {
    const partial = { kind: "bypass" };
    assert.deepEqual(readModifier({ modifier: partial }), partial);
  });

  it("ignores sibling keys in the flag scope", () => {
    const block = { kind: "bypass", type: "auto-pass", appliesTo: ["contact"] };
    const scope = {
      modifier: block,
      sourceSubstanceId: "abc123",
      withdrawal: { foo: { restsRemaining: 2 } },
    };
    assert.deepEqual(readModifier(scope), block);
  });
});

describe("writeModifierAsChanges + readModifierFromChanges round-trip", () => {
  it("round-trips a flat bypass block", () => {
    const block = {
      kind: "bypass",
      type: "+N",
      appliesTo: ["inhaled", "ingested"],
      bonus: 2,
      usesPerDay: 3,
    };
    const changes = writeModifierAsChanges(block, SCOPE);
    assert.ok(Array.isArray(changes) && changes.length > 0);
    for (const row of changes) {
      assert.ok(row.key.startsWith(PREFIX));
      assert.equal(row.mode, OVERRIDE_MODE);
      assert.equal(typeof row.value, "string");
    }
    const decoded = readModifierFromChanges(changes, SCOPE);
    assert.deepEqual(decoded, block);
  });

  it("round-trips a nested tolerance block (flattens nested leaves)", () => {
    const block = {
      kind: "tolerance",
      substanceId: "abc123",
      addictionDcBump: 2,
      attenuateAltered: { durationFactor: 0.1, modifierFactor: 0, dropAdvantage: true },
      withdrawalAmplify: { durationFactor: 0, modifierFactor: 0.2, addDisadvantage: false },
    };
    const changes = writeModifierAsChanges(block, SCOPE);
    const keys = changes.map((r) => r.key);
    assert.ok(keys.includes(`${PREFIX}attenuateAltered.durationFactor`));
    assert.ok(keys.includes(`${PREFIX}attenuateAltered.dropAdvantage`));
    assert.ok(keys.includes(`${PREFIX}withdrawalAmplify.modifierFactor`));
    const decoded = readModifierFromChanges(changes, SCOPE);
    assert.deepEqual(decoded, block);
  });

  it("encodes booleans as 'true'/'false' strings and arrays as JSON", () => {
    const block = {
      kind: "bypass",
      type: "+N",
      appliesTo: ["inhaled"],
      bonus: 1,
    };
    const changes = writeModifierAsChanges(block, SCOPE);
    const appliesToRow = changes.find((r) => r.key === `${PREFIX}appliesTo`);
    assert.equal(appliesToRow.value, JSON.stringify(["inhaled"]));
  });

  it("preserves usesPerDay as a formula string when not numeric", () => {
    const block = {
      kind: "bypass",
      type: "+N",
      appliesTo: [],
      bonus: 0,
      usesPerDay: "@prof",
    };
    const changes = writeModifierAsChanges(block, SCOPE);
    const decoded = readModifierFromChanges(changes, SCOPE);
    assert.equal(decoded.usesPerDay, "@prof");
  });

  it("returns null when no rows match the prefix", () => {
    assert.equal(readModifierFromChanges([], SCOPE), null);
    assert.equal(readModifierFromChanges(null, SCOPE), null);
    assert.equal(
      readModifierFromChanges([{ key: "system.attributes.hp.value", value: "10" }], SCOPE),
      null,
    );
  });

  it("returns null when matching rows decode to a block without a kind", () => {
    const stray = [{ key: `${PREFIX}bonus`, value: "2" }];
    assert.equal(readModifierFromChanges(stray, SCOPE), null);
  });
});

describe("mergeModifierIntoChanges", () => {
  it("preserves non-modifier rows and replaces modifier rows", () => {
    const existing = [
      { key: "system.attributes.hp.value", mode: OVERRIDE_MODE, value: "10", priority: 20 },
      { key: `${PREFIX}kind`, mode: OVERRIDE_MODE, value: "bypass", priority: 20 },
      { key: `${PREFIX}type`, mode: OVERRIDE_MODE, value: "auto-pass", priority: 20 },
    ];
    const block = { kind: "bypass", type: "+N", appliesTo: [], bonus: 1 };
    const merged = mergeModifierIntoChanges(existing, block, SCOPE);
    const preserved = merged.find((r) => r.key === "system.attributes.hp.value");
    assert.ok(preserved, "non-modifier row preserved");
    const decoded = readModifierFromChanges(merged, SCOPE);
    assert.equal(decoded.type, "+N");
    assert.equal(decoded.bonus, 1);
  });

  it("works with no existing changes", () => {
    const block = { kind: "tolerance", substanceId: "x", addictionDcBump: 1 };
    const merged = mergeModifierIntoChanges(null, block, SCOPE);
    const decoded = readModifierFromChanges(merged, SCOPE);
    assert.deepEqual(decoded, block);
  });
});
