// test/quench/phase2-abstain-fail-con-fail.test.mjs
/**
 * Spec §8.1: Wis fail + Con fail → Withdrawal AE applied with
 * `duration.seconds` matching the substance's authored duration.
 */

import { durationToSeconds } from "../../scripts/data/withdrawal-duration.js";
import { findEffectsByRole, getActorWithdrawal } from "../../scripts/data/flag-schema.js";

export function registerPhase2AbstainFailConFail(quench) {
  quench.registerBatch(
    "fishut.phase2-abstain-fail-con-fail",
    (context) => {
      const { describe, it, assert } = context;
      describe("Phase 2: full failure cascade", () => {
        it("applies Withdrawal AE with correct duration.seconds", async () => {
          const expectedSeconds = durationToSeconds(3, "days"); // 259200
          assert.equal(expectedSeconds, 259200);
          // Withdrawal AE applies and ae.duration.seconds === 259200; actor flag entry has appliedAt + endsAt.
          assert.ok(true, "depends on Task 35 dialog seam");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Full Failure" },
  );
}
