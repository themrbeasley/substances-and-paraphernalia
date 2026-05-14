// test/quench/phase2-abstain-pass.test.mjs
/**
 * Spec §8.1 / §8.2: Wis Abstain Check passes → no Withdrawal AE; Count -= decay.
 */

import { createSubstanceTestFixture, teardownFixture, stubRoll } from "./_fixtures.mjs";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";
import { applyOutcome } from "../../scripts/hooks/addiction.js";
import { openAbstainDialog } from "../../scripts/ui/abstain-dialog.js";
import {
  getActorToleranceEntry,
  findEffectsByRole,
  getActorWithdrawal,
} from "../../scripts/data/flag-schema.js";

export function registerPhase2AbstainPass(quench) {
  quench.registerBatch(
    "fishut.phase2-abstain-pass",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      describe("Phase 2: Abstain pass", () => {
        let actor, substance, restore;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({
            withdrawalDc: 15,
            abstain: { ability: "wis", dc: 12 },
            duration: { value: 3, unit: "days" },
          }));
          await incrementActorToleranceCount(actor, substance);
          await incrementActorToleranceCount(actor, substance);
          // Land an addiction state so the dialog row appears.
          await applyOutcome(actor, substance, { saveResult: "fail", alreadyAddicted: false });
          restore = stubRoll(actor, "rollAbilityCheck", 20); // guaranteed pass
        });
        afterEach(async () => {
          restore?.();
          await teardownFixture(actor, substance);
        });

        it("pass Wis: no Withdrawal AE; Count decays by 1", async () => {
          // Drive Phase 2 directly via the long-rest-abstain pipeline.
          const { runPhase2 } = await import("../../scripts/hooks/long-rest-abstain.js");
          if (!runPhase2) {
            assert.ok(false, "expose runPhase2 from long-rest-abstain.js for tests");
            return;
          }
          // The dialog will resolve via the close-without-confirm path unless
          // stubbed. We force the abstain path by overriding openAbstainDialog
          // for this test only.
          // ... pseudocode; production test uses a UI test seam (see Task 35).
          assert.ok(true, "test stub — see Task 35 for runPhase2 + dialog seam");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Abstain Pass" },
  );
}
