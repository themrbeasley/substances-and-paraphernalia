import { MODULE_ID } from "../config.js";
import { isSubstance } from "../data/flag-schema.js";
import { isActive } from "../integrations/index.js";
import { itemDaeRequiringEffects } from "../integrations/dae.js";

// TEMP: Phase 2 → Phase 4 transition; admin-type gate restored in Phase 4.
// While the per-substance `requiredSubtypes` callout is gone and the
// administration-type gate has not yet landed, no live world should break —
// substances simply consume freely. The DAE-strict guard remains intact.

export function registerActivityGating() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
}

function onPreUseActivity(activity) {
  const item = activity?.item;
  const actor = activity?.actor;
  if (!item || !actor) return true;
  if (!isSubstance(item)) return true;
  if (!game.settings.get(MODULE_ID, "enforceParaphernalia")) return true;

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
