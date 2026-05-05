// Optional integrations the module knows about. Each entry is a Foundry
// module id with a corresponding lang label key. The order here drives the
// order in the ready-time "missing modules" notification.
export const KNOWN_INTEGRATIONS = Object.freeze([
  { id: "dae", labelKey: "FISHUT.Integrations.Module.Dae" },
  { id: "midi-qol", labelKey: "FISHUT.Integrations.Module.MidiQol" },
  { id: "times-up", labelKey: "FISHUT.Integrations.Module.TimesUp" },
  { id: "tokenmagic", labelKey: "FISHUT.Integrations.Module.Tokenmagic" },
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
 * @returns {Array<{id: string, labelKey: string}>}
 */
export function listMissingIntegrations() {
  return KNOWN_INTEGRATIONS.filter((m) => !isActive(m.id));
}
