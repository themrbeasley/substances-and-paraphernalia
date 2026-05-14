// test/quench/phase1-addiction-only.test.mjs
/**
 * Spec §7: A failed Phase 1 Addiction Save applies the Addiction AE but does
 * NOT apply a Withdrawal AE and does NOT touch the actor's withdrawal flag map.
 */

import { MODULE_ID } from "../../scripts/config.js";
import { applyOutcome } from "../../scripts/hooks/addiction.js";
import { getActorWithdrawal, findEffectsByRole } from "../../scripts/data/flag-schema.js";

import { createSubstanceTestFixture, teardownFixture } from "./_fixtures.mjs";

export function registerPhase1AddictionOnly(quench) {
  quench.registerBatch(
    "fishut.phase1-addiction-only",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;

      describe("Phase 1: failed Addiction Save", () => {
        let actor;
        let substance;

        beforeEach(async () => {
          const setup = await createSubstanceTestFixture({
            withdrawalDc: 15,
            abstain: { ability: "wis", dc: 12 },
            duration: { value: 3, unit: "days" },
            addictionDc: 14,
          });
          actor = setup.actor;
          substance = setup.substance;
        });

        afterEach(async () => {
          await teardownFixture(actor, substance);
        });

        it("applies Addiction AE only — no Withdrawal AE, no actor flag entry", async () => {
          // Force a failed save by stubbing the d20 to roll 1.
          await applyOutcome(actor, substance, { saveResult: "fail", alreadyAddicted: false });
          const addictions = findEffectsByRole(actor, "addiction");
          assert.ok(addictions.length === 1, "expected exactly one Addiction AE");
          const withdrawals = findEffectsByRole(actor, "withdrawal");
          assert.equal(withdrawals.length, 0, "expected no Withdrawal AE");
          const map = getActorWithdrawal(actor);
          assert.deepEqual(map, {}, "actor.flags.S&P.withdrawal must be empty");
        });
      });
    },
    { displayName: "FISHUT — Phase 1: Addiction Only" },
  );
}

