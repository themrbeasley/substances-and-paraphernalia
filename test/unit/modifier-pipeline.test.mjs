import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickBypassResolution } from "../../scripts/data/modifier-resolution.js";

const candidate = (overrides = {}) => ({
  id: "ae-default",
  kind: "bypass",
  type: "auto-pass",
  appliesTo: ["inhaled"],
  hasUsesConfig: false,
  usesRemaining: undefined,
  ...overrides,
});

describe("pickBypassResolution(administration, candidates)", () => {
  // ── Acceptance: AE present + appliesTo match → auto-pass ───────────────
  it("returns the bypass candidate when administration is in appliesTo", () => {
    const c = candidate();
    assert.equal(pickBypassResolution("inhaled", [c]), c);
  });

  // ── Acceptance: appliesTo mismatch → none ─────────────────────────────
  it("returns null when appliesTo does not include administration", () => {
    const c = candidate({ appliesTo: ["ingested"] });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("returns null when administration is missing or empty", () => {
    assert.equal(pickBypassResolution(undefined, [candidate()]), null);
    assert.equal(pickBypassResolution(null, [candidate()]), null);
    assert.equal(pickBypassResolution("", [candidate()]), null);
  });

  // ── Acceptance: usesPerDay zero → no match ────────────────────────────
  it("returns null when source-item uses are exhausted", () => {
    const c = candidate({ hasUsesConfig: true, usesRemaining: 0 });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("treats unlimited-uses candidates (no usesPerDay declared) as always available", () => {
    const c = candidate({ hasUsesConfig: false, usesRemaining: undefined });
    assert.equal(pickBypassResolution("inhaled", [c]), c);
  });

  it("coerces string usesRemaining numerically", () => {
    const ok = candidate({ hasUsesConfig: true, usesRemaining: "3" });
    assert.equal(pickBypassResolution("inhaled", [ok]), ok);
    const empty = candidate({ id: "ae-empty", hasUsesConfig: true, usesRemaining: "0" });
    assert.equal(pickBypassResolution("inhaled", [empty]), null);
  });

  // ── Acceptance: multiple bypass AEs of mixed types → auto-pass wins ──
  it("auto-pass outranks advantage when both match", () => {
    const adv = candidate({ id: "ae-advantage", type: "advantage" });
    const auto = candidate({ id: "ae-autopass", type: "auto-pass" });
    assert.equal(pickBypassResolution("inhaled", [adv, auto]), auto);
    // Order in the input doesn't matter — composition rule wins.
    assert.equal(pickBypassResolution("inhaled", [auto, adv]), auto);
  });

  // ── Acceptance: only advantage AEs → advantage ────────────────────────
  it("returns advantage when no auto-pass candidates exist", () => {
    const a = candidate({ id: "ae-a", type: "advantage" });
    const b = candidate({ id: "ae-b", type: "advantage", appliesTo: ["ingested"] });
    assert.equal(pickBypassResolution("inhaled", [a, b]), a);
  });

  // ── Acceptance: no matching AEs → none ────────────────────────────────
  it("returns null for an empty candidate list", () => {
    assert.equal(pickBypassResolution("inhaled", []), null);
    assert.equal(pickBypassResolution("inhaled", null), null);
    assert.equal(pickBypassResolution("inhaled", undefined), null);
  });

  it("returns null when no candidate's appliesTo includes the administration", () => {
    const a = candidate({ id: "ae-a", appliesTo: ["ingested"] });
    const b = candidate({ id: "ae-b", appliesTo: ["contact"] });
    assert.equal(pickBypassResolution("inhaled", [a, b]), null);
  });

  it("ignores candidates whose kind is not 'bypass'", () => {
    const c = candidate({ kind: "tolerance" });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("ignores candidates whose type is unknown / out-of-tier", () => {
    const c = candidate({ type: "+1" });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("ignores candidates whose appliesTo is not an array", () => {
    const c = candidate({ appliesTo: "inhaled" });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  // ── Acceptance: tie within tier resolved by id ────────────────────────
  it("breaks ties within auto-pass tier by ascending id", () => {
    const z = candidate({ id: "z-pipe" });
    const a = candidate({ id: "a-pipe" });
    const m = candidate({ id: "m-pipe" });
    assert.equal(pickBypassResolution("inhaled", [z, a, m]), a);
    assert.equal(pickBypassResolution("inhaled", [m, z, a]), a);
  });

  it("breaks ties within advantage tier by ascending id", () => {
    const z = candidate({ id: "z-token", type: "advantage" });
    const a = candidate({ id: "a-token", type: "advantage" });
    assert.equal(pickBypassResolution("inhaled", [z, a]), a);
  });

  // ── Mixed eligibility ─────────────────────────────────────────────────
  it("skips disqualified candidates and picks the next eligible", () => {
    const wrong = candidate({ id: "ae-wrong", appliesTo: ["contact"] });
    const empty = candidate({ id: "ae-empty", hasUsesConfig: true, usesRemaining: 0 });
    const ok = candidate({ id: "ae-ok" });
    assert.equal(pickBypassResolution("inhaled", [wrong, empty, ok]), ok);
  });

  it("prefers an auto-pass even when an advantage with a lexicographically smaller id exists", () => {
    const advA = candidate({ id: "a-token", type: "advantage" });
    const autoZ = candidate({ id: "z-token", type: "auto-pass" });
    assert.equal(pickBypassResolution("inhaled", [advA, autoZ]), autoZ);
  });
});
