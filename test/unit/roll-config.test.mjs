import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { d20Config } from "../../scripts/data/roll-config.js";

describe("d20Config", () => {
  it("puts a bonus in rolls[0].parts, where dnd5e 5.x reads it", () => {
    const c = d20Config("con", 13, { bonus: 2 });
    assert.deepEqual(c.rolls[0].parts, ["2"]);
    assert.equal(c.parts, undefined);
    assert.equal(c.ability, "con");
    assert.equal(c.target, 13);
  });

  it("sets advantage everywhere dnd5e and Midi-QoL read it", () => {
    const c = d20Config("con", 13, { advantage: true });
    assert.equal(c.advantage, true);
    assert.equal(c.rolls[0].options.advantage, true);
    assert.deepEqual(c.midiOptions, { advantage: true });
  });

  it("leaves advantage unset without a bypass, so the actor's own sources still apply", () => {
    const c = d20Config("con", 13);
    assert.equal("advantage" in c, false);
    assert.equal("midiOptions" in c, false);
    assert.deepEqual(c.rolls, [{ parts: [], options: {} }]);
  });

  it("ignores a zero or non-finite bonus", () => {
    assert.deepEqual(d20Config("wis", 12, { bonus: 0 }).rolls[0].parts, []);
    assert.deepEqual(d20Config("wis", 12, { bonus: NaN }).rolls[0].parts, []);
  });
});
