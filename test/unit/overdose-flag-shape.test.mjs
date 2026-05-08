import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getOverdose,
  setOverdose,
  getWithdrawalEffectId,
  setWithdrawalEffectId,
  getAddictionEffectIds,
  setAddictionEffectIds,
  getWithdrawalEffectIds,
  setWithdrawalEffectIds,
  getOverdoseEffectIds,
  setOverdoseEffectIds,
  getToleranceEffectIds,
  setToleranceEffectIds,
} from "../../scripts/data/flag-schema.js";
import { MODULE_ID } from "../../scripts/config.js";

function makeItem() {
  const store = new Map();
  const key = (scope, k) => `${scope}::${k}`;
  return {
    _store: store,
    getFlag(scope, k) {
      return store.get(key(scope, k));
    },
    setFlag(scope, k, value) {
      store.set(key(scope, k), value);
      return Promise.resolve(this);
    },
  };
}

describe("getOverdose / setOverdose", () => {
  it("returns null when the flag is absent (no defaults)", () => {
    const item = makeItem();
    assert.equal(getOverdose(item), null);
  });

  it("round-trips a full overdose block", async () => {
    const item = makeItem();
    const block = {
      enabled: true,
      chancePercent: 7,
      description: "<p>You see colors.</p>",
    };
    await setOverdose(item, block);
    assert.deepEqual(getOverdose(item), block);
  });

  it("round-trips a disabled block (still a value, not null)", async () => {
    const item = makeItem();
    const block = { enabled: false, chancePercent: 0, description: "" };
    await setOverdose(item, block);
    assert.deepEqual(getOverdose(item), block);
  });

  it("returns null on a null/undefined item", () => {
    assert.equal(getOverdose(null), null);
    assert.equal(getOverdose(undefined), null);
  });

  it("writes under the substances-and-paraphernalia scope", async () => {
    const item = makeItem();
    await setOverdose(item, { enabled: true, chancePercent: 5, description: "x" });
    const found = [...item._store.keys()].some((k) => k.startsWith(`${MODULE_ID}::`));
    assert.equal(found, true);
  });
});

describe("getWithdrawalEffectId / setWithdrawalEffectId", () => {
  it("returns null when the flag is absent", () => {
    const item = makeItem();
    assert.equal(getWithdrawalEffectId(item), null);
  });

  it("round-trips an AE id string", async () => {
    const item = makeItem();
    await setWithdrawalEffectId(item, "AbCdEf1234567890");
    assert.equal(getWithdrawalEffectId(item), "AbCdEf1234567890");
  });

  it("returns null on a null/undefined item", () => {
    assert.equal(getWithdrawalEffectId(null), null);
    assert.equal(getWithdrawalEffectId(undefined), null);
  });
});

describe("plural *EffectIds accessors", () => {
  it("getAddictionEffectIds returns [] when no flag", () => {
    assert.deepEqual(getAddictionEffectIds(makeItem()), []);
  });

  it("getAddictionEffectIds reads canonical plural shape", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "addiction", {
      enabled: true,
      save: { ability: "con", dc: 13 },
      addictionEffectIds: ["a", "b"],
    });
    assert.deepEqual(getAddictionEffectIds(item), ["a", "b"]);
  });

  it("getAddictionEffectIds wraps legacy singular id in an array", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "addiction", {
      enabled: true,
      save: { ability: "con", dc: 13 },
      addictionEffectId: "legacy",
    });
    assert.deepEqual(getAddictionEffectIds(item), ["legacy"]);
  });

  it("setAddictionEffectIds writes plural and strips singular", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "addiction", {
      save: { ability: "con", dc: 13 },
      addictionEffectId: "legacy",
    });
    await setAddictionEffectIds(item, ["x", "y"]);
    const block = item.getFlag(MODULE_ID, "addiction");
    assert.deepEqual(block.addictionEffectIds, ["x", "y"]);
    assert.equal(block.addictionEffectId, undefined);
  });

  it("getWithdrawalEffectIds reads canonical plural shape", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "withdrawal", { mod: 4, effectIds: ["w1", "w2"] });
    assert.deepEqual(getWithdrawalEffectIds(item), ["w1", "w2"]);
  });

  it("getWithdrawalEffectIds wraps legacy singular id", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "withdrawal", { mod: 4, effectId: "old" });
    assert.deepEqual(getWithdrawalEffectIds(item), ["old"]);
  });

  it("setWithdrawalEffectIds strips legacy singular", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "withdrawal", { mod: 4, effectId: "old" });
    await setWithdrawalEffectIds(item, ["new"]);
    const block = item.getFlag(MODULE_ID, "withdrawal");
    assert.deepEqual(block.effectIds, ["new"]);
    assert.equal(block.effectId, undefined);
  });

  it("getOverdoseEffectIds reads canonical plural shape", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "overdose", {
      enabled: true,
      chancePercent: 5,
      description: "x",
      effectIds: ["o1"],
    });
    assert.deepEqual(getOverdoseEffectIds(item), ["o1"]);
  });

  it("setOverdoseEffectIds round-trips plural list", async () => {
    const item = makeItem();
    await setOverdoseEffectIds(item, ["o1", "o2"]);
    assert.deepEqual(getOverdoseEffectIds(item), ["o1", "o2"]);
  });

  it("getToleranceEffectIds reads canonical plural shape", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "tolerance", { effectIds: ["t1", "t2"] });
    assert.deepEqual(getToleranceEffectIds(item), ["t1", "t2"]);
  });

  it("setToleranceEffectIds round-trips plural list", async () => {
    const item = makeItem();
    await setToleranceEffectIds(item, ["t1"]);
    assert.deepEqual(getToleranceEffectIds(item), ["t1"]);
  });

  it("filters out non-string and empty entries", async () => {
    const item = makeItem();
    await item.setFlag(MODULE_ID, "addiction", {
      save: { ability: "con", dc: 13 },
      addictionEffectIds: ["valid", "", null, undefined, 42, "another"],
    });
    assert.deepEqual(getAddictionEffectIds(item), ["valid", "another"]);
  });
});
