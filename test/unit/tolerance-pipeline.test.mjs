import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { consumeToleranceForSubstance } from "../../scripts/data/modifier-pipeline.js";

const MODULE_ID = "substances-and-paraphernalia";

/**
 * Build a minimal "applied effect" object that the pipeline can read:
 *   - flags[MODULE_ID].modifier  — the modifier block
 *   - flags[MODULE_ID].stacks    — optional stack count (defaults to 1)
 */
function fakeEffect({ id = "ae-fake", modifier, stacks } = {}) {
  const flags = { [MODULE_ID]: { modifier } };
  if (stacks !== undefined) flags[MODULE_ID].stacks = stacks;
  return { id, flags };
}

function fakeActor(effects) {
  return { appliedEffects: effects };
}

describe("consumeToleranceForSubstance(actor, substanceId)", () => {
  it("returns null when actor is missing", () => {
    assert.equal(consumeToleranceForSubstance(null, "subst-1"), null);
    assert.equal(consumeToleranceForSubstance(undefined, "subst-1"), null);
  });

  it("returns null when substanceId is missing", () => {
    assert.equal(consumeToleranceForSubstance(fakeActor([]), null), null);
    assert.equal(consumeToleranceForSubstance(fakeActor([]), ""), null);
  });

  it("returns null when actor has no tolerance AEs", () => {
    const actor = fakeActor([
      fakeEffect({
        modifier: { kind: "bypass", type: "auto-pass", appliesTo: ["inhaled"] },
      }),
    ]);
    assert.equal(consumeToleranceForSubstance(actor, "subst-1"), null);
  });

  it("returns null when no tolerance AE matches the substanceId", () => {
    const actor = fakeActor([
      fakeEffect({
        modifier: { kind: "tolerance", substanceId: "other", addictionDcBump: 1 },
        stacks: 2,
      }),
    ]);
    assert.equal(consumeToleranceForSubstance(actor, "subst-1"), null);
  });

  it("composes a single matching tolerance AE with the recorded stacks", () => {
    const actor = fakeActor([
      fakeEffect({
        modifier: { kind: "tolerance", substanceId: "subst-1", addictionDcBump: 1 },
        stacks: 3,
      }),
    ]);
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.equal(r.addictionDcBump, 3);
    // Untouched factor fields stay at the 1.0 baseline.
    assert.equal(r.attenuateAltered.durationFactor, 1);
    assert.equal(r.withdrawalAmplify.durationFactor, 1);
  });

  it("treats missing stacks flag as 1", () => {
    const actor = fakeActor([
      fakeEffect({
        modifier: { kind: "tolerance", substanceId: "subst-1", addictionDcBump: 2 },
      }),
    ]);
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.equal(r.addictionDcBump, 2);
  });

  it("sums across multiple matching tolerance AEs", () => {
    const actor = fakeActor([
      fakeEffect({
        id: "a",
        modifier: { kind: "tolerance", substanceId: "subst-1", addictionDcBump: 1 },
        stacks: 2,
      }),
      fakeEffect({
        id: "b",
        modifier: { kind: "tolerance", substanceId: "subst-1", addictionDcBump: 1 },
        stacks: 3,
      }),
    ]);
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.equal(r.addictionDcBump, 5);
  });

  it("excludes tolerance AEs for other substances", () => {
    const actor = fakeActor([
      fakeEffect({
        id: "match",
        modifier: { kind: "tolerance", substanceId: "subst-1", addictionDcBump: 1 },
        stacks: 2,
      }),
      fakeEffect({
        id: "other",
        modifier: { kind: "tolerance", substanceId: "subst-2", addictionDcBump: 99 },
        stacks: 5,
      }),
    ]);
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.equal(r.addictionDcBump, 2);
  });

  it("excludes non-tolerance kinds (bypass etc.)", () => {
    const actor = fakeActor([
      fakeEffect({
        id: "bypass",
        modifier: {
          kind: "bypass",
          type: "+N",
          appliesTo: ["inhaled"],
          bonus: 99,
          substanceId: "subst-1",
        },
      }),
      fakeEffect({
        id: "tol",
        modifier: { kind: "tolerance", substanceId: "subst-1", addictionDcBump: 1 },
        stacks: 2,
      }),
    ]);
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.equal(r.addictionDcBump, 2);
  });

  it("falls back to actor.effects when appliedEffects is missing", () => {
    const effects = [
      fakeEffect({
        modifier: { kind: "tolerance", substanceId: "subst-1", addictionDcBump: 1 },
        stacks: 2,
      }),
    ];
    const actor = { effects };
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.equal(r.addictionDcBump, 2);
  });

  it("composes attenuateAltered durationFactor across stacks (3 × -0.1 → 0.7)", () => {
    const actor = fakeActor([
      fakeEffect({
        modifier: {
          kind: "tolerance",
          substanceId: "subst-1",
          attenuateAltered: { durationFactor: -0.1 },
        },
        stacks: 3,
      }),
    ]);
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.ok(Math.abs(r.attenuateAltered.durationFactor - 0.7) < 1e-9);
  });

  it("OR's withdrawalAmplify.addDisadvantage across multiple AEs", () => {
    const actor = fakeActor([
      fakeEffect({
        id: "a",
        modifier: {
          kind: "tolerance",
          substanceId: "subst-1",
          withdrawalAmplify: { addDisadvantage: false },
        },
        stacks: 1,
      }),
      fakeEffect({
        id: "b",
        modifier: {
          kind: "tolerance",
          substanceId: "subst-1",
          withdrawalAmplify: { addDisadvantage: true },
        },
        stacks: 1,
      }),
    ]);
    const r = consumeToleranceForSubstance(actor, "subst-1");
    assert.equal(r.withdrawalAmplify.addDisadvantage, true);
  });
});
