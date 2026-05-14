// test/quench/withdrawal-times-up-cleanup.test.mjs
/**
 * Spec §8.3: When Times-Up removes a Withdrawal AE at duration expiry,
 * withdrawal-cleanup clears the actor's flag entry for that substance.
 */

import { createSubstanceTestFixture, teardownFixture } from "./_fixtures.mjs";
import { setActorWithdrawalEntry, getActorWithdrawal } from "../../scripts/data/flag-schema.js";
import { MODULE_ID } from "../../scripts/config.js";

export function registerWithdrawalTimesUpCleanup(quench) {
  quench.registerBatch(
    "fishut.withdrawal-times-up-cleanup",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      describe("Withdrawal: Times-Up cleanup", () => {
        let actor, substance;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({ withdrawalDc: 15 }));
        });
        afterEach(async () => { await teardownFixture(actor, substance); });

        it("deleteActiveEffect on Withdrawal AE clears actor flag entry", async () => {
          // Stamp an actor-flag entry and apply a withdrawal AE on the actor.
          await setActorWithdrawalEntry(actor, substance.id, {
            appliedAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 1000).toISOString(),
          });
          const [withdrawalAe] = await actor.createEmbeddedDocuments("ActiveEffect", [
            {
              name: `${substance.name} Withdrawal`,
              flags: { [MODULE_ID]: { aeRole: "withdrawal", sourceSubstanceId: substance.id } },
              duration: { seconds: 1 },
            },
          ]);
          await withdrawalAe.delete({ fishutIntentional: true });
          // give the hook a tick
          await new Promise((r) => setTimeout(r, 100));
          const map = getActorWithdrawal(actor);
          assert.deepEqual(map, {}, "actor.flags.withdrawal must be empty after AE delete");
        });
      });
    },
    { displayName: "FISHUT — Withdrawal: Times-Up Cleanup" },
  );
}
