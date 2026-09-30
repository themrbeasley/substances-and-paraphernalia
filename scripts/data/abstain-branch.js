/**
 * What an abstaining character faces at a Long Rest (spec D4 to D6). Pure: the
 * caller rolls the Wisdom check and acts on the answer.
 *
 * - "relapse": the craving wins; take a dose.
 * - "hold": already in withdrawal; stay the course.
 * - "withdrawal-save": roll the Constitution Withdrawal Save.
 *
 * @param {object}  state
 * @param {boolean} state.forced            No doses left: the Wisdom check is skipped.
 * @param {boolean} state.inWithdrawal
 * @param {boolean} [state.willpowerPassed] Undefined when no check was authored.
 * @returns {"relapse"|"hold"|"withdrawal-save"}
 */
export function abstainBranch({ forced, inWithdrawal, willpowerPassed }) {
  if (!forced && willpowerPassed === false) return "relapse";
  return inWithdrawal ? "hold" : "withdrawal-save";
}
