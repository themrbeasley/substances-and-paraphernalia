/** The 13 dnd5e 5.3 damage types; the runtime passes CONFIG.DND5E.damageTypes keys instead. */
export const DAMAGE_TYPES = Object.freeze([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

const FORMULA = /^(\d*d\d+(\s*[+-]\s*\d+)?|\d+)$/;

/**
 * An overdose's damage (spec D3), or null for none: a blank formula, a formula
 * that isn't plain dice ("2d6", "1d6 + 2", "5"), or an unknown type.
 *
 * @param {{ damage?: { formula?: string, type?: string } } | null | undefined} block
 * @param {readonly string[]} damageTypes  legal damage type ids
 * @returns {{ formula: string, type: string } | null}
 */
export function overdoseDamage(block, damageTypes) {
  const formula = String(block?.damage?.formula ?? "").trim();
  if (!formula || !FORMULA.test(formula)) return null;
  const type = block?.damage?.type;
  if (!damageTypes.includes(type)) return null;
  return { formula, type };
}
