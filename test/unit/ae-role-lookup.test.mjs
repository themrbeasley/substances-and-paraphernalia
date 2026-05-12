import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findEffectsByRole, getAeRole } from "../../scripts/data/flag-schema.js";

const MODULE_ID = "substances-and-paraphernalia";

function mkEffect({ id, name, role }) {
  const flags = { [MODULE_ID]: {} };
  if (role !== undefined) flags[MODULE_ID].aeRole = role;
  return { id, name, flags };
}

function mkActor(effects) {
  return { appliedEffects: effects, effects };
}

describe("getAeRole", () => {
  it("returns the flag when present", () => {
    const e = mkEffect({ id: "a", name: "x", role: "addiction" });
    assert.equal(getAeRole(e), "addiction");
  });
  it("returns null when absent", () => {
    const e = mkEffect({ id: "a", name: "x" });
    assert.equal(getAeRole(e), null);
  });
});

describe("findEffectsByRole", () => {
  it("returns flag matches when flag present", () => {
    const actor = mkActor([
      mkEffect({ id: "1", name: "Addicted to Foo", role: "addiction" }),
      mkEffect({ id: "2", name: "Tolerance: Foo", role: "tolerance" }),
    ]);
    const out = findEffectsByRole(actor, "addiction");
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "1");
  });

  it("falls back to substring match when flag absent", () => {
    const warnLog = [];
    const actor = mkActor([
      mkEffect({ id: "1", name: "Hand-authored Addiction AE" }),
    ]);
    const out = findEffectsByRole(actor, "addiction", { warn: (msg, ctx) => warnLog.push({ msg, ctx }) });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "1");
    assert.equal(warnLog.length, 1);
    assert.match(warnLog[0].msg, /aeRole flag missing/i);
  });

  it("prefers flag over substring when both present (no warn)", () => {
    const warnLog = [];
    const actor = mkActor([
      mkEffect({ id: "1", name: "Addiction Foo", role: "addiction" }),
      mkEffect({ id: "2", name: "addicted Bar" }), // substring-only, different role
    ]);
    const out = findEffectsByRole(actor, "addiction", { warn: (m) => warnLog.push(m) });
    // Both should match (one via flag, one via substring fallback)
    assert.equal(out.length, 2);
    assert.equal(warnLog.length, 1); // only the substring match emits a warn
  });

  it("returns [] when neither flag nor substring matches", () => {
    const actor = mkActor([mkEffect({ id: "1", name: "Bless", role: "altered" })]);
    const out = findEffectsByRole(actor, "addiction");
    assert.deepEqual(out, []);
  });

  it("matches substring case-insensitively", () => {
    const actor = mkActor([mkEffect({ id: "1", name: "WITHDRAWAL FROM X" })]);
    const out = findEffectsByRole(actor, "withdrawal");
    assert.equal(out.length, 1);
  });

  it("returns [] for unknown role", () => {
    const actor = mkActor([mkEffect({ id: "1", name: "x", role: "addiction" })]);
    const out = findEffectsByRole(actor, "made-up-role");
    assert.deepEqual(out, []);
  });
});
