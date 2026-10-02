import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DAMAGE_TYPES, overdoseDamage } from "../../scripts/data/overdose-damage.js";

describe("overdoseDamage", () => {
  it("accepts dice, dice plus a number, or a number", () => {
    assert.deepEqual(overdoseDamage({ damage: { formula: "2d8", type: "poison" } }, DAMAGE_TYPES), {
      formula: "2d8",
      type: "poison",
    });
    assert.deepEqual(
      overdoseDamage({ damage: { formula: " 1d6 + 2 ", type: "psychic" } }, DAMAGE_TYPES),
      { formula: "1d6 + 2", type: "psychic" },
    );
    assert.deepEqual(overdoseDamage({ damage: { formula: "5", type: "poison" } }, DAMAGE_TYPES), {
      formula: "5",
      type: "poison",
    });
  });

  it("a blank formula means no damage", () => {
    assert.equal(overdoseDamage({ damage: { formula: "", type: "poison" } }, DAMAGE_TYPES), null);
    assert.equal(overdoseDamage({}, DAMAGE_TYPES), null);
  });

  it("a broken formula or unknown type means no damage", () => {
    assert.equal(overdoseDamage({ damage: { formula: "2d", type: "poison" } }, DAMAGE_TYPES), null);
    assert.equal(
      overdoseDamage({ damage: { formula: "2d6 fire", type: "poison" } }, DAMAGE_TYPES),
      null,
    );
    assert.equal(overdoseDamage({ damage: { formula: "2d6", type: "pain" } }, DAMAGE_TYPES), null);
  });
});
