import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPriorHigh } from "../../scripts/data/prior-high.js";

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
