/**
 * What happens when one of a substance's withdrawal effects is deleted
 * (spec v0.9.1 D3, D7, D8). Pure: withdrawal-cleanup.js acts on the answer.
 *
 * - "wait": another withdrawal effect of this substance is still on the actor.
 * - "clear": clear the withdrawal record only. A relapse keeps the addiction,
 *   or there is no addiction left to end.
 * - "recover": clear the record and end the addiction (finishing withdrawal
 *   is recovery).
 *
 * @param {object}  state
 * @param {number}  state.withdrawalsLeft  this substance's withdrawal effects still on the actor
 * @param {boolean} state.relapse          the delete came from a dose during withdrawal
 * @param {boolean} state.addicted         the actor still carries this substance's Addiction effect
 * @returns {"wait"|"clear"|"recover"}
 */
export function recoveryAction({ withdrawalsLeft, relapse, addicted }) {
  if (withdrawalsLeft > 0) return "wait";
  if (relapse || !addicted) return "clear";
  return "recover";
}
