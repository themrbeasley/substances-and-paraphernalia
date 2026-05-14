// test/quench/tolerance-decay-to-zero.test.mjs
import { createSubstanceTestFixture, teardownFixture } from "./_fixtures.mjs";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";
import { applyToleranceDecay } from "../../scripts/hooks/tolerance-decay.js";
import {
  getActorToleranceEntry,
  findEffectsByRole,
} from "../../scripts/data/flag-schema.js";

export function registerToleranceDecayToZero(quench) {
  quench.registerBatch(
    "fishut.tolerance-decay-to-zero",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      describe("Tolerance: decay to zero removes AE", () => {
        let actor, substance;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({
            withdrawalDc: 15,
            toleranceDecay: 1,
          }));
          for (let i = 0; i < 3; i++) await incrementActorToleranceCount(actor, substance);
        });
        afterEach(async () => { await teardownFixture(actor, substance); });

        it("repeated decay → Count to 0 → Tolerance AE removed and flag cleared", async () => {
          for (let i = 0; i < 3; i++) {
            await applyToleranceDecay(actor, substance);
          }
          assert.equal(getActorToleranceEntry(actor, substance.id), null);
          const ae = findEffectsByRole(actor, "tolerance").filter(
            (e) => e.flags?.["substances-and-paraphernalia"]?.sourceSubstanceId === substance.id,
          );
          assert.equal(ae.length, 0);
        });
      });
    },
    { displayName: "FISHUT — Tolerance: Decay to Zero" },
  );
}
