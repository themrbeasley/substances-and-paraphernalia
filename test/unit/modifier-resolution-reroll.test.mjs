import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickBypassResolution } from "../../scripts/data/modifier-resolution.js";

// Focused suite for the v0.6.0 reroll-on-fail tier. The cross-tier ordering
// cases live in modifier-pipeline.test.mjs; this file pins per-tier filter
// behavior and within-tier tie-break independent of the other tiers.
const reroll = (overrides = {}) => ({
  id: "ae-rr-default",
  kind: "bypass",
  type: "reroll-on-fail",
  appliesTo: ["inhaled"],
  hasUsesConfig: false,
  usesRemaining: undefined,
  ...overrides,
});

describe("pickBypassResolution — reroll-on-fail tier", () => {
  it("returns a single-source reroll-on-fail resolution with bonus:0", () => {
    const c = reroll();
    const r = pickBypassResolution("inhaled", [c]);
    assert.equal(r.resolution, "reroll-on-fail");
    assert.equal(r.sources.length, 1);
    assert.equal(r.sources[0], c);
    assert.equal(r.bonus, 0);
  });

  it("is single-pick: second-strongest reroll candidate is dropped from sources", () => {
    const a = reroll({ id: "a-rr" });
    const b = reroll({ id: "b-rr" });
    const r = pickBypassResolution("inhaled", [a, b]);
    assert.equal(r.sources.length, 1);
    assert.equal(r.sources[0], a);
    assert.equal(r.sources.includes(b), false);
  });

  it("ascending-id tie-break picks the lexicographically smallest id", () => {
    const z = reroll({ id: "z-rr" });
    const a = reroll({ id: "a-rr" });
    const m = reroll({ id: "m-rr" });
    let r = pickBypassResolution("inhaled", [z, m, a]);
    assert.equal(r.sources[0], a);
    r = pickBypassResolution("inhaled", [a, z, m]);
    assert.equal(r.sources[0], a);
  });

  it("filters out reroll candidates whose appliesTo doesn't include the administration", () => {
    const c = reroll({ appliesTo: ["contact"] });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("filters out reroll candidates whose usesPerDay is configured but exhausted", () => {
    const c = reroll({ hasUsesConfig: true, usesRemaining: 0 });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("treats unlimited-uses reroll candidates (hasUsesConfig:false) as always available", () => {
    const c = reroll({ hasUsesConfig: false, usesRemaining: undefined });
    const r = pickBypassResolution("inhaled", [c]);
    assert.equal(r.sources[0], c);
  });

  it("coerces string usesRemaining numerically", () => {
    const ok = reroll({ hasUsesConfig: true, usesRemaining: "3" });
    assert.equal(pickBypassResolution("inhaled", [ok]).sources[0], ok);
    const empty = reroll({ id: "ae-empty", hasUsesConfig: true, usesRemaining: "0" });
    assert.equal(pickBypassResolution("inhaled", [empty]), null);
  });

  it("ignores reroll candidates whose kind is not 'bypass'", () => {
    const c = reroll({ kind: "tolerance" });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("skips disqualified reroll candidates and picks the next eligible", () => {
    const wrong = reroll({ id: "ae-wrong", appliesTo: ["contact"] });
    const empty = reroll({ id: "ae-empty", hasUsesConfig: true, usesRemaining: 0 });
    const ok = reroll({ id: "ae-ok" });
    const r = pickBypassResolution("inhaled", [wrong, empty, ok]);
    assert.equal(r.sources[0], ok);
  });
});
