import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getOverdose,
  setOverdose,
  getWithdrawalEffectId,
  setWithdrawalEffectId,
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
