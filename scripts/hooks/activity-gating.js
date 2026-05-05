import { MODULE_ID } from "../config.js";
import { isSubstance, getRequiredParaphernalia } from "../data/flag-schema.js";
import { evaluateRequirements } from "../data/required-paraphernalia.js";
import { isActive } from "../integrations/index.js";
import { logger } from "../logger.js";

// preUseActivity is synchronous, so the override flow cancels the current
// attempt and re-triggers activity.use() after the dialog resolves. The
// bypass set holds activity IDs whose next preUseActivity call should skip
// the gate exactly once.
const bypassOnce = new Set();

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

  const groups = getRequiredParaphernalia(item);
  if (!Array.isArray(groups) || groups.length === 0) return true;

  const { ok, missing } = evaluateRequirements(actor, groups);
  if (!ok) {
    promptBlocked(activity, usageConfig, dialogConfig, messageConfig, missing).catch((err) =>
      logger.error("blocked prompt failed", err),
    );
    return false;
  }

  if (itemHasDaeRequiringEffect(item) && !isActive("dae")) {
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

function itemHasDaeRequiringEffect(item) {
  const effects = item?.effects;
  if (!effects) return false;
  for (const effect of effects) {
    if (effect.flags?.[MODULE_ID]?.requiresDae === true) return true;
  }
  return false;
}

async function promptBlocked(activity, usageConfig, dialogConfig, messageConfig, missing) {
  const item = activity.item;
  const body = game.i18n.format("FISHUT.Gating.Blocked.Body", {
    item: item.name,
    missing: formatMissingGroups(missing),
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

function formatMissingGroups(missing) {
  const sep = game.i18n.localize("FISHUT.Gating.Group.Separator");
  return missing.map(formatGroup).join(sep);
}

function formatGroup(group) {
  const refs = Array.isArray(group?.anyOf) ? group.anyOf : [];
  const joiner = game.i18n.localize("FISHUT.Gating.Group.Joiner");
  const candidates = refs.map(formatRef).join(joiner);
  const reason = formatReason(group?.reason);
  if (!reason) return candidates;
  return game.i18n.format("FISHUT.Gating.Group.Annotated", { candidates, reason });
}

function formatReason(reason) {
  if (reason === "unequipped") return game.i18n.localize("FISHUT.Gating.Reason.Unequipped");
  if (reason === "unattuned") return game.i18n.localize("FISHUT.Gating.Reason.Unattuned");
  return null;
}

function formatRef(ref) {
  if (typeof ref !== "string" || ref.length === 0) return String(ref);
  if (!ref.startsWith("Compendium.")) return ref;
  try {
    const doc = fromUuidSync(ref);
    return doc?.name ?? ref;
  } catch {
    return ref;
  }
}
