import { MODULE_ID, SCHEMA } from "./config.js";
import { ParaphernaliaSubtypesApp } from "./ui/paraphernalia-subtypes-app.js";

export const SETTING_KEYS = Object.freeze({
  enforceParaphernalia: "enforceParaphernalia",
  strictDaeRequirement: "strictDaeRequirement",
  suppressIntegrationWarnings: "suppressIntegrationWarnings",
  debug: "debug",
  addictionPoisonedCoupling: "addictionPoisonedCoupling",
  voluntaryAbstainEnabled: "voluntaryAbstainEnabled",
  customParaphernaliaSubtypes: "customParaphernaliaSubtypes",
  daeIntegration: "daeIntegration",
  midiqolIntegration: "midiqolIntegration",
  timesUpIntegration: "timesUpIntegration",
  tmfxIntegration: "tmfxIntegration",
});

export const MENU_KEYS = Object.freeze({
  manageParaphernaliaSubtypes: "manageParaphernaliaSubtypes",
});

export const COUPLING_DEFAULT = "linked-cascade";

function couplingChoices() {
  const modes = SCHEMA.coupling?.modes ?? [];
  const out = {};
  for (const m of modes) out[m.id] = m.labelKey;
  return out;
}

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTING_KEYS.enforceParaphernalia, {
    name: "FISHUT.Settings.EnforceParaphernalia.Name",
    hint: "FISHUT.Settings.EnforceParaphernalia.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.strictDaeRequirement, {
    name: "FISHUT.Settings.StrictDaeRequirement.Name",
    hint: "FISHUT.Settings.StrictDaeRequirement.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.addictionPoisonedCoupling, {
    name: "FISHUT.Settings.AddictionPoisonedCoupling.Name",
    hint: "FISHUT.Settings.AddictionPoisonedCoupling.Hint",
    scope: "world",
    config: true,
    type: String,
    default: COUPLING_DEFAULT,
    choices: couplingChoices(),
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.voluntaryAbstainEnabled, {
    name: "FISHUT.Settings.VoluntaryAbstainEnabled.Name",
    hint: "FISHUT.Settings.VoluntaryAbstainEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.daeIntegration, {
    name: "FISHUT.Settings.DaeIntegration.Name",
    hint: "FISHUT.Settings.DaeIntegration.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.midiqolIntegration, {
    name: "FISHUT.Settings.MidiqolIntegration.Name",
    hint: "FISHUT.Settings.MidiqolIntegration.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.timesUpIntegration, {
    name: "FISHUT.Settings.TimesUpIntegration.Name",
    hint: "FISHUT.Settings.TimesUpIntegration.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.tmfxIntegration, {
    name: "FISHUT.Settings.TmfxIntegration.Name",
    hint: "FISHUT.Settings.TmfxIntegration.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.customParaphernaliaSubtypes, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.registerMenu(MODULE_ID, MENU_KEYS.manageParaphernaliaSubtypes, {
    name: "FISHUT.Settings.ManageParaphernaliaSubtypes.Name",
    label: "FISHUT.Settings.ManageParaphernaliaSubtypes.Label",
    hint: "FISHUT.Settings.ManageParaphernaliaSubtypes.Hint",
    icon: "fa-solid fa-prescription-bottle-medical",
    type: ParaphernaliaSubtypesApp,
    restricted: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.suppressIntegrationWarnings, {
    name: "FISHUT.Settings.SuppressIntegrationWarnings.Name",
    hint: "FISHUT.Settings.SuppressIntegrationWarnings.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.debug, {
    name: "FISHUT.Settings.Debug.Name",
    hint: "FISHUT.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });
}
