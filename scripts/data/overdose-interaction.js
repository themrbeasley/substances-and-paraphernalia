/**
 * Modulate a base overdose d100 chance by the actor's current tolerance
 * stacks for the substance.
 *
 * `mitigate`: tolerance reduces overdose risk (the body has adapted).
 * `compound`: tolerance increases overdose risk (users chase the
 *   diminishing buff with higher doses).
 * `none`: no interaction; baseChance returned unchanged.
 *
 * Stacks are read at roll time, not apply time — see the v0.7 spec §2.4.
 *
 * @param {number} baseChance        - block.chancePercent (0..100)
 * @param {number} stacks            - current tolerance-stack count
 * @param {"none"|"mitigate"|"compound"} mode
 * @param {number} magnitude         - pct-pts per stack
 * @returns {number} adjusted chance, clamped to [0, 100]
 */
export function computeAdjustedOverdoseChance(baseChance, stacks, mode, magnitude) {
  const base = Number(baseChance);
  const s = Number(stacks);
  const m = Number(magnitude);
  if (!Number.isFinite(base)) return 0;
  if (!Number.isFinite(s) || !Number.isFinite(m)) return clamp(base);
  let sign;
  switch (mode) {
    case "mitigate":
      sign = -1;
      break;
    case "compound":
      sign = 1;
      break;
    default:
      return clamp(base);
  }
  return clamp(base + s * m * sign);
}

function clamp(n) {
  return Math.max(0, Math.min(100, n));
}
