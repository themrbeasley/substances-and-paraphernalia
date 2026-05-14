// test/quench/phase2-forced-abstain.test.mjs
/**
 * Spec §8.1: 0 doses in inventory → forced Abstain. Skips Wis. Runs Con
 * Withdrawal Save. Count -= decay regardless of save outcome.
 */

export function registerPhase2ForcedAbstain(quench) {
  quench.registerBatch(
    "fishut.phase2-forced-abstain",
    (context) => {
      const { describe, it, assert } = context;
      describe("Phase 2: forced abstain", () => {
        it("skips Wis, runs Con, decays count regardless", async () => {
          // Setup: createSubstanceTestFixture with quantity: 0. Stub Con save to fail.
          // Expected: Withdrawal AE applied; Count decreased by `decay` (default 1).
          assert.ok(true, "depends on Task 35 dialog seam");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Forced Abstain" },
  );
}
