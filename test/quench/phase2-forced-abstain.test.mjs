// test/quench/phase2-forced-abstain.test.mjs
/**
 * Spec §8.1: 0 doses in inventory → forced Abstain. Skips Wis. Runs Con
 * Withdrawal Save. Count -= decay regardless of save outcome.
 */

import { createSubstanceTestFixture, teardownFixture, stubRoll } from "./_fixtures.mjs";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";
import { applyOutcome } from "../../scripts/hooks/addiction.js";
import {
  findEffectsByRole,
  getActorToleranceEntry,
} from "../../scripts/data/flag-schema.js";
import {
  runPhase2,
  setAbstainDialogStub,
} from "../../scripts/hooks/long-rest-abstain.js";

export function registerPhase2ForcedAbstain(quench) {
  quench.registerBatch(
    "fishut.phase2-forced-abstain",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      describe("Phase 2: forced abstain", () => {
        let actor, substance, restoreCon;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({
            withdrawalDc: 15,
            abstain: { ability: "wis", dc: 12 },
            duration: { value: 3, unit: "days" },
            toleranceDecay: 1,
          }));
          await incrementActorToleranceCount(actor, substance);
          await applyOutcome(actor, substance, { saveResult: "fail", alreadyAddicted: false });
          // Con save fails (1 < 15).
          restoreCon = stubRoll(actor, "rollSavingThrow", 1);
          // Dialog returns forced-abstain (simulating 0 doses / user selecting forced).
          setAbstainDialogStub(async () => ({ [substance.id]: "forced-abstain" }));
        });
        afterEach(async () => {
          restoreCon?.();
          setAbstainDialogStub(null);
          await teardownFixture(actor, substance);
        });

        it("skips Wis, runs Con, decays count regardless", async () => {
          const countBefore = getActorToleranceEntry(actor, substance.id)?.count ?? 0;

          await runPhase2(actor);

          // Withdrawal AE applied (Con save failed).
          const withdrawalAes = findEffectsByRole(actor, "withdrawal").filter(
            (e) => e.flags?.["substances-and-paraphernalia"]?.sourceSubstanceId === substance.id,
          );
          assert.equal(withdrawalAes.length, 1, "Withdrawal AE applied on Con fail");

          // Count decays by 1 regardless of save outcome (forced abstain always decays).
          const countAfter = getActorToleranceEntry(actor, substance.id)?.count ?? 0;
          assert.equal(countAfter, countBefore - 1, "Count decremented by decay even when Con fails");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Forced Abstain" },
  );
}
