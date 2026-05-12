import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAdjustedOverdoseChance } from "../../scripts/data/overdose-interaction.js";

describe("computeAdjustedOverdoseChance", () => {
  it("returns baseChance unchanged for mode=none", () => {
    assert.equal(computeAdjustedOverdoseChance(20, 3, "none", 10), 20);
  });

  it("mitigate subtracts stacks × magnitude", () => {
    assert.equal(computeAdjustedOverdoseChance(50, 3, "mitigate", 10), 20);
  });

  it("compound adds stacks × magnitude", () => {
    assert.equal(computeAdjustedOverdoseChance(20, 3, "compound", 10), 50);
  });

  it("clamps result to [0, 100] — mitigate floor", () => {
    assert.equal(computeAdjustedOverdoseChance(10, 5, "mitigate", 10), 0);
  });

  it("clamps result to [0, 100] — compound ceiling", () => {
    assert.equal(computeAdjustedOverdoseChance(90, 5, "compound", 10), 100);
  });

  it("magnitude=0 degenerate: returns baseChance for all modes", () => {
    assert.equal(computeAdjustedOverdoseChance(30, 5, "mitigate", 0), 30);
    assert.equal(computeAdjustedOverdoseChance(30, 5, "compound", 0), 30);
  });

  it("stacks=0 degenerate: returns baseChance for all modes", () => {
    assert.equal(computeAdjustedOverdoseChance(30, 0, "mitigate", 10), 30);
    assert.equal(computeAdjustedOverdoseChance(30, 0, "compound", 10), 30);
  });

  it("unknown mode falls through to none", () => {
    assert.equal(computeAdjustedOverdoseChance(30, 3, "weird", 10), 30);
  });

  it("non-finite inputs degrade gracefully", () => {
    assert.equal(computeAdjustedOverdoseChance(20, NaN, "compound", 10), 20);
    assert.equal(computeAdjustedOverdoseChance(20, 3, "compound", NaN), 20);
  });
});
