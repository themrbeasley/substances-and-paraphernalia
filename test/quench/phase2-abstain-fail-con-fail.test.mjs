// test/quench/phase2-abstain-fail-con-fail.test.mjs
/**
 * Spec §8.1: Wis fail + Con fail → Withdrawal AE applied with
 * `duration.seconds` matching the substance's authored duration.
 */

import { createSubstanceTestFixture, teardownFixture, stubRoll } from "./_fixtures.mjs";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";
import { applyOutcome } from "../../scripts/hooks/addiction.js";
import { durationToSeconds } from "../../scripts/data/withdrawal-duration.js";
import {
  findEffectsByRole,
  getActorWithdrawal,
} from "../../scripts/data/flag-schema.js";
import {
  runPhase2,
  setAbstainDialogStub,
} from "../../scripts/hooks/long-rest-abstain.js";

export function registerPhase2AbstainFailConFail(quench) {
  quench.registerBatch(
    "fishut.phase2-abstain-fail-con-fail",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      describe("Phase 2: full failure cascade", () => {
        let actor, substance, restoreWis, restoreCon;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({
            withdrawalDc: 15,
            abstain: { ability: "wis", dc: 12 },
            duration: { value: 3, unit: "days" },
          }));
          await incrementActorToleranceCount(actor, substance);
          await applyOutcome(actor, substance, { saveResult: "fail", alreadyAddicted: false });
          // Wis check fails (1 < 12), Con save fails (1 < 15).
          restoreWis = stubRoll(actor, "rollAbilityCheck", 1);
          restoreCon = stubRoll(actor, "rollSavingThrow", 1);
          setAbstainDialogStub(async () => ({ [substance.id]: "abstain" }));
        });
        afterEach(async () => {
          restoreWis?.();
          restoreCon?.();
          setAbstainDialogStub(null);
          await teardownFixture(actor, substance);
        });

        it("applies Withdrawal AE with correct duration.seconds", async () => {
          const expectedSeconds = durationToSeconds(3, "days"); // 259200
          assert.equal(expectedSeconds, 259200);

          await runPhase2(actor);

          // Withdrawal AE must be applied.
          const withdrawalAes = findEffectsByRole(actor, "withdrawal").filter(
            (e) => e.flags?.["substances-and-paraphernalia"]?.sourceSubstanceId === substance.id,
          );
          assert.equal(withdrawalAes.length, 1, "one Withdrawal AE applied on full failure");
          assert.equal(
            withdrawalAes[0].duration?.seconds,
            expectedSeconds,
            "Withdrawal AE duration.seconds matches authored duration",
          );

          // Actor flag entry must have appliedAt + endsAt.
          const map = getActorWithdrawal(actor) ?? {};
          const entry = map[substance.id];
          assert.ok(entry?.appliedAt, "withdrawal flag entry has appliedAt");
          assert.ok(entry?.endsAt, "withdrawal flag entry has endsAt");
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Full Failure" },
  );
}
