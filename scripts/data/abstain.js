/**
 * Voluntary abstain — pure helpers for the long-rest "tough it out" save.
 *
 * Per `SPEC.md` line 154:
 *   DC = 8 + withdrawalMod, Wis save.
 *   Pass: restsRemaining -= 2 (clamped at 0; AE removed when newRests === 0).
 *   Fail: normal 1-rest progress, no extra penalty.
 */

/**
 * @param {number} withdrawalMod
 * @returns {number}  Default abstain DC; minimum 8.
 */
export function defaultAbstainDc(withdrawalMod) {
  const mod = Number(withdrawalMod);
  if (!Number.isFinite(mod)) return 8;
  return 8 + Math.floor(mod);
}

/**
 * @param {boolean} passed
 * @param {number} currentRests
 * @returns {{ newRests: number, removed: boolean }}
 */
export function applyAbstainOutcome(passed, currentRests) {
  const current = Math.max(0, Math.floor(Number(currentRests) || 0));
  const decrement = passed ? 2 : 1;
  const newRests = Math.max(0, current - decrement);
  return { newRests, removed: newRests === 0 };
}
