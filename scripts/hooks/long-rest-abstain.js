// scripts/hooks/long-rest-abstain.js
/**
 * Phase 2 — long rest dialog + Abstain Check + Withdrawal Save pipeline.
 *
 * Fires on `dnd5e.preRestCompleted` (GM-arbitrated). For each substance the
 * actor is currently addicted to, opens the combined Abstain dialog
 * (scripts/ui/abstain-dialog.js) and dispatches per-row:
 *
 *   - "use"             → force-use the substance via activity.use with
 *                         bypass set; goes through full Phase 1 chain.
 *   - "abstain"         → roll Wis Abstain Check; pass → decay; fail → Con
 *                         Withdrawal Save → fail → apply Withdrawal AE.
 *   - "forced-abstain"  → skip Wis; roll Con Withdrawal Save → fail → apply
 *                         Withdrawal AE; decay regardless.
 *
 * `actor.flags.S&P.withdrawal[id]` is set when the AE applies (with
 * `appliedAt` + `endsAt`). Times-Up handles removal at duration expiry;
 * `withdrawal-cleanup.js` clears the flag entry on AE delete.
 */

import { MODULE_ID } from "../config.js";
import { logger } from "../logger.js";
import {
  getAbstain,
  getWithdrawalDc,
  getWithdrawalDuration,
  getWithdrawalEnabled,
  getWithdrawalEffectIds,
  getActorWithdrawal,
  setActorWithdrawalEntry,
  getActorToleranceEntry,
} from "../data/flag-schema.js";
import { snapDcToTier, tierProfile } from "../data/tier-table.js";
import { durationToSeconds } from "../data/withdrawal-duration.js";
import { applyToleranceDecay } from "./tolerance-decay.js";
import { openAbstainDialog } from "../ui/abstain-dialog.js";
import { registerForcedUseBypass, clearForcedUseBypass } from "./activity-gating.js";

let dialogImpl = openAbstainDialog;

/**
 * Test seam — Quench tests call this to install a stub returning a
 * deterministic per-row decision map before invoking runPhase2.
 *
 * @param {(actor: Actor, rows: any[]) => Promise<Record<string, string>>} stub
 */
export function setAbstainDialogStub(stub) {
  dialogImpl = stub ?? openAbstainDialog;
}

export function registerLongRestAbstain() {
  Hooks.on("dnd5e.preRestCompleted", async (actor, restData) => {
    if (!restData?.longRest) return;
    if (!actor) return;
    if (game.users?.activeGM && game.users.activeGM !== game.user) return;
    await runPhase2(actor);
  });
}

export async function runPhase2(actor) {
  const map = getActorWithdrawal(actor) ?? {};
  const addictedIds = Object.keys(map);
  if (addictedIds.length === 0) return;

  // Build dialog rows for substances the actor is currently addicted to
  // (i.e. has an Addiction AE for). Each row needs Tolerance Count + doses
  // remaining in inventory.
  const rows = [];
  for (const substanceId of addictedIds) {
    const item = actor.items?.get?.(substanceId);
    if (!item) continue;
    const tolEntry = getActorToleranceEntry(actor, substanceId);
    const dc = getWithdrawalDc(item);
    const profile = Number.isFinite(dc) ? tierProfile(snapDcToTier(dc)) : null;
    rows.push({
      substanceId,
      name: item.name,
      count: Number(tolEntry?.count) || 0,
      maxCount: profile?.maxCount ?? 0,
      dosesRemaining: Number(item.system?.quantity) || 0,
    });
  }
  if (rows.length === 0) return;

  const decisions = await dialogImpl(actor, rows);

  for (const row of rows) {
    const action = decisions[row.substanceId] ?? "use";
    const item = actor.items.get(row.substanceId);
    if (!item) continue;
    try {
      if (action === "use") {
        await forceUseSubstance(actor, item);
      } else if (action === "abstain") {
        await runAbstainBranch(actor, item, { forced: false });
      } else if (action === "forced-abstain") {
        await runAbstainBranch(actor, item, { forced: true });
      }
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
    await activity.use({ event: null }, { fastForward: true, chatMessage: true });
  } catch (e) {
    // bypassOnce is normally consumed by the preUseActivity gate; if use()
    // rejects before the gate fires, clean up so the entry doesn't leak into
    // a later non-Phase-2 click of the same activity.
    clearForcedUseBypass(activity.id);
    throw e;
  }
}

export async function runAbstainBranch(actor, item, { forced }) {
  const abstain = getAbstain(item);
  let abstainPassed = false;
  if (!forced && abstain) {
    const roll = await rollAbstainCheck(actor, abstain.ability ?? "wis");
    abstainPassed = roll?.total >= Number(abstain.dc);
    await chat(
      game.i18n.format(
        abstainPassed ? "FISHUT.Phase2.AbstainCheck.Pass" : "FISHUT.Phase2.AbstainCheck.Fail",
        { actor: actor.name, item: item.name, total: roll?.total ?? "?", dc: abstain.dc },
      ),
    );
  } else if (forced) {
    await chat(
      game.i18n.format("FISHUT.Phase2.ForcedAbstain.Intro", {
        actor: actor.name,
        item: item.name,
        dc: getWithdrawalDc(item),
      }),
    );
  }

  if (!forced && abstainPassed) {
    // Pass Wis → decay, no Withdrawal Save.
    await applyToleranceDecay(actor, item);
    return;
  }

  // Forced abstain OR failed Wis → roll Con Withdrawal Save.
  if (!getWithdrawalEnabled(item)) {
    if (forced) await applyToleranceDecay(actor, item);
    return;
  }
  const withdrawalDc = getWithdrawalDc(item);
  const saveRoll = await rollWithdrawalSave(actor, withdrawalDc);
  const passed = saveRoll?.total >= Number(withdrawalDc);
  await chat(
    game.i18n.format(
      passed ? "FISHUT.Phase2.WithdrawalSave.Pass" : "FISHUT.Phase2.WithdrawalSave.Fail",
      { actor: actor.name, item: item.name, total: saveRoll?.total ?? "?", dc: withdrawalDc },
    ),
  );

  if (!passed) {
    await applyWithdrawalAeFromTemplate(actor, item);
  }

  if (forced) {
    await applyToleranceDecay(actor, item);
  }
}

async function rollAbstainCheck(actor, ability) {
  const bonus =
    Number(actor?.getFlag?.(MODULE_ID, "abstaining.check.bonus")) || 0;
  if (typeof actor.rollAbilityCheck === "function") {
    const config = { ability, chatMessage: true };
    if (bonus !== 0) config.parts = [String(bonus)];
    const roll = await actor.rollAbilityCheck(config);
    return Array.isArray(roll) ? roll[0] : roll;
  }
  return null;
}

async function rollWithdrawalSave(actor, dc) {
  const bonus =
    Number(actor?.getFlag?.(MODULE_ID, "withdrawal.save.bonus")) || 0;
  const fn = actor.rollSavingThrow ?? actor.rollAbilitySave;
  if (typeof fn !== "function") return null;
  const config = { ability: "con", targetValue: dc, chatMessage: true };
  if (bonus !== 0) config.parts = [String(bonus)];
  const roll = await fn.call(actor, config);
  return Array.isArray(roll) ? roll[0] : roll;
}

async function applyWithdrawalAeFromTemplate(actor, item) {
  const templates = findWithdrawalTemplates(item);
  if (templates.length === 0) {
    logger.warn(`no withdrawal AE template on ${item.name}; chat-only`);
    return;
  }
  const duration = getWithdrawalDuration(item);
  const seconds = duration ? durationToSeconds(duration.value, duration.unit) : 0;
  const now = new Date();
  const endsAt = new Date(now.getTime() + seconds * 1000).toISOString();

  const payloads = templates.map((tpl) => {
    const data = tpl.toObject();
    delete data._id;
    data.flags = data.flags ?? {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      sourceSubstanceId: item.id,
      aeRole: "withdrawal",
    };
    data.origin = item.uuid;
    data.disabled = false;
    data.duration = { ...(data.duration ?? {}), seconds };
    return data;
  });
  await actor.createEmbeddedDocuments("ActiveEffect", payloads);
  await setActorWithdrawalEntry(actor, item.id, {
    appliedAt: now.toISOString(),
    endsAt,
  });
}

function findWithdrawalTemplates(item) {
  const ids = getWithdrawalEffectIds(item);
  if (ids.length === 0) {
    // Fallback: any effect whose name contains "withdraw".
    return [...(item?.effects ?? [])].filter((e) => /withdraw/i.test(e.name ?? ""));
  }
  return ids.map((id) => item.effects?.get?.(id)).filter(Boolean);
}

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}
