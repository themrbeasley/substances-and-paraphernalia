import { MODULE_ID } from "../config.js";
import { isSubstance, getRequiredSubtypes } from "../data/flag-schema.js";
import { getEffectiveParaphernaliaSubtypes } from "../data/paraphernalia-subtypes.js";
import { evaluateSubtypeRequirements } from "../data/subtype-requirements.js";
import { isActive } from "../integrations/index.js";
import { itemDaeRequiringEffects } from "../integrations/dae.js";
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

  const subtypes = getRequiredSubtypes(item);
  if (!Array.isArray(subtypes) || subtypes.length === 0) return true;

  const { ok, missing } = evaluateSubtypeRequirements(actor, subtypes);
  if (!ok) {
    promptBlocked(activity, usageConfig, dialogConfig, messageConfig, missing).catch((err) =>
      logger.error("blocked prompt failed", err),
    );
    return false;
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

async function promptBlocked(activity, usageConfig, dialogConfig, messageConfig, missing) {
  const item = activity.item;
  const body = game.i18n.format("FISHUT.Gating.Blocked.Body", {
    item: item.name,
    missing: formatMissingSubtypes(missing),
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

function formatMissingSubtypes(missing) {
  const sep = game.i18n.localize("FISHUT.Gating.Group.Separator");
  return missing.map(formatMissingEntry).join(sep);
}

function formatMissingEntry({ subtype, reason }) {
  const candidates = subtypeLabel(subtype);
  const reasonText = formatReason(reason);
  if (!reasonText) return candidates;
  return game.i18n.format("FISHUT.Gating.Group.Annotated", { candidates, reason: reasonText });
}

function formatReason(reason) {
  if (reason === "unequipped") return game.i18n.localize("FISHUT.Gating.Reason.Unequipped");
  if (reason === "unattuned") return game.i18n.localize("FISHUT.Gating.Reason.Unattuned");
  return null;
}

function subtypeLabel(subtype) {
  const composed = getEffectiveParaphernaliaSubtypes();
  const entry = composed.find((e) => e.id === subtype);
  if (!entry) return subtype;
  if (entry.source === "builtin" && entry.labelKey) {
    return game.i18n.localize(entry.labelKey);
  }
  return entry.label ?? subtype;
}
