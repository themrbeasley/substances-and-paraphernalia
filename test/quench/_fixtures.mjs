// test/quench/_fixtures.mjs
/**
 * Shared Quench fixtures for v0.8.1 lifecycle tests. Quench runs in a live
 * Foundry world, so we create real Actor + Item documents and tear them down
 * between batches.
 */

import { MODULE_ID } from "../../scripts/config.js";

export async function createSubstanceTestFixture(opts) {
  const {
    name = "Test Substance",
    withdrawalDc = 15,
    abstain = { ability: "wis", dc: 12 },
    duration = { value: 3, unit: "days" },
    addictionDc = 14,
    overdoseChancePercent = 5,
    toleranceDecay = 1,
    overdoseEnabled = false,
    withdrawalEnabled = true,
    toleranceEnabled = true,
    addictionEnabled = true,
  } = opts ?? {};

  const actor = await Actor.create({
    name: `Fixture Actor (${Date.now()})`,
    type: "character",
    system: { abilities: { con: { value: 10 }, wis: { value: 10 } } },
  });

  const itemData = {
    name,
    type: "consumable",
    system: {
      type: { value: "poison", subtype: "ingested" },
      quantity: 3,
      activities: { /* dnd5e adds a default activity on create */ },
    },
    flags: {
      [MODULE_ID]: {
        kind: "substance",
        schemaVersion: 7,
        addiction: { enabled: addictionEnabled, save: { ability: "con", dc: addictionDc }, addictionEffectIds: [] },
        withdrawal: { enabled: withdrawalEnabled, dc: withdrawalDc, abstain, duration, effectIds: [] },
        tolerance: { enabled: toleranceEnabled, decay: toleranceDecay, effectIds: [] },
        overdose: { enabled: overdoseEnabled, chancePercent: overdoseChancePercent, description: "test overdose", effectIds: [] },
      },
    },
    effects: [
      {
        _id: randomEffectId(),
        name: `${name} Addiction`,
        flags: { [MODULE_ID]: { aeRole: "addiction" } },
        changes: [],
        statuses: ["poisoned"],
      },
      {
        _id: randomEffectId(),
        name: `Altered by ${name}`,
        flags: { [MODULE_ID]: { aeRole: "altered" } },
        changes: [{ key: "system.attributes.movement.walk", mode: 2, value: "10", priority: 20 }],
      },
      {
        _id: randomEffectId(),
        name: `${name} Withdrawal`,
        flags: { [MODULE_ID]: { aeRole: "withdrawal", vignetteColor: "#a02020" } },
        changes: [{ key: "flags.substances-and-paraphernalia.vignetteColor", mode: 5, value: "#a02020", priority: 20 }],
        statuses: [],
      },
      {
        _id: randomEffectId(),
        name: `${name} Tolerance`,
        flags: { [MODULE_ID]: { aeRole: "tolerance" } },
        changes: [],
      },
      {
        _id: randomEffectId(),
        name: `${name} Overdose`,
        flags: { [MODULE_ID]: { aeRole: "overdose" } },
        changes: [],
      },
    ],
  };

  // Cross-reference effect ids into the flag blocks.
  const eff = itemData.effects;
  itemData.flags[MODULE_ID].addiction.addictionEffectIds = [eff[0]._id];
  itemData.flags[MODULE_ID].withdrawal.effectIds = [eff[2]._id];
  itemData.flags[MODULE_ID].tolerance.effectIds = [eff[3]._id];
  itemData.flags[MODULE_ID].overdose.effectIds = [eff[4]._id];

  const [substance] = await actor.createEmbeddedDocuments("Item", [itemData]);
  return { actor, substance };
}

export async function teardownFixture(actor, _substance) {
  if (actor?.delete) await actor.delete();
}

function randomEffectId() {
  return foundry.utils.randomID();
}

/**
 * Stub the d20 chain for a given actor + ability so a Phase 1 / Phase 2 roll
 * deterministically passes or fails. Restores the original method on cleanup.
 */
export function stubRoll(actor, methodName, total) {
  const original = actor[methodName];
  actor[methodName] = async () => ({ total });
  return () => {
    actor[methodName] = original;
  };
}
