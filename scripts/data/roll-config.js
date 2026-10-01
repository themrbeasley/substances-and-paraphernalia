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

/**
 * Roll a dnd5e 5.x save or check without letting a closed roll window skip it
 * (spec v0.9.2 D1). dnd5e resolves a closed window to an empty array; the roll
 * then happens again with no window, same config. Each attempt gets its own
 * copy, because dnd5e edits the config it is given.
 *
 * @param {(config: object, dialog?: object) => Promise<unknown>} roll
 * @param {object} config  from d20Config
 * @returns {Promise<object|null>} the first Roll, or null
 */
export async function rollWithoutSkipping(roll, config) {
  const first = firstRoll(await roll(structuredClone(config)));
  if (first) return first;
  return firstRoll(await roll(structuredClone(config), { configure: false }));
}

function firstRoll(result) {
  return (Array.isArray(result) ? result[0] : result) ?? null;
}
