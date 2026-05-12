import { MODULE_ID } from "../config.js";
import {
  getActorWithdrawal,
  getAddiction,
  setActorWithdrawalEntry,
} from "../data/flag-schema.js";
import { defaultAbstainDc } from "../data/abstain.js";
import { SETTING_KEYS } from "../settings.js";
import { logger } from "../logger.js";
import { clearForcedUseBypass, registerForcedUseBypass } from "./activity-gating.js";

/**
 * Voluntary abstain — long-rest dialog hook.
 *
 * Composes with the existing GM-arbitrated rest tick by pre-decrementing the
 * actor's withdrawal entry by 1 on a successful abstain save. The standard
 * tick subtracts another 1 for a total of -2. On a failed save, no
 * pre-decrement is applied; the standard tick's -1 stands.
 */
export function registerLongRestAbstain() {
  Hooks.on("dnd5e.preRestCompleted", onPreRestCompleted);
}

async function onPreRestCompleted(actor, result, _config) {
  if (!result?.longRest) return;
  if (!actor) return;
  if (!isAbstainEnabled()) return;

  const map = getActorWithdrawal(actor);
  const ids = Object.keys(map);
  if (ids.length === 0) return;

  const rows = ids
    .map((id) => buildRow(actor, id, map[id]))
    .filter((row) => row !== null);
  if (rows.length === 0) return;

  let selectedId;
  try {
    selectedId = await promptCombinedAbstain(actor.name, rows);
  } catch (err) {
    logger.error("abstain prompt failed", err);
    return;
  }
  if (!selectedId) return;
  const row = rows.find((r) => r.substanceId === selectedId);
  if (!row) return;
  try {
    await processAbstainSave(actor, row);
  } catch (err) {
    logger.error(`abstain flow failed for substance ${selectedId}`, err);
  }
}

function buildRow(actor, substanceId, entry) {
  if (!entry) return null;
  const item = actor.items?.get?.(substanceId) ?? null;
  const wMod = Number(getAddiction(item)?.withdrawalMod) || 0;
  const dc = defaultAbstainDc(wMod);
  const itemName = item?.name ?? game.i18n.localize("FISHUT.Kind.Substance");
  return { substanceId, itemName, dc, entry };
}

async function processAbstainSave(actor, row) {
  const { substanceId, itemName, dc, entry } = row;
  const passed = await rollAbstainSave(actor, dc);
  if (passed === null) return;

  if (!passed) {
    await processAbstainFailure(actor, row);
    return;
  }

  await applyAbstainPreDecrement(actor, substanceId, entry);
  await chat(
    game.i18n.format("FISHUT.LongRestAbstain.Pass", {
      actor: actor.name,
      item: itemName,
      dc,
    }),
  );
}

/**
 * Failed-Wis-save handler for voluntary abstain.
 *
 * If the substance is in inventory with uses remaining, register a
 * forced-use bypass and call `activity.use()` so the substance flows
 * through its real post-use chain (save → addiction AE → tolerance
 * stack → overdose roll). Soft-fail when the substance is missing or
 * exhausted.
 *
 * @param {Actor} actor
 * @param {{substanceId: string, itemName?: string, withdrawalMod?: number, dc: number}} row
 */
export async function processAbstainFailure(actor, row) {
  const item = actor.items.get(row.substanceId);
  if (!item) {
    await chat(
      game.i18n.format("FISHUT.LongRestAbstain.FailNoSubstance", {
        actor: actor.name,
        item: row.itemName ?? game.i18n.localize("FISHUT.Kind.Substance"),
      }),
    );
    return;
  }

  const activities = item.system?.activities?.contents ?? [];
  const activity =
    activities.find((a) => a.type === "utility" || a.type === "save") ?? activities[0];
  if (!activity) {
    await chat(
      game.i18n.format("FISHUT.LongRestAbstain.FailNoSubstance", {
        actor: actor.name,
        item: item.name,
      }),
    );
    return;
  }

  const usesValue = item.system?.uses?.value;
  if (usesValue !== undefined && Number(usesValue) <= 0) {
    await chat(
      game.i18n.format("FISHUT.LongRestAbstain.FailNoSubstance", {
        actor: actor.name,
        item: item.name,
      }),
    );
    return;
  }

  registerForcedUseBypass(activity.id);

  await chat(
    game.i18n.format("FISHUT.LongRestAbstain.FailGiveIn", {
      actor: actor.name,
      item: item.name,
      dc: row.dc,
    }),
  );

  try {
    await activity.use({ event: null }, { fastForward: true, chatMessage: true });
  } catch (err) {
    clearForcedUseBypass(activity.id);
    throw err;
  }
}

/**
 * Pre-decrement the withdrawal entry by 1. Composed with the standard
 * GM-arbitrated rest tick (-1), this yields a total of -2 on successful
 * abstain. Test seam — exported for Quench.
 *
 * @param {Actor}  actor
 * @param {string} substanceId
 * @param {{restsRemaining:number,appliedAt?:string}} entry
 */
export async function applyAbstainPreDecrement(actor, substanceId, entry) {
  const currentRests = Math.max(0, Math.floor(Number(entry?.restsRemaining) || 0));
  const next = Math.max(0, currentRests - 1);
  await setActorWithdrawalEntry(actor, substanceId, {
    restsRemaining: next,
    appliedAt: entry?.appliedAt ?? new Date().toISOString(),
  });
  return { newRests: next };
}

function isAbstainEnabled() {
  try {
    return game.settings?.get?.(MODULE_ID, SETTING_KEYS.voluntaryAbstainEnabled) === true;
  } catch {
    return false;
  }
}

async function promptCombinedAbstain(actorName, rows) {
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2) {
    logger.warn("DialogV2 not available; skipping abstain prompt");
    return null;
  }
  const title = game.i18n.localize("FISHUT.LongRestAbstain.Title");
  const intro = game.i18n.format("FISHUT.LongRestAbstain.Intro", { actor: actorName });
  const content = `<p>${intro}</p>`;

  const buttons = rows.map((row) => ({
    action: `abstain-${row.substanceId}`,
    label: game.i18n.format("FISHUT.LongRestAbstain.ButtonResistUrge", {
      item: row.itemName,
    }),
    callback: () => row.substanceId,
  }));
  buttons.push({
    action: "skip",
    label: game.i18n.localize("FISHUT.LongRestAbstain.Skip"),
    callback: () => null,
    default: true,
  });

  try {
    const result = await DialogV2.wait({
      window: { title },
      content,
      buttons,
      rejectClose: false,
    });
    return typeof result === "string" ? result : null;
  } catch (err) {
    logger.error("abstain prompt failed", err);
    return null;
  }
}

async function rollAbstainSave(actor, dc) {
  const fn = actor.rollSavingThrow ?? actor.rollAbilitySave;
  if (typeof fn !== "function") {
    logger.warn("actor has no rollSavingThrow/rollAbilitySave; skipping abstain save");
    return null;
  }
  const config = {
    ability: "wis",
    target: dc,
    targetValue: dc,
    fastForward: false,
    chatMessage: true,
  };
  const roll = await fn.call(actor, config);
  const r = Array.isArray(roll) ? roll[0] : roll;
  if (!r) return null;
  return Number(r.total) >= dc;
}

async function chat(content) {
  return ChatMessage.create({ content, whisper: [] });
}
