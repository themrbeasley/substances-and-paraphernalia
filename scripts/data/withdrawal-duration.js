/**
 * Convert an authored withdrawal duration `{value, unit}` to seconds for the
 * applied AE's V14 `duration` (`value` + `units: "seconds"`). Foundry core
 * marks the AE expired when world time passes it; House Automation's
 * "Delete expired effects" switch then deletes it, which fires our cleanup.
 *
 * Months use 30-day months. The conversion is approximate by design: the
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

/**
 * Seconds of withdrawal (spec v0.10.0 D5): the authored length, halved when
 * the Constitution save passed. 0 means permanent and stays permanent.
 *
 * @param {{value: number, unit: string}|null} duration
 * @param {{halved?: boolean}} [opts]
 * @returns {number}
 */
export function withdrawalSeconds(duration, { halved = false } = {}) {
  const total = duration ? durationToSeconds(duration.value, duration.unit) : 0;
  if (total <= 0) return 0;
  return halved ? Math.max(1, Math.trunc(total / 2)) : total;
}

/**
 * How chat says a length: whole days, else hours; 0 is permanent.
 *
 * @param {number} seconds
 * @returns {{key: "day"|"days"|"hour"|"hours"|"permanent", n: number}}
 */
export function describeLength(seconds) {
  if (!(seconds > 0)) return { key: "permanent", n: 0 };
  if (seconds % 86400 === 0) {
    const n = seconds / 86400;
    return { key: n === 1 ? "day" : "days", n };
  }
  const n = Math.max(1, Math.round(seconds / 3600));
  return { key: n === 1 ? "hour" : "hours", n };
}
