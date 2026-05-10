import { MODULE_ID } from "../config.js";

// Integrations the module knows about. Each entry is a Foundry module id
// with a corresponding lang label key and the world-setting key that toggles
// whether this module wires into it. The order here drives the order in the
// ready-time "missing modules" notification.
//
// dae and midi-qol are declared as `relationships.requires` in module.json —
// Foundry refuses to activate without them, so they can never be "missing"
// and have no setting toggle. tokenmagic is also `requires` (the Altered AE
// visuals need it), but its `tmfxIntegration` toggle is kept so a GM can
// disable our preset registration while leaving TMFX otherwise active.
export const KNOWN_INTEGRATIONS = Object.freeze([
  {
    id: "times-up",
    labelKey: "FISHUT.Integrations.Module.TimesUp",
    settingKey: "timesUpIntegration",
  },
  {
    id: "tokenmagic",
    labelKey: "FISHUT.Integrations.Module.Tokenmagic",
    settingKey: "tmfxIntegration",
  },
]);

/**
 * Whether a module is installed and active in the current world.
 * @param {string} id
 * @returns {boolean}
 */
export function isActive(id) {
  return game.modules.get(id)?.active === true;
}

/**
 * Returns the subset of KNOWN_INTEGRATIONS that are not currently active.
 * @returns {Array<{id: string, labelKey: string, settingKey: string}>}
 */
export function listMissingIntegrations() {
  return KNOWN_INTEGRATIONS.filter((m) => !isActive(m.id));
}

/**
 * Pure boolean AND of "user has the integration enabled" and "module is
 * active in this world." Lives separately from the Foundry-coupled wrapper
 * so the resolution rule is unit-testable without `game` globals.
 * @param {boolean} enabled — user's per-integration setting value
 * @param {boolean} moduleActive — whether the Foundry module is installed + active
 * @returns {boolean}
 */
export function resolveIntegrationState(enabled, moduleActive) {
  return Boolean(enabled) && Boolean(moduleActive);
}

/**
 * Reads only the user-setting boolean for a known integration. Useful for
 * the orthogonal "user wants this integration but the module isn't installed"
 * pathway where `isIntegrationEnabled` would short-circuit. Returns true on
 * unknown ids and on init-phase races so the absence of an explicit opt-out
 * is treated as the default-on state.
 * @param {string} id
 * @returns {boolean}
 */
export function isIntegrationSettingEnabled(id) {
  const entry = KNOWN_INTEGRATIONS.find((m) => m.id === id);
  if (!entry) return true;
  try {
    return Boolean(game.settings.get(MODULE_ID, entry.settingKey));
  } catch {
    return true;
  }
}

/**
 * Whether a known integration is both user-enabled and module-active.
 * Unknown ids return false so callers can blindly gate on this.
 * @param {string} id
 * @returns {boolean}
 */
export function isIntegrationEnabled(id) {
  return resolveIntegrationState(isIntegrationSettingEnabled(id), isActive(id));
}
