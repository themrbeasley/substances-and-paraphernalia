import { MODULE_ID, SCHEMA } from "./config.js";
import { logger } from "./logger.js";
import { registerSettings } from "./settings.js";
import { registerMigrationSettings, runMigrations } from "./migrations.js";
import * as flagSchema from "./data/flag-schema.js";
import { actorHasParaphernalia, inspectParaphernalia } from "./data/references.js";
import { evaluateRequirements, evaluateSubstance } from "./data/required-paraphernalia.js";
import { registerActivityGating } from "./hooks/activity-gating.js";
import { isActive, listMissingIntegrations } from "./integrations/index.js";

Hooks.once("init", () => {
  registerMigrationSettings();
  registerSettings();
  registerActivityGating();
  logger.log("init complete");
});

Hooks.once("ready", async () => {
  await runMigrations();
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      schema: SCHEMA,
      flagSchema,
      references: { actorHasParaphernalia, inspectParaphernalia },
      requirements: { evaluateRequirements, evaluateSubstance },
      integrations: { isActive, listMissingIntegrations },
    };
  }
  notifyMissingIntegrations();
  logger.log("ready complete");
});

function notifyMissingIntegrations() {
  if (game.settings.get(MODULE_ID, "suppressIntegrationWarnings")) return;
  const missing = listMissingIntegrations();
  if (missing.length === 0) return;
  const labels = missing.map((m) => game.i18n.localize(m.labelKey));
  const sep = game.i18n.localize("FISHUT.Gating.Group.Separator");
  ui.notifications.info(
    game.i18n.format("FISHUT.Integrations.Missing.Notice", { missing: labels.join(sep) }),
  );
}
