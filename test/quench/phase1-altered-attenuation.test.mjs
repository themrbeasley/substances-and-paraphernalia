// test/quench/phase1-altered-attenuation.test.mjs
import { createSubstanceTestFixture, teardownFixture } from "./_fixtures.mjs";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";
import { applyAlteredEffectGated } from "../../scripts/hooks/addiction.js";
import { findEffectsByRole } from "../../scripts/data/flag-schema.js";

export function registerPhase1AlteredAttenuation(quench) {
  quench.registerBatch(
    "fishut.phase1-altered-attenuation",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;

      describe("Phase 1: Altered AE attenuation by Count", () => {
        let actor, substance;
        beforeEach(async () => {
          ({ actor, substance } = await createSubstanceTestFixture({ withdrawalDc: 15 }));
        });
        afterEach(async () => { await teardownFixture(actor, substance); });

        async function applyAndReadChangeValue() {
          await applyAlteredEffectGated(actor, substance);
          const ae = findEffectsByRole(actor, "altered")[0];
          assert.ok(ae, "expected an Altered AE on the actor");
          const row = ae.changes?.[0];
          return Number(row?.value);
        }

        it("Count 0 → 100% of 10 = 10", async () => {
          assert.equal(await applyAndReadChangeValue(), 10);
        });

        it("Count 1 → 50% of 10 = 5", async () => {
          await incrementActorToleranceCount(actor, substance);
          assert.equal(await applyAndReadChangeValue(), 5);
        });

        it("Count 2 → 25% of 10 = 2.5", async () => {
          await incrementActorToleranceCount(actor, substance);
          await incrementActorToleranceCount(actor, substance);
          assert.equal(await applyAndReadChangeValue(), 2.5);
        });

        it("Count 4 → 0% of 10 = 0", async () => {
          for (let i = 0; i < 4; i++) await incrementActorToleranceCount(actor, substance);
          assert.equal(await applyAndReadChangeValue(), 0);
        });
      });
    },
    { displayName: "FISHUT — Phase 1: Altered Attenuation" },
  );
}
