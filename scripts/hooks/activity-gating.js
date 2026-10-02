import { MODULE_ID, labelKey } from "../config.js";
import { getAppliesTo, isParaphernalia, isSubstance } from "../data/flag-schema.js";
import { inspectParaphernaliaItem } from "../data/references.js";
import { actorSatisfiesAdmin, pickGearToSpend } from "../data/admin-match.js";
import { isActive } from "../integrations/index.js";
import { itemDaeRequiringEffects } from "../integrations/dae.js";
import { logger } from "../logger.js";
import { keepLastDose } from "../data/last-dose.js";
import { doseMarkerIds, dosesOthers, spendsDrug } from "../data/dose-marker.js";

// preUseActivity is synchronous, so the override flow cancels the current
// attempt and re-triggers activity.use() after the dialog resolves. The
// bypass set holds activity IDs whose next preUseActivity call should skip
// the gate exactly once.
const bypassOnce = new Set();

/**
 * Register an activity id so the next `preUseActivity` for that id
 * skips the paraphernalia gate. Used by `long-rest-abstain.js` to drive
 * the relapse dose when the Abstain check fails, and by the gate's own
 * "Use anyway" dialog branch.
 *
 * @param {string} activityId
 */
export function registerForcedUseBypass(activityId) {
  if (typeof activityId === "string" && activityId.length > 0) {
    bypassOnce.add(activityId);
  }
}

/**
 * Clear a previously-registered forced-use bypass for an activity id.
 * `long-rest-abstain.js` calls it in a `finally` after its `activity.use()`:
 * the gate consumes the bypass only when it reaches the paraphernalia check,
 * and a throw, the 0-dose block or `enforceParaphernalia` being off all stop
 * before that, which would leave the bypass for a later manual use.
 *
 * @param {string} activityId
 */
export function clearForcedUseBypass(activityId) {
  if (typeof activityId === "string" && activityId.length > 0) {
    bypassOnce.delete(activityId);
  }
}

export function registerActivityGating() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.activityConsumption", onActivityConsumption);
}

// dnd5e would delete the drug with its last dose; keep it at 0 so the Long
// Rest can still list it (spec D11).
function onActivityConsumption(activity, _usageConfig, _messageConfig, updates) {
  const item = activity?.item;
  if (!item || !isSubstance(item)) return;
  keepLastDose(updates, item.id);
}

function onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return true;
  if (!isSubstance(item)) return true;

  const markers = doseMarkerIds(item.effects);
  // An empty drug can't be spent (keepLastDose keeps it at 0), and there's no
  // "Use anyway". A cloud tick spends nothing, so it keeps working after the
  // last bomb (spec D9).
  if (spendsDrug(activity) && (Number(item.system?.quantity) || 0) < 1) {
    ui.notifications.warn(game.i18n.format("FISHUT.Gating.NoDoses", { item: item.name }));
    return false;
  }
  // Gear is for taking a drug yourself; dosing someone else needs none.
  if (dosesOthers(activity, markers)) return true;

  if (!game.settings.get(MODULE_ID, "enforceParaphernalia")) return true;

  if (bypassOnce.has(activity.id)) {
    bypassOnce.delete(activity.id);
    return true;
  }

  const admin = item?.system?.type?.subtype;
  if (typeof admin === "string" && admin.length > 0) {
    const owned = buildOwnedParaphernalia(actor);
    if (!actorSatisfiesAdmin(owned, admin)) {
      promptBlocked(activity, usageConfig, dialogConfig, messageConfig, admin).catch((err) =>
        logger.error("blocked prompt failed", err),
      );
      return false;
    }
  }

  if (itemDaeRequiringEffects(item).length > 0 && !isActive("dae")) {
    if (game.settings.get(MODULE_ID, "strictDaeRequirement")) {
      ui.notifications.warn(
        game.i18n.format("FISHUT.Integrations.RequiresDae.Block", { item: item.name }),
      );
      return false;
    }
    ui.notifications.warn(
      game.i18n.format("FISHUT.Integrations.RequiresDae.Warn", { item: item.name }),
    );
  }

  return true;
}

function buildOwnedParaphernalia(actor) {
  const items = actor?.items;
  if (!items) return [];
  const owned = [];
  for (const item of items) {
    if (!isParaphernalia(item)) continue;
    owned.push({
      id: item.id,
      appliesTo: getAppliesTo(item),
      usable: inspectParaphernaliaItem(item).ready,
      consumable: item.type === "consumable",
    });
  }
  return owned;
}

/**
 * After a dose the user takes, use up one piece of single-use gear (spec D8):
 * nothing when ready reusable gear covers the administration, else one use (or
 * one item) of the ready consumable with the lowest id. "Use anyway" finds
 * nothing ready, so nothing is spent.
 *
 * @param {Actor} actor
 * @param {Item}  item  the drug that was dosed
 * @returns {Promise<void>}
 */
export async function spendConsumableGear(actor, item) {
  if (!game.settings.get(MODULE_ID, "enforceParaphernalia")) return;
  const id = pickGearToSpend(buildOwnedParaphernalia(actor), item?.system?.type?.subtype);
  const gear = id ? actor.items.get(id) : null;
  if (!gear) return;
  const max = Number(gear.system?.uses?.max) || 0;
  if (max > 0) {
    await gear.update({ "system.uses.spent": (Number(gear.system.uses.spent) || 0) + 1 });
  } else {
    await gear.update({ "system.quantity": Math.max(0, (Number(gear.system.quantity) || 0) - 1) });
  }
}

async function promptBlocked(activity, usageConfig, dialogConfig, messageConfig, admin) {
  const item = activity.item;
  const adminLabel = adminLabelFor(admin);
  const body = game.i18n.format("FISHUT.Gating.Blocked.Body", {
    item: item.name,
    admin: adminLabel,
  });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("FISHUT.Gating.Blocked.Title") },
    content: body,
    buttons: [
      {
        action: "override",
        label: game.i18n.localize("FISHUT.Gating.Blocked.Override"),
        default: false,
      },
      {
        action: "cancel",
        label: game.i18n.localize("FISHUT.Gating.Blocked.Cancel"),
        default: true,
      },
    ],
    rejectClose: false,
    modal: true,
  });

  if (result !== "override") return;

  bypassOnce.add(activity.id);
  try {
    await activity.use(usageConfig, dialogConfig, messageConfig);
  } catch (err) {
    bypassOnce.delete(activity.id);
    throw err;
  }
}

function adminLabelFor(admin) {
  const key = labelKey("administrations", admin);
  if (!key) return admin;
  return game.i18n.localize(key).toLowerCase();
}
