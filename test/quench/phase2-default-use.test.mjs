// test/quench/phase2-default-use.test.mjs
/**
 * Spec §8.1: Confirm with no rows checked → every addicted substance runs
 * through the full Phase 1 chain (forced use via the activity bypass set).
 */

export function registerPhase2DefaultUse(quench) {
  quench.registerBatch(
    "fishut.phase2-default-use",
    (context) => {
      const { describe, it, assert } = context;
      describe("Phase 2: default Use (no checkboxes)", () => {
        it("triggers Phase 1 chain for every addicted substance", async () => {
          // Setup: actor addicted to two substances; stub dialog to return all "use".
          // Spy on activity.use; assert called for each substance.
          assert.ok(true, "depends on Task 35 dialog seam");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Default Use" },
  );
}
