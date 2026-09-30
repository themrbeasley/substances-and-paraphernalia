// scripts/data/tolerance.js
/**
 * Pure tolerance helpers: Count + Points dual model.
 *
 * Count: integer 0..MaxCount, drives Altered AE attenuation.
 * Points: derived (Count × Rate), drives Overdose threshold gating.
 *
 * Kept dependency-free so Node `--test` can import this without Foundry globals.
 */

/**
 * Tolerance Points = Count × Rate.
 *
 * @param {number} count
 * @param {number} rate
 * @returns {number}
 */
export function currentPoints(count, rate) {
  const c = Number(count);
  const r = Number(rate);
  if (!Number.isFinite(c) || !Number.isFinite(r)) return 0;
  return c * r;
}

/**
 * Multiply a Change-row value by the attenuation scalar for `count`.
 * Counts past the curve's last index clamp to the trailing value.
 * Non-numeric values pass through unchanged.
 *
 * @param {*} value
 * @param {number} count
 * @param {number[]} curve
 * @returns {*}
 */
export function applyAttenuation(value, count, curve) {
  if (!Array.isArray(curve) || curve.length === 0) return value;
  if (typeof value !== "number") return value;
  const n = value;
  if (!Number.isFinite(n)) return value;
  const c = Math.max(0, Math.trunc(Number(count) || 0));
  const idx = Math.min(c, curve.length - 1);
  return n * Number(curve[idx]);
}

/**
 * Scale every numeric change-row value by the attenuation curve at `count`.
 * Only finite numbers and non-blank numeric strings count as numeric; they are
 * written back as strings. Everything else passes through unchanged: preset
 * names, and the booleans, nulls and arrays that V14's effect sheet saves as
 * native JSON (`Number(true)` is 1, which would flip a boolean override).
 *
 * @param {Array<{value:any}>|null|undefined} rows
 * @param {number} count
 * @param {number[]} curve
 * @returns {Array<object>} new rows; the input is not mutated
 */
export function attenuateChangeRows(rows, count, curve) {
  return (rows ?? []).map((row) => {
    const n = numericValue(row.value);
    if (n === null) return { ...row };
    return { ...row, value: String(applyAttenuation(n, count, curve)) };
  });
}

function numericValue(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * count -= decay, floored at 0.
 *
 * @param {number} count
 * @param {number} decay
 * @returns {number}
 */
export function decayCount(count, decay) {
  const c = Math.max(0, Math.trunc(Number(count) || 0));
  const d = Number(decay);
  if (!Number.isFinite(d)) return c;
  return Math.max(0, c - d);
}
