// test/quench/phase2-abstain-pass.test.mjs
/**
 * Spec §8.1 / §8.2: Wis Abstain Check passes → no Withdrawal AE; Count -= decay.
 */

import { createSubstanceTestFixture, teardownFixture, stubRoll } from "./_fixtures.mjs";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";
import { applyOutcome } from "../../scripts/hooks/addiction.js";
import {
  getActorToleranceEntry,
  findEffectsByRole,
} from "../../scripts/data/flag-schema.js";
import {
  runPhase2,
  setAbstainDialogStub,
} from "../../scripts/hooks/long-rest-abstain.js";

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
          // Stub dialog to return "abstain" for this substance.
          setAbstainDialogStub(async () => ({ [substance.id]: "abstain" }));
        });
        afterEach(async () => {
          restore?.();
          setAbstainDialogStub(null);
          await teardownFixture(actor, substance);
        });

        it("pass Wis: no Withdrawal AE; Count decays by 1", async () => {
          const countBefore = getActorToleranceEntry(actor, substance.id)?.count ?? 0;

          await runPhase2(actor);

          // No Withdrawal AE should be applied.
          const withdrawalAes = findEffectsByRole(actor, "withdrawal").filter(
            (e) => e.flags?.["substances-and-paraphernalia"]?.sourceSubstanceId === substance.id,
          );
          assert.equal(withdrawalAes.length, 0, "no Withdrawal AE after Wis pass");

          // Count decays by 1 (default decay = 1).
          const countAfter = getActorToleranceEntry(actor, substance.id)?.count ?? 0;
          assert.equal(countAfter, countBefore - 1, "Count decremented by 1 after Wis pass");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Abstain Pass" },
  );
}
