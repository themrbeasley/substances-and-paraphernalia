// test/quench/phase1-tolerance-increment.test.mjs
import { createSubstanceTestFixture, teardownFixture } from "./_fixtures.mjs";
import { incrementActorToleranceCount } from "../../scripts/hooks/addiction.js";
import { getActorToleranceEntry } from "../../scripts/data/flag-schema.js";

export function registerPhase1ToleranceIncrement(quench) {
  quench.registerBatch(
    "fishut.phase1-tolerance-increment",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;

      describe("Phase 1: tolerance increment", () => {
        let actor, substance;
        beforeEach(async () => {
          // Tier 3 (DC 15): Rate 3, MaxCount 5
          ({ actor, substance } = await createSubstanceTestFixture({ withdrawalDc: 15 }));
        });
        afterEach(async () => { await teardownFixture(actor, substance); });

        it("Count rises 0 → 1 → 2 → … → MaxCount, then clamps", async () => {
          for (let i = 1; i <= 7; i++) {
            await incrementActorToleranceCount(actor, substance);
            const entry = getActorToleranceEntry(actor, substance.id);
            const expected = Math.min(5, i);
            assert.equal(entry?.count, expected, `after ${i} uses count should be ${expected}, got ${entry?.count}`);
          }
        });
      });
    },
    { displayName: "FISHUT — Phase 1: Tolerance Increment" },
  );
}
