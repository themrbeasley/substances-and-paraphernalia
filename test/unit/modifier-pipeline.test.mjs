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
  it("returns an auto-pass resolution when administration is in appliesTo", () => {
    const c = candidate();
    const r = pickBypassResolution("inhaled", [c]);
    assert.equal(r.resolution, "auto-pass");
    assert.equal(r.sources.length, 1);
    assert.equal(r.sources[0], c);
    assert.equal(r.bonus, 0);
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
    const r = pickBypassResolution("inhaled", [c]);
    assert.equal(r.resolution, "auto-pass");
    assert.equal(r.sources[0], c);
  });

  it("coerces string usesRemaining numerically", () => {
    const ok = candidate({ hasUsesConfig: true, usesRemaining: "3" });
    const r = pickBypassResolution("inhaled", [ok]);
    assert.equal(r.sources[0], ok);
    const empty = candidate({ id: "ae-empty", hasUsesConfig: true, usesRemaining: "0" });
    assert.equal(pickBypassResolution("inhaled", [empty]), null);
  });

  // ── Acceptance: multiple bypass AEs of mixed types → auto-pass wins ──
  it("auto-pass outranks advantage when both match", () => {
    const adv = candidate({ id: "ae-advantage", type: "advantage" });
    const auto = candidate({ id: "ae-autopass", type: "auto-pass" });
    let r = pickBypassResolution("inhaled", [adv, auto]);
    assert.equal(r.resolution, "auto-pass");
    assert.equal(r.sources[0], auto);
    // Order in the input doesn't matter — composition rule wins.
    r = pickBypassResolution("inhaled", [auto, adv]);
    assert.equal(r.resolution, "auto-pass");
    assert.equal(r.sources[0], auto);
  });

  // ── Acceptance: only advantage AEs → advantage ────────────────────────
  it("returns advantage when no auto-pass candidates exist", () => {
    const a = candidate({ id: "ae-a", type: "advantage" });
    const b = candidate({ id: "ae-b", type: "advantage", appliesTo: ["ingested"] });
    const r = pickBypassResolution("inhaled", [a, b]);
    assert.equal(r.resolution, "advantage");
    assert.equal(r.sources[0], a);
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
    let r = pickBypassResolution("inhaled", [z, a, m]);
    assert.equal(r.sources[0], a);
    r = pickBypassResolution("inhaled", [m, z, a]);
    assert.equal(r.sources[0], a);
  });

  it("breaks ties within advantage tier by ascending id", () => {
    const z = candidate({ id: "z-token", type: "advantage" });
    const a = candidate({ id: "a-token", type: "advantage" });
    const r = pickBypassResolution("inhaled", [z, a]);
    assert.equal(r.sources[0], a);
  });

  // ── Mixed eligibility ─────────────────────────────────────────────────
  it("skips disqualified candidates and picks the next eligible", () => {
    const wrong = candidate({ id: "ae-wrong", appliesTo: ["contact"] });
    const empty = candidate({ id: "ae-empty", hasUsesConfig: true, usesRemaining: 0 });
    const ok = candidate({ id: "ae-ok" });
    const r = pickBypassResolution("inhaled", [wrong, empty, ok]);
    assert.equal(r.sources[0], ok);
  });

  it("prefers an auto-pass even when an advantage with a lexicographically smaller id exists", () => {
    const advA = candidate({ id: "a-token", type: "advantage" });
    const autoZ = candidate({ id: "z-token", type: "auto-pass" });
    const r = pickBypassResolution("inhaled", [advA, autoZ]);
    assert.equal(r.resolution, "auto-pass");
    assert.equal(r.sources[0], autoZ);
  });

  // ── +N tier — weakest, sums across all matching AEs ───────────────────
  it("returns +N with the bonus for a single matching +N candidate", () => {
    const c = candidate({ id: "ae-pn", type: "+N", bonus: 2 });
    const r = pickBypassResolution("inhaled", [c]);
    assert.equal(r.resolution, "+N");
    assert.equal(r.bonus, 2);
    assert.equal(r.sources.length, 1);
    assert.equal(r.sources[0], c);
  });

  it("sums +N bonuses across multiple matching candidates", () => {
    const a = candidate({ id: "ae-a", type: "+N", bonus: 1 });
    const b = candidate({ id: "ae-b", type: "+N", bonus: 3 });
    const c = candidate({ id: "ae-c", type: "+N", bonus: 2 });
    const r = pickBypassResolution("inhaled", [a, b, c]);
    assert.equal(r.resolution, "+N");
    assert.equal(r.bonus, 6);
    assert.equal(r.sources.length, 3);
    // Sources are deterministically ordered by id
    assert.deepEqual(
      r.sources.map((s) => s.id),
      ["ae-a", "ae-b", "ae-c"],
    );
  });

  it("treats missing or non-numeric +N bonus as 0", () => {
    const a = candidate({ id: "ae-a", type: "+N" });
    const b = candidate({ id: "ae-b", type: "+N", bonus: "oops" });
    const c = candidate({ id: "ae-c", type: "+N", bonus: 2 });
    const r = pickBypassResolution("inhaled", [a, b, c]);
    assert.equal(r.bonus, 2);
  });

  it("auto-pass beats +N", () => {
    const auto = candidate({ id: "ae-auto", type: "auto-pass" });
    const pn = candidate({ id: "ae-pn", type: "+N", bonus: 5 });
    const r = pickBypassResolution("inhaled", [auto, pn]);
    assert.equal(r.resolution, "auto-pass");
    assert.equal(r.sources[0], auto);
    assert.equal(r.bonus, 0);
  });

  it("advantage beats +N", () => {
    const adv = candidate({ id: "ae-adv", type: "advantage" });
    const pn = candidate({ id: "ae-pn", type: "+N", bonus: 5 });
    const r = pickBypassResolution("inhaled", [adv, pn]);
    assert.equal(r.resolution, "advantage");
    assert.equal(r.sources[0], adv);
    assert.equal(r.bonus, 0);
  });

  it("ignores +N candidates whose appliesTo doesn't match (no contribution to bonus)", () => {
    const ok = candidate({ id: "ae-ok", type: "+N", bonus: 2 });
    const wrong = candidate({ id: "ae-wrong", type: "+N", bonus: 99, appliesTo: ["contact"] });
    const r = pickBypassResolution("inhaled", [ok, wrong]);
    assert.equal(r.resolution, "+N");
    assert.equal(r.bonus, 2);
    assert.equal(r.sources.length, 1);
  });

  it("excludes exhausted +N candidates from the sum", () => {
    const ok = candidate({ id: "ae-ok", type: "+N", bonus: 2 });
    const empty = candidate({
      id: "ae-empty",
      type: "+N",
      bonus: 99,
      hasUsesConfig: true,
      usesRemaining: 0,
    });
    const r = pickBypassResolution("inhaled", [ok, empty]);
    assert.equal(r.bonus, 2);
    assert.equal(r.sources.length, 1);
  });

  // ── reroll-on-fail tier — sits between auto-pass and advantage ──────
  it("returns reroll-on-fail when only a reroll AE matches", () => {
    const c = candidate({ id: "ae-rr", type: "reroll-on-fail" });
    const r = pickBypassResolution("inhaled", [c]);
    assert.equal(r.resolution, "reroll-on-fail");
    assert.equal(r.sources.length, 1);
    assert.equal(r.sources[0], c);
    assert.equal(r.bonus, 0);
  });

  it("auto-pass beats reroll-on-fail", () => {
    const auto = candidate({ id: "ae-auto", type: "auto-pass" });
    const rr = candidate({ id: "ae-rr", type: "reroll-on-fail" });
    const r = pickBypassResolution("inhaled", [rr, auto]);
    assert.equal(r.resolution, "auto-pass");
    assert.equal(r.sources[0], auto);
  });

  it("reroll-on-fail beats advantage", () => {
    const adv = candidate({ id: "ae-adv", type: "advantage" });
    const rr = candidate({ id: "ae-rr", type: "reroll-on-fail" });
    const r = pickBypassResolution("inhaled", [adv, rr]);
    assert.equal(r.resolution, "reroll-on-fail");
    assert.equal(r.sources[0], rr);
  });

  it("reroll-on-fail beats +N", () => {
    const pn = candidate({ id: "ae-pn", type: "+N", bonus: 5 });
    const rr = candidate({ id: "ae-rr", type: "reroll-on-fail" });
    const r = pickBypassResolution("inhaled", [pn, rr]);
    assert.equal(r.resolution, "reroll-on-fail");
    assert.equal(r.sources[0], rr);
    assert.equal(r.bonus, 0);
  });

  it("breaks ties within reroll-on-fail tier by ascending id", () => {
    const z = candidate({ id: "z-rr", type: "reroll-on-fail" });
    const a = candidate({ id: "a-rr", type: "reroll-on-fail" });
    const r = pickBypassResolution("inhaled", [z, a]);
    assert.equal(r.resolution, "reroll-on-fail");
    assert.equal(r.sources[0], a);
  });

  it("filters reroll-on-fail when usesRemaining is zero", () => {
    const c = candidate({
      id: "ae-rr",
      type: "reroll-on-fail",
      hasUsesConfig: true,
      usesRemaining: 0,
    });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });

  it("filters reroll-on-fail when appliesTo doesn't match", () => {
    const c = candidate({
      id: "ae-rr",
      type: "reroll-on-fail",
      appliesTo: ["contact"],
    });
    assert.equal(pickBypassResolution("inhaled", [c]), null);
  });
});
