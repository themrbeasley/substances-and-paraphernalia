// test/quench/phase1-overdose-gate.test.mjs
/**
 * Spec §7 / §12: Phase 1 overdose roll fires only when Tolerance Points cross
 * the per-substance threshold. Tier 3 (DC 15) has Rate 3 and Threshold 15;
 * 4 uses → Points 12 → no roll; 5th use → Points 15 → eligible to roll.
 */

import { createSubstanceTestFixture, teardownFixture } from "./_fixtures.mjs";
import { rollOverdoseAndApply } from "../../scripts/hooks/overdose.js";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";

export function registerPhase1OverdoseGate(quench) {
  quench.registerBatch(
    "fishut.phase1-overdose-gate",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;

      describe("Phase 1: overdose gate", () => {
        let actor, substance;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({
            withdrawalDc: 15,
            overdoseEnabled: true,
            overdoseChancePercent: 100, // guarantee a hit if the gate opens
          }));
        });
        afterEach(async () => { await teardownFixture(actor, substance); });

        it("below threshold: no overdose roll fires", async () => {
          for (let i = 0; i < 4; i++) {
            await incrementActorToleranceCount(actor, substance);
          }
          const result = await rollOverdoseAndApply(actor, substance);
          assert.equal(result, null, "expected null result when Points < Threshold");
        });

        it("at threshold: overdose AE applies when chance is 100%", async () => {
          for (let i = 0; i < 5; i++) {
            await incrementActorToleranceCount(actor, substance);
          }
          const result = await rollOverdoseAndApply(actor, substance, () => 1);
          assert.ok(result, "expected an Overdose AE when Points >= Threshold and chance is 100");
        });
      });
    },
    { displayName: "FISHUT — Phase 1: Overdose Gate" },
  );
}
