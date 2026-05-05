import { MODULE_ID } from "./config.js";

export function registerSettings() {
  game.settings.register(MODULE_ID, "enforceParaphernalia", {
    name: "FISHUT.Settings.EnforceParaphernalia.Name",
    hint: "FISHUT.Settings.EnforceParaphernalia.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "strictDaeRequirement", {
    name: "FISHUT.Settings.StrictDaeRequirement.Name",
    hint: "FISHUT.Settings.StrictDaeRequirement.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "suppressIntegrationWarnings", {
    name: "FISHUT.Settings.SuppressIntegrationWarnings.Name",
    hint: "FISHUT.Settings.SuppressIntegrationWarnings.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "debug", {
    name: "FISHUT.Settings.Debug.Name",
    hint: "FISHUT.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });
}
