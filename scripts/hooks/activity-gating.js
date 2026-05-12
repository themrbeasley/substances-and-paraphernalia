import { MODULE_ID, labelKey } from "../config.js";
import { getAppliesTo, isParaphernalia, isSubstance } from "../data/flag-schema.js";
import { inspectParaphernaliaItem } from "../data/references.js";
import { actorSatisfiesAdmin } from "../data/admin-match.js";
import { isActive } from "../integrations/index.js";
import { itemDaeRequiringEffects } from "../integrations/dae.js";
import { logger } from "../logger.js";

// preUseActivity is synchronous, so the override flow cancels the current
// attempt and re-triggers activity.use() after the dialog resolves. The
// bypass set holds activity IDs whose next preUseActivity call should skip
// the gate exactly once.
const bypassOnce = new Set();

/**
 * Register an activity id so the next `preUseActivity` for that id
 * skips the paraphernalia gate. Used by `long-rest-abstain.js` to drive
 * a forced consumption when a Wis save fails, and by the gate's own
 * "Use anyway" dialog branch (already in-tree).
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
 * Used by external callers (e.g. `long-rest-abstain.js`) to roll back
 * the bypass if their `activity.use()` call throws before the next
 * `preUseActivity` consumes it — symmetric with `registerForcedUseBypass`.
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
}

function onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return true;
  if (!isSubstance(item)) return true;
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
    });
  }
  return owned;
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
