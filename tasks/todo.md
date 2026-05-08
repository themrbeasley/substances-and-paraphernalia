# v0.4 Sprint Todo

## Phase 1 — Foundation
- [ ] Task 1: Extend schema.json (tolerance kind, +N type, overdose flag shape, coupling.modes, paraphernalia.subtypes)
- [ ] Task 2: Item-flag accessors — getOverdose/setOverdose, getWithdrawalEffectId/setWithdrawalEffectId
- [ ] Task 3: Register world settings (addictionPoisonedCoupling, voluntaryAbstainEnabled, integration toggles, customParaphernaliaSubtypes + menu)
- [ ] Task 4: Paraphernalia Subtype Manager (FormApp V2 + composition helper + details-tab consumer update)
- [ ] Task 5: Pure helpers — tolerance.js, overdose.js, abstain.js
- [ ] Task 6: Extend modifier-resolution (+N tier) + modifier-pipeline (consumeToleranceForSubstance)
- [ ] CHECKPOINT A — Foundation review (user hand-tests)

## Phase 2 — Consumers
- [ ] Task 7: Wire +N into addiction save path
- [ ] Task 8: Wire overdose d100 trigger + marker AE in postUseActivity
- [ ] Task 9: Wire tolerance auto-stack into applyOutcome (save pass branch)
- [ ] Task 10: Wire withdrawal AE template selection at long-rest tick
- [ ] Task 11: Wire poisoned-coupling tri-state at AE-apply (reads setting)
- [ ] Task 12: Update validate-content.mjs for new shapes
- [ ] CHECKPOINT B — Consumers complete (user hand-tests)

## Phase 3 — Authoring surface
- [ ] Task 13: Withdrawal effect picker + content guidance hint
- [ ] Task 14: Overdose fieldset (enabled/chancePercent/description)
- [ ] Task 15: Bypass-section displays +N bonus
- [ ] Task 16: Simulate-dose 3-dot menu entry + dialog
- [ ] CHECKPOINT C — Authoring surface complete (user hand-tests)

## Phase 4 — Long-rest abstain + macros + drag dialog
- [ ] Task 17: Long-rest abstain dialog hook
- [ ] Task 18: Three Remove-X macros (Tolerance, Overdose, Withdrawal)
- [ ] Task 19: Replace v0.3 stubs in drag-to-inventory dialog
- [ ] CHECKPOINT D — Mechanics complete (user hand-tests)

## Phase 5 — Theme 1 wiki + content
- [ ] Matrix re-verification (Glob substances, tabulate cells)
- [ ] Task 20: Theme 1 — GM Guide wiki migration + CI link-check
- [ ] Task 21: Round-2 substances (count post-verify)
- [ ] Task 22: One +N-bypass paraphernalia for content coverage
- [ ] CHECKPOINT E — Sprint complete; tag v0.4.0
