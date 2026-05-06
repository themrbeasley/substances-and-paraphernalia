import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickBypassCandidate } from "../../scripts/data/bypass-match.js";

const candidate = (overrides = {}) => ({
  ready: true,
  bypass: { type: "auto-pass", appliesTo: ["inhaled"] },
  hasUsesConfig: true,
  usesRemaining: 4,
  ...overrides,
});

describe("pickBypassCandidate(administration, candidates)", () => {
  it("picks a ready candidate whose bypass matches the administration", () => {
    const c = candidate();
    assert.equal(pickBypassCandidate("inhaled", [c]), c);
  });

  it("returns null when no candidate is ready", () => {
    assert.equal(
      pickBypassCandidate("inhaled", [candidate({ ready: false })]),
      null,
    );
  });

  it("returns null when administration is missing", () => {
    assert.equal(pickBypassCandidate(undefined, [candidate()]), null);
    assert.equal(pickBypassCandidate("", [candidate()]), null);
    assert.equal(pickBypassCandidate(null, [candidate()]), null);
  });

  it("returns null when bypass appliesTo does not include administration", () => {
    const c = candidate({ bypass: { type: "auto-pass", appliesTo: ["inhaled"] } });
    assert.equal(pickBypassCandidate("sublingual", [c]), null);
  });

  it("returns null when candidate has no bypass at all", () => {
    assert.equal(
      pickBypassCandidate("inhaled", [candidate({ bypass: null })]),
      null,
    );
    assert.equal(
      pickBypassCandidate("inhaled", [candidate({ bypass: undefined })]),
      null,
    );
  });

  it("returns null when bypass.appliesTo is not an array", () => {
    assert.equal(
      pickBypassCandidate("inhaled", [
        candidate({ bypass: { type: "auto-pass", appliesTo: "inhaled" } }),
      ]),
      null,
    );
  });

  it("returns null when uses-tracked candidate has 0 uses remaining", () => {
    const c = candidate({ hasUsesConfig: true, usesRemaining: 0 });
    assert.equal(pickBypassCandidate("inhaled", [c]), null);
  });

  it("treats unlimited-uses candidates as always available", () => {
    const c = candidate({ hasUsesConfig: false, usesRemaining: undefined });
    assert.equal(pickBypassCandidate("inhaled", [c]), c);
  });

  it("preserves input order: first qualifying candidate wins", () => {
    const a = candidate({ usesRemaining: 4 });
    const b = candidate({ usesRemaining: 2 });
    assert.equal(pickBypassCandidate("inhaled", [a, b]), a);
  });

  it("skips disqualified candidates and picks the next match", () => {
    const a = candidate({ ready: false });
    const b = candidate({
      bypass: { type: "auto-pass", appliesTo: ["sublingual"] },
    });
    const c = candidate({ usesRemaining: 0 });
    const d = candidate({ usesRemaining: 1 });
    assert.equal(pickBypassCandidate("inhaled", [a, b, c, d]), d);
  });

  it("handles bypass appliesTo with multiple administrations", () => {
    const c = candidate({
      bypass: { type: "auto-pass", appliesTo: ["inhaled", "ingested"] },
    });
    assert.equal(pickBypassCandidate("ingested", [c]), c);
    assert.equal(pickBypassCandidate("injected", [c]), null);
  });

  it("returns null for empty or non-array candidate list", () => {
    assert.equal(pickBypassCandidate("inhaled", []), null);
    assert.equal(pickBypassCandidate("inhaled", null), null);
    assert.equal(pickBypassCandidate("inhaled", undefined), null);
  });

  it("coerces string usesRemaining numerically", () => {
    const c = candidate({ usesRemaining: "3" });
    assert.equal(pickBypassCandidate("inhaled", [c]), c);
    const z = candidate({ usesRemaining: "0" });
    assert.equal(pickBypassCandidate("inhaled", [z]), null);
  });
});
