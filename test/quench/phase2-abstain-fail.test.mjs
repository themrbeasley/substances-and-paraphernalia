// test/quench/phase2-abstain-fail.test.mjs
/**
 * Spec §8.1: Wis Abstain Check fails → Con Withdrawal Save runs → passes → no
 * Withdrawal AE. No tolerance decay (Wis failed).
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

export function registerPhase2AbstainFail(quench) {
  quench.registerBatch(
    "fishut.phase2-abstain-fail",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      describe("Phase 2: Wis fail, Con pass", () => {
        let actor, substance, restoreWis, restoreCon;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({
            withdrawalDc: 15,
            abstain: { ability: "wis", dc: 12 },
            duration: { value: 3, unit: "days" },
          }));
          await incrementActorToleranceCount(actor, substance);
          await applyOutcome(actor, substance, { saveResult: "fail", alreadyAddicted: false });
          // Wis check fails (total 1 < dc 12), Con save passes (total 20 >= dc 15).
          restoreWis = stubRoll(actor, "rollAbilityCheck", 1);
          restoreCon = stubRoll(actor, "rollSavingThrow", 20);
          setAbstainDialogStub(async () => ({ [substance.id]: "abstain" }));
        });
        afterEach(async () => {
          restoreWis?.();
          restoreCon?.();
          setAbstainDialogStub(null);
          await teardownFixture(actor, substance);
        });

        it("applies no Withdrawal AE and leaves Count unchanged", async () => {
          const countBefore = getActorToleranceEntry(actor, substance.id)?.count ?? 0;

          await runPhase2(actor);

          // No Withdrawal AE: Con save passed.
          const withdrawalAes = findEffectsByRole(actor, "withdrawal").filter(
            (e) => e.flags?.["substances-and-paraphernalia"]?.sourceSubstanceId === substance.id,
          );
          assert.equal(withdrawalAes.length, 0, "no Withdrawal AE when Con save passes");

          // Count is unchanged: Wis failed so no tolerance decay.
          const countAfter = getActorToleranceEntry(actor, substance.id)?.count ?? 0;
          assert.equal(countAfter, countBefore, "Count unchanged when Wis check fails");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Wis Fail, Con Pass" },
  );
}
