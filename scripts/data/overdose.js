/**
 * Overdose roll — pure d100 helper. Per `SPEC.md` lines 117-127, each
 * consumption rolls d100; on roll ≤ `chancePercent` the substance overdose
 * fires alongside (not in place of) the addiction save.
 *
 * `randomFn` is injectable so tests can drive the roll deterministically.
 * It must return a float in [0, 1) — same contract as `Math.random`.
 */

/**
 * @param {number} chancePercent  Integer 0–100. Outside that range is clamped.
 * @param {() => number} [randomFn]  Defaults to `Math.random`.
 * @returns {{ hit: boolean, roll: number, chancePercent: number }}
 */
export function rollOverdose(chancePercent, randomFn = Math.random) {
  const chance = clampPercent(chancePercent);
  if (chance <= 0) return { hit: false, roll: 0, chancePercent: chance };
  const r = Number(randomFn());
  // d100 in [1, 100], inclusive. floor(rand * 100) + 1.
  const roll = Math.max(1, Math.min(100, Math.floor((Number.isFinite(r) ? r : 0) * 100) + 1));
  return { hit: roll <= chance, roll, chancePercent: chance };
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.floor(n);
}
