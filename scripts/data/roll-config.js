/**
 * Build a dnd5e 5.x d20 roll config for `rollSavingThrow` / `rollAbilityCheck`.
 *
 * dnd5e 5.x reads bonus parts and per-roll options from `rolls[0]` only; a
 * top-level `parts` is silently dropped. Midi-QoL recomputes advantage from its
 * own flags unless advantage is passed in, so it goes everywhere either one
 * reads it. Without a bypass, advantage stays unset so the actor's own sources
 * still apply.
 *
 * @param {string} ability
 * @param {number} dc
 * @param {{advantage?: boolean, bonus?: number}} [mods]
 * @returns {object}
 */
export function d20Config(ability, dc, { advantage = false, bonus = 0 } = {}) {
  const parts = Number.isFinite(bonus) && bonus !== 0 ? [String(bonus)] : [];
  const config = { ability, target: dc, rolls: [{ parts, options: {} }] };
  if (advantage) {
    config.advantage = true;
    config.rolls[0].options.advantage = true;
    config.midiOptions = { advantage: true };
  }
  return config;
}
