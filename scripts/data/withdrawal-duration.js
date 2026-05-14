/**
 * Convert an authored withdrawal duration `{value, unit}` to seconds for
 * Foundry AE `duration.seconds`. Times-Up (bundled with DAE) handles expiry
 * cleanup; we just deposit the seconds count and listen for the deletion.
 *
 * Months use 30-day months. The conversion is approximate by design — the
 * fiction is "a few weeks of withdrawal" and exact wall-clock semantics don't
 * matter for the game.
 */

const SECONDS_PER = Object.freeze({
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800,
  months: 2592000,
});

export const WITHDRAWAL_DURATION_UNITS = Object.freeze([
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
]);

/**
 * @param {number} value
 * @param {"minutes"|"hours"|"days"|"weeks"|"months"} unit
 * @returns {number}  seconds; 0 when inputs are invalid.
 */
export function durationToSeconds(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const factor = SECONDS_PER[unit];
  if (!factor) return 0;
  return Math.trunc(n * factor);
}
