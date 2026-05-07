import { MODULE_ID, SCHEMA } from "./config.js";
import { logger } from "./logger.js";
import { registerSettings } from "./settings.js";
import { registerMigrationSettings, runMigrations } from "./migrations.js";
import * as flagSchema from "./data/flag-schema.js";
import { actorHasSubtype, inspectSubtypeOnActor } from "./data/references.js";
import {
  evaluateSubtypeRequirements,
  evaluateSubstance,
} from "./data/subtype-requirements.js";
import { registerActivityGating } from "./hooks/activity-gating.js";
import { registerAddictionHooks, rollSaveAndApply, applyOutcome } from "./hooks/addiction.js";
import { registerDragToInventory } from "./hooks/drag-to-inventory.js";
import { consumeBypassIfAvailable } from "./data/modifier-pipeline.js";
import { isActive, listMissingIntegrations } from "./integrations/index.js";
import { registerDetailsTab } from "./ui/details-tab.js";

Hooks.once("init", () => {
  registerMigrationSettings();
  registerSettings();
  registerActivityGating();
  registerAddictionHooks();
  registerDragToInventory();
  registerDetailsTab();
  registerQuenchSuiteIfActive();
  logger.log("init complete");
});

function registerQuenchSuiteIfActive() {
  if (!game.modules.get("quench")?.active) return;
  import("../test/quench/test-suite.mjs")
    .then(({ registerQuenchSuite }) => registerQuenchSuite())
    .catch((err) => logger.error("Quench suite load failed", err));
}

Hooks.once("ready", async () => {
  await runMigrations();
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      schema: SCHEMA,
      flagSchema,
      references: { actorHasSubtype, inspectSubtypeOnActor },
      requirements: { evaluateSubtypeRequirements, evaluateSubstance },
      addiction: { rollSaveAndApply, applyOutcome },
      saveBypass: { consumeBypassIfAvailable },
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
