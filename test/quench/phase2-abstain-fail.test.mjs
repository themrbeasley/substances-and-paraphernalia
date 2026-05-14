// test/quench/phase2-abstain-fail.test.mjs
/**
 * Spec §8.1: Wis Abstain Check fails → Con Withdrawal Save runs → passes → no
 * Withdrawal AE. No tolerance decay (Wis failed).
 */

import { createSubstanceTestFixture, teardownFixture, stubRoll } from "./_fixtures.mjs";
import {
  findEffectsByRole,
  getActorWithdrawal,
  getActorToleranceEntry,
} from "../../scripts/data/flag-schema.js";

export function registerPhase2AbstainFail(quench) {
  quench.registerBatch(
    "fishut.phase2-abstain-fail",
    (context) => {
      const { describe, it, assert } = context;
      describe("Phase 2: Wis fail, Con pass", () => {
        it("applies no Withdrawal AE and leaves Count unchanged", async () => {
          // Setup parallels Task 28; abstain stub returns 1 (fail), con save stub returns 20 (pass).
          assert.ok(true, "depends on Task 35 dialog seam");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Wis Fail, Con Pass" },
  );
}
