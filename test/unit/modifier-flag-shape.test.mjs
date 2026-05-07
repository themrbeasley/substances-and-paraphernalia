import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readModifier } from "../../scripts/data/modifier-flag.js";

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
