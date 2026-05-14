// test/quench/phase2-default-use.test.mjs
/**
 * Spec §8.1: Confirm with no rows checked → every addicted substance runs
 * through the full Phase 1 chain (forced use via the activity bypass set).
 */

import { createSubstanceTestFixture, teardownFixture } from "./_fixtures.mjs";
import { applyOutcome } from "../../scripts/hooks/addiction.js";
import {
  runPhase2,
  setAbstainDialogStub,
} from "../../scripts/hooks/long-rest-abstain.js";

export function registerPhase2DefaultUse(quench) {
  quench.registerBatch(
    "fishut.phase2-default-use",
    (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      describe("Phase 2: default Use (no checkboxes)", () => {
        let actor, substanceA, substanceB;
        beforeEach(async () => {
          ({ actor, substance: substanceA } = await createSubstanceTestFixture({
            name: "Substance A",
            withdrawalDc: 15,
          }));
          // Create a second substance on the same actor.
          const [sB] = await actor.createEmbeddedDocuments("Item", [
            {
              name: "Substance B",
              type: "consumable",
              system: { type: { value: "poison", subtype: "ingested" }, quantity: 2 },
              flags: {
                "substances-and-paraphernalia": {
                  kind: "substance",
                  schemaVersion: 7,
                  addiction: { enabled: true, save: { ability: "con", dc: 14 }, addictionEffectIds: [] },
                  withdrawal: { enabled: true, dc: 15, abstain: { ability: "wis", dc: 12 }, duration: { value: 3, unit: "days" }, effectIds: [] },
                  tolerance: { enabled: true, decay: 1, effectIds: [] },
                  overdose: { enabled: false, chancePercent: 5, description: "", effectIds: [] },
                },
              },
            },
          ]);
          substanceB = sB;
          // Mark both substances as addicted on the actor.
          await applyOutcome(actor, substanceA, { saveResult: "fail", alreadyAddicted: false });
          await applyOutcome(actor, substanceB, { saveResult: "fail", alreadyAddicted: false });
          // Dialog returns "use" for both (default unchecked behavior).
          setAbstainDialogStub(async () => ({
            [substanceA.id]: "use",
            [substanceB.id]: "use",
          }));
        });
        afterEach(async () => {
          setAbstainDialogStub(null);
          await teardownFixture(actor, substanceA);
          // actor already deleted by teardownFixture; substanceB lives on actor
        });

        it("triggers Phase 1 chain for every addicted substance", async () => {
          // Spy on activity.use for both substances.
          const useCalls = [];
          for (const sub of [substanceA, substanceB]) {
            const activity = sub.system?.activities?.contents?.[0];
            if (activity) {
              const original = activity.use.bind(activity);
              activity.use = async (...args) => {
                useCalls.push(sub.id);
                // Swallow the real use() to avoid Foundry UI overhead in tests.
                return original(...args).catch(() => {});
              };
            }
          }

          await runPhase2(actor);

          assert.ok(
            useCalls.includes(substanceA.id),
            "activity.use called for Substance A",
          );
          assert.ok(
            useCalls.includes(substanceB.id),
            "activity.use called for Substance B",
          );
        });
      });
    },
    { displayName: "FISHUT — Phase 2: Default Use" },
  );
}
