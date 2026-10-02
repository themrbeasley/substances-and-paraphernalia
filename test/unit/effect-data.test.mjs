import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectChanges, prepareEffectPayload } from "../../scripts/data/effect-data.js";

const SCOPE = "substances-and-paraphernalia";
const OPTS = { sourceSubstanceId: "sub1", origin: "Item.sub1" };

const template = (extra = {}) => ({
  _id: "tpl1",
  name: "Altered by Test",
  disabled: true,
  duration: { value: 600, units: "seconds", expiry: "turnStart", expired: false },
  start: { time: 12, combat: "c1", combatant: "cb1", round: 3, turn: 1, initiative: 10 },
  system: { changes: [{ key: "system.bonuses.mwak.attack", type: "add", value: "2" }] },
  flags: { [SCOPE]: { count: 2 }, other: { keep: true } },
  ...extra,
});

describe("effectChanges", () => {
  it("returns system.changes", () => {
    assert.deepEqual(effectChanges(template()), template().system.changes);
  });
  it("returns [] when there are no change rows", () => {
    assert.deepEqual(effectChanges({}), []);
    assert.deepEqual(effectChanges(null), []);
  });
  it("ignores the legacy top-level changes array", () => {
    assert.deepEqual(effectChanges({ changes: [{ key: "x", mode: 2 }] }), []);
  });
});

describe("prepareEffectPayload", () => {
  it("drops _id and start so V14 stamps a fresh start", () => {
    const data = prepareEffectPayload(template(), OPTS);
    assert.equal("_id" in data, false);
    assert.equal("start" in data, false);
  });

  it("merges our flags without dropping existing keys or other scopes", () => {
    const data = prepareEffectPayload(template(), { ...OPTS, role: "altered" });
    assert.deepEqual(data.flags[SCOPE], { count: 2, sourceSubstanceId: "sub1", aeRole: "altered" });
    assert.deepEqual(data.flags.other, { keep: true });
  });

  it("adds no aeRole when role is omitted, but keeps one already on the template", () => {
    assert.equal("aeRole" in prepareEffectPayload(template(), OPTS).flags[SCOPE], false);
    const tagged = template({ flags: { [SCOPE]: { aeRole: "withdrawal" } } });
    assert.equal(prepareEffectPayload(tagged, OPTS).flags[SCOPE].aeRole, "withdrawal");
  });

  it("creates the flags object when the template has none", () => {
    const data = prepareEffectPayload({ name: "Bare" }, OPTS);
    assert.equal(data.flags[SCOPE].sourceSubstanceId, "sub1");
  });

  it("sets origin and enables the effect", () => {
    const data = prepareEffectPayload(template(), OPTS);
    assert.equal(data.origin, "Item.sub1");
    assert.equal(data.disabled, false);
  });

  it("clears a stale expired flag when keeping the template's duration", () => {
    const stale = template({
      duration: { value: 600, units: "seconds", expiry: "turnStart", expired: true },
    });
    const data = prepareEffectPayload(stale, OPTS);
    assert.equal(data.duration.expired, false);
    assert.equal(data.duration.value, 600);
  });

  it("keeps the template's duration when duration is undefined", () => {
    const data = prepareEffectPayload(template(), OPTS);
    assert.deepEqual(data.duration, template().duration);
  });

  it("makes the effect permanent for duration null, clearing value and expiry", () => {
    const data = prepareEffectPayload(template(), { ...OPTS, duration: null });
    assert.equal(data.duration.value, null);
    assert.equal(data.duration.expiry, null);
    assert.equal(data.duration.expired, false);
  });

  it("treats 0 or negative seconds as permanent (V14 would expire value 0 at once)", () => {
    for (const duration of [0, -5]) {
      const data = prepareEffectPayload(template(), { ...OPTS, duration });
      assert.equal(data.duration.value, null, `duration ${duration}`);
      assert.equal(data.duration.expiry, null, `duration ${duration}`);
    }
  });

  it("sets a positive seconds duration and keeps the template's expiry event", () => {
    const data = prepareEffectPayload(template(), { ...OPTS, duration: 259200 });
    assert.deepEqual(data.duration, {
      value: 259200,
      units: "seconds",
      expiry: "turnStart",
      expired: false,
    });
  });

  it("builds a duration when the template has none", () => {
    const data = prepareEffectPayload({ name: "Bare" }, { ...OPTS, duration: 60 });
    assert.deepEqual(data.duration, { value: 60, units: "seconds", expired: false });
  });

  it("does not touch system.changes", () => {
    const data = prepareEffectPayload(template(), OPTS);
    assert.deepEqual(data.system.changes, template().system.changes);
  });
});
