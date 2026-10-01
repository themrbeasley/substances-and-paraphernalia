import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { d20Config, rollWithoutSkipping } from "../../scripts/data/roll-config.js";

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

  it("sets advantage and a bonus together", () => {
    const c = d20Config("con", 13, { advantage: true, bonus: 2 });
    assert.equal(c.advantage, true);
    assert.deepEqual(c.rolls[0].parts, ["2"]);
    assert.equal(c.rolls[0].options.advantage, true);
  });

  it("keeps a negative bonus as a minus part", () => {
    assert.deepEqual(d20Config("con", 13, { bonus: -2 }).rolls[0].parts, ["-2"]);
  });

  it("ignores a zero or non-finite bonus", () => {
    assert.deepEqual(d20Config("wis", 12, { bonus: 0 }).rolls[0].parts, []);
    assert.deepEqual(d20Config("wis", 12, { bonus: NaN }).rolls[0].parts, []);
  });
});

describe("rollWithoutSkipping", () => {
  it("rolls again without the window when the window was closed", async () => {
    const calls = [];
    const roll = async (config, dialog) => {
      calls.push({ config, dialog });
      return calls.length === 1 ? [] : [{ total: 14 }];
    };
    const result = await rollWithoutSkipping(roll, d20Config("con", 13));
    assert.deepEqual(result, { total: 14 });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].dialog, undefined);
    assert.deepEqual(calls[1].dialog, { configure: false });
    assert.equal(calls[1].config.target, 13);
  });

  it("returns the first roll when the window was used", async () => {
    let n = 0;
    const result = await rollWithoutSkipping(async () => (n++, [{ total: 9 }]), d20Config("wis", 11));
    assert.deepEqual(result, { total: 9 });
    assert.equal(n, 1);
  });

  it("gives each attempt its own copy of the config", async () => {
    const seen = [];
    const roll = async (config) => {
      seen.push(config);
      config.rolls[0].parts.push("mutated");
      return seen.length === 1 ? null : [{ total: 5 }];
    };
    const config = d20Config("con", 10, { bonus: 2 });
    await rollWithoutSkipping(roll, config);
    assert.deepEqual(config.rolls[0].parts, ["2"]);
    assert.deepEqual(seen[1].rolls[0].parts, ["2", "mutated"]);
  });

  it("returns null when even the windowless roll gives nothing", async () => {
    assert.equal(await rollWithoutSkipping(async () => [], d20Config("con", 10)), null);
  });
});
