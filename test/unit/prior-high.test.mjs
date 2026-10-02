import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPriorHigh, isStrayHigh, findAlteredTemplates } from "../../scripts/data/prior-high.js";

const S = "substances-and-paraphernalia";
const item = { id: "drug", uuid: "Actor.a1.Item.drug" };
const high = (flags, origin) => ({ flags: { [S]: { aeRole: "altered", ...flags } }, origin });

describe("isPriorHigh", () => {
  it("matches the module's own copy by source id", () => {
    assert.equal(isPriorHigh(high({ sourceSubstanceId: "drug" }), item), true);
  });
  it("ignores another substance's copy", () => {
    assert.equal(isPriorHigh(high({ sourceSubstanceId: "other" }), item), false);
  });
  it("matches a Midi or chat-card copy whose origin is under the item", () => {
    assert.equal(isPriorHigh(high({}, "Actor.a1.Item.drug.ActiveEffect.fx1"), item), true);
    assert.equal(isPriorHigh(high({}, "Actor.a1.Item.drug.Activity.act1"), item), true);
    assert.equal(isPriorHigh(high({}, "Actor.a1.Item.drug"), item), true);
  });
  it("does not match an item whose id only starts the same", () => {
    assert.equal(isPriorHigh(high({}, "Actor.a1.Item.drug2.ActiveEffect.fx1"), item), false);
  });
  it("ignores effects that aren't highs", () => {
    const addiction = { flags: { [S]: { aeRole: "addiction", sourceSubstanceId: "drug" } } };
    assert.equal(isPriorHigh(addiction, item), false);
  });
});

describe("isStrayHigh", () => {
  const drug = {
    id: "drug",
    uuid: "Actor.a1.Item.drug",
    getFlag: (_s, k) => (k === "kind" ? "substance" : undefined),
  };
  const gear = {
    id: "pipe",
    uuid: "Actor.a1.Item.pipe",
    getFlag: (_s, k) => (k === "kind" ? "paraphernalia" : undefined),
  };
  const actor = { items: [drug, gear] };

  it("flags a Midi or chat-card copy of a drug's high", () => {
    assert.equal(isStrayHigh(high({}, "Actor.a1.Item.drug.ActiveEffect.fx1"), actor), true);
  });
  it("leaves the module's own copy alone", () => {
    assert.equal(
      isStrayHigh(high({ sourceSubstanceId: "drug" }, "Actor.a1.Item.drug"), actor),
      false,
    );
  });
  it("leaves an effect from a non-drug item alone", () => {
    assert.equal(isStrayHigh(high({}, "Actor.a1.Item.pipe.ActiveEffect.fx2"), actor), false);
  });
  it("leaves effects that aren't highs alone", () => {
    const addiction = {
      flags: { [S]: { aeRole: "addiction" } },
      origin: "Actor.a1.Item.drug.ActiveEffect.fx3",
    };
    assert.equal(isStrayHigh(addiction, actor), false);
  });
});

describe("untagged highs (v0.9.2 D5)", () => {
  const untagged = (name, origin) => ({ name, flags: {}, origin });
  const drug = {
    id: "drug",
    uuid: "Actor.a1.Item.drug",
    getFlag: (_s, k) => (k === "kind" ? "substance" : undefined),
  };

  it("matches an untagged effect named like a high, by name", () => {
    assert.equal(
      isPriorHigh(untagged("Altered by Homebrew", "Actor.a1.Item.drug.ActiveEffect.fx9"), item),
      true,
    );
  });
  it("ignores an untagged effect that isn't named like a high", () => {
    assert.equal(
      isPriorHigh(untagged("Blessed", "Actor.a1.Item.drug.ActiveEffect.fx9"), item),
      false,
    );
  });
  it("lets a role tag win over the name", () => {
    const tagged = {
      name: "Altered by Homebrew",
      flags: { [S]: { aeRole: "withdrawal" } },
      origin: "Actor.a1.Item.drug",
    };
    assert.equal(isPriorHigh(tagged, item), false);
  });
  it("flags an untagged stray copy", () => {
    assert.equal(
      isStrayHigh(untagged("Altered by Homebrew", "Actor.a1.Item.drug.ActiveEffect.fx9"), {
        items: [drug],
      }),
      true,
    );
  });
  it("leaves a high with no origin alone", () => {
    assert.equal(isStrayHigh(high({}, undefined), { items: [drug] }), false);
  });
  it("leaves effects alone on an actor with no items", () => {
    assert.equal(isStrayHigh(high({}, "Actor.a1.Item.drug.ActiveEffect.fx1"), {}), false);
    assert.equal(isStrayHigh(high({}, "Actor.a1.Item.drug.ActiveEffect.fx1"), null), false);
  });
});

describe("findAlteredTemplates", () => {
  const tagged = (aeRole, name) => ({ name, flags: { [S]: { aeRole } } });
  it("picks only the effects tagged as highs", () => {
    const highFx = tagged("altered", "Altered by Voltbeans");
    const marker = tagged("dose", "Dosed with Voltbeans");
    const addiction = tagged("addiction", "Voltbeans Addiction");
    assert.deepEqual(findAlteredTemplates({ effects: [marker, highFx, addiction] }), [highFx]);
  });
  it("never picks the dose marker, even when nothing is tagged as a high", () => {
    const marker = tagged("dose", "Dosed with Voltbeans");
    assert.deepEqual(findAlteredTemplates({ effects: [marker] }), []);
  });
  it("falls back to the name when no effect is tagged as a high", () => {
    const untagged = { name: "Altered by Homebrew" };
    const other = { name: "Homebrew Addiction" };
    assert.deepEqual(findAlteredTemplates({ effects: [other, untagged] }), [untagged]);
  });
  it("finds nothing on an item with no effects", () => {
    assert.deepEqual(findAlteredTemplates({}), []);
    assert.deepEqual(findAlteredTemplates(undefined), []);
  });
});
