// scripts/hooks/long-rest-abstain.js
/**
 * Phase 2: the Long Rest withdrawal choices.
 *
 * Fires on `dnd5e.preRestCompleted`, on the client that performs the rest. For
 * each substance the actor is addicted to (it carries the substance's
 * Addiction effect), opens
 * the combined Abstain dialog (scripts/ui/abstain-dialog.js) and dispatches
 * per row:
 *
 *   - "use"            → take a dose: activity.use with the gear gate
 *                        bypassed, running the dose pipeline (addiction.js).
 *   - "abstain"        → Wisdom Abstain Check, then `abstainBranch`.
 *   - "forced-abstain" → no doses left: no Wisdom check, then `abstainBranch`.
 *
 * `abstainBranch` (scripts/data/abstain-branch.js) picks relapse (take a
 * dose), hold (already in withdrawal; stay the course) or the Constitution
 * Withdrawal Save, whose failure starts withdrawal. Finishing withdrawal ends
 * the addiction; see withdrawal-cleanup.js.
 */

import { MODULE_ID } from "../config.js";
import { logger } from "../logger.js";
import {
  getAbstain,
  getWithdrawalDc,
  getWithdrawalEnabled,
  getAddictedSubstanceIds,
  getAeRole,
  getActorTolerance,
  getActorToleranceEntry,
} from "../data/flag-schema.js";
import { snapDcToTier, tierProfile } from "../data/tier-table.js";
import { abstainBranch } from "../data/abstain-branch.js";
import { d20Config, rollWithoutSkipping } from "../data/roll-config.js";
import { applyToleranceDecay } from "./tolerance-decay.js";
import { applyWithdrawalEffect } from "./addiction.js";
import { openAbstainDialog } from "../ui/abstain-dialog.js";
import { registerForcedUseBypass, clearForcedUseBypass } from "./activity-gating.js";

let dialogImpl = openAbstainDialog;

/**
 * Test seam: install a stub returning a per-row decision map before calling
 * runPhase2.
 *
 * @param {(actor: Actor, rows: any[]) => Promise<Record<string, string>>} stub
 */
export function setAbstainDialogStub(stub) {
  dialogImpl = stub ?? openAbstainDialog;
}

export function registerLongRestAbstain() {
  // dnd5e calls preRestCompleted only on the client that performs the rest (a
  // local Hooks.call): the player's for their own rest or an accepted group
  // rest request, the GM's for a GM-run rest. That client owns the actor and
  // runs the choices; a GM-only check here meant player rests never did.
  Hooks.on("dnd5e.preRestCompleted", async (actor, restData) => {
    if (!restData?.longRest) return;
    if (!actor) return;
    await runPhase2(actor);
  });
}

export async function runPhase2(actor) {
  const addicted = getAddictedSubstanceIds(actor);
  // Tolerance fades with rest (v6 design): substances the character isn't
  // addicted to decay here; addicted ones follow the abstain rules below.
  for (const substanceId of Object.keys(getActorTolerance(actor))) {
    if (addicted.includes(substanceId)) continue;
    const item = actor.items?.get?.(substanceId);
    if (item) await applyToleranceDecay(actor, item);
  }

  const rows = [];
  for (const substanceId of addicted) {
    const item = actor.items?.get?.(substanceId);
    if (!item) {
      logger.warn(`Phase 2: ${actor.name} is addicted to item ${substanceId}, which is gone; skipping`);
      continue;
    }
    const dc = getWithdrawalDc(item);
    const profile = Number.isFinite(dc) ? tierProfile(snapDcToTier(dc)) : null;
    rows.push({
      substanceId,
      name: item.name,
      count: Number(getActorToleranceEntry(actor, substanceId)?.count) || 0,
      maxCount: profile?.maxCount ?? 0,
      dosesRemaining: Number(item.system?.quantity) || 0,
      inWithdrawal: inWithdrawalFrom(actor, substanceId),
    });
  }
  if (rows.length === 0) return;

  const decisions = await dialogImpl(actor, rows);

  for (const row of rows) {
    const action = decisions[row.substanceId] ?? "use";
    const item = actor.items.get(row.substanceId);
    if (!item) continue;
    // The rest can advance game time while the window is open, ending a
    // withdrawal and the addiction with it; act on the state as it is now.
    if (!getAddictedSubstanceIds(actor).includes(row.substanceId)) continue;
    const inWithdrawal = inWithdrawalFrom(actor, row.substanceId);
    try {
      if (action === "use") await forceUseSubstance(actor, item);
      else await runAbstainBranch(actor, item, { forced: action === "forced-abstain", inWithdrawal });
    } catch (e) {
      logger.warn(`Phase 2 dispatch failed for ${item.name}: ${e?.message}`, e);
    }
  }
}

export async function forceUseSubstance(actor, item) {
  const activity = item.system?.activities?.contents?.[0] ?? null;
  if (!activity) {
    logger.warn(`forceUseSubstance: no activity on ${item.name}`);
    return;
  }
  registerForcedUseBypass(activity.id);
  try {
    // dnd5e 5.x: dialog.configure false skips the usage window.
    await activity.use({}, { configure: false });
  } finally {
    // The gate normally consumes the bypass; if use() stopped before or inside
    // the gate without consuming it, don't let it leak into a later use.
    clearForcedUseBypass(activity.id);
  }
}

export async function runAbstainBranch(actor, item, { forced, inWithdrawal = false }) {
  let willpowerPassed;
  const abstain = getAbstain(item);
  if (!forced && abstain) {
    const dc = Number(abstain.dc);
    const roll = await rollAbstainCheck(actor, abstain.ability ?? "wis", dc);
    if (!roll) return; // no roll function: nothing happens this rest
    willpowerPassed = roll.total >= dc;
    await chat(
      game.i18n.format(
        willpowerPassed ? "FISHUT.Phase2.AbstainCheck.Pass" : "FISHUT.Phase2.AbstainCheck.Fail",
        { actor: actor.name, item: item.name, total: roll.total, dc: abstain.dc },
      ),
    );
  }

  const next = abstainBranch({ forced, inWithdrawal, willpowerPassed });
  if (next === "relapse") {
    await forceUseSubstance(actor, item);
    return;
  }

  // Not using tonight: the craving loses ground whatever comes next.
  await applyToleranceDecay(actor, item);
  if (next === "hold") {
    await chat(game.i18n.format("FISHUT.Phase2.Hold", { actor: actor.name, item: item.name }));
    return;
  }

  if (!getWithdrawalEnabled(item)) return;
  const withdrawalDc = getWithdrawalDc(item);
  if (forced) {
    await chat(
      game.i18n.format("FISHUT.Phase2.ForcedAbstain.Intro", {
        actor: actor.name,
        item: item.name,
        dc: withdrawalDc,
      }),
    );
  }
  const saveRoll = await rollWithdrawalSave(actor, withdrawalDc);
  if (!saveRoll) return; // no roll function
  const passed = saveRoll.total >= Number(withdrawalDc);
  await chat(
    game.i18n.format(
      passed ? "FISHUT.Phase2.WithdrawalSave.Pass" : "FISHUT.Phase2.WithdrawalSave.Fail",
      { actor: actor.name, item: item.name, total: saveRoll.total, dc: withdrawalDc },
    ),
  );
  if (!passed) await applyWithdrawalEffect(actor, item);
}

// A closed roll window rolls anyway (rollWithoutSkipping), so closing it
// can't skip the Wisdom check or the Withdrawal Save.
async function rollAbstainCheck(actor, ability, dc) {
  if (typeof actor.rollAbilityCheck !== "function") {
    logger.warn("actor has no rollAbilityCheck; skipping the Abstain check");
    return null;
  }
  const bonus = Number(actor.getFlag?.(MODULE_ID, "abstaining.check.bonus")) || 0;
  return rollWithoutSkipping(
    (config, dialog) => actor.rollAbilityCheck(config, dialog),
    d20Config(ability, dc, { bonus }),
  );
}

async function rollWithdrawalSave(actor, dc) {
  if (typeof actor.rollSavingThrow !== "function") {
    logger.warn("actor has no rollSavingThrow; skipping the Withdrawal Save");
    return null;
  }
  const bonus = Number(actor.getFlag?.(MODULE_ID, "withdrawal.save.bonus")) || 0;
  return rollWithoutSkipping(
    (config, dialog) => actor.rollSavingThrow(config, dialog),
    d20Config("con", dc, { bonus }),
  );
}

// Effects, not the record: relapse and recovery both key off the withdrawal
// effects, so a stale record can't pin a row at "hold".
function inWithdrawalFrom(actor, substanceId) {
  return actor.effects.some(
    (e) => getAeRole(e) === "withdrawal" && e.flags?.[MODULE_ID]?.sourceSubstanceId === substanceId,
  );
}

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}
