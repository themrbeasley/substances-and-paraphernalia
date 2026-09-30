# Substances and Paraphernalia: follow-up todo (2026-09-30)

Pre-existing bugs found by the V14 live test (`reports/live-test-2026-09-30-v14.md`). None were caused by the v0.9.0 V14 port. Handle them as one follow-up piece of work: scope, spec and plan, fix, live retest.

## Decision needed first

- [ ] **What ends an addiction?** Today nothing does except the GM running Remove Addiction. The answer decides how item 1 is fixed: whether the actor's `withdrawal` map means "addicted to", "in withdrawal", or both, and what clears an entry.

## Bugs, most severe first

- [ ] **1. Withdrawal never starts in normal play.** Phase 1 (`scripts/hooks/addiction.js`, failed addiction save) never writes the actor's `withdrawal` flag map, and the Long Rest step (`runPhase2` in `scripts/hooks/long-rest-abstain.js`) only lists substances in that map. So no Abstain dialog ever appears after a real addiction. The same empty map breaks the "already addicted" check in `rollSaveAndApply`, so repeat doses stack addiction effects. (Report row 8)
- [ ] **2. Withdrawal map entries are never cleared.** `clearActorWithdrawalEntry` (`scripts/data/flag-schema.js`) and the Remove Withdrawal macro save the map through `setFlag`, which merges, so removed keys stay. Use a deletion update (`-=key` or `ForcedDeletion`). (Rows 9, 13)
- [ ] **3. +N and advantage bypasses do not change the roll.** `rollSave` in `scripts/hooks/addiction.js` passes `parts` and `advantage` at the top level of the dnd5e 5.x roll config, which does not read them there; the chat card still claims they applied. (Row 5)
- [ ] **4. Bypass uses are never spent, and gear `appliesTo` is not checked.** `resolveSourceItem` in `scripts/data/modifier-pipeline.js` only reads `effect.origin`, which is empty for item-transferred effects on V11+; the item is `effect.parent`. (Row 5)
- [ ] **5. Tolerance never weakens repeat doses.** `applyAlteredEffectGated` in `scripts/hooks/addiction.js` is not called anywhere. Decide where it belongs in the use flow (Midi and the chat card apply the Altered effect today). (Row 6)
- [ ] **6. Remove Addiction removes every module effect.** Its filter is `aeRole === "addiction" || sid || ...`, so Altered, Overdose and Withdrawal effects are listed and ticked by default. (Row 13)
- [ ] **7. Invalid document ids in compendium content.** Five macros have 18 to 19 character ids (`fhMacRemoveAddict01` and so on) and Tongue of the Oracle has 15 (`fhParaOracleT01`); Foundry ids must be 16. They load as null ids and show as duplicate ghost entries. Add an id-format check to `tools/validate-content-checks.mjs`. (Rows 1, 13)
- [ ] **8. Minor: Altered effects stack.** Effects applied by Midi or the chat card carry no `sourceSubstanceId`, so the tolerance path cannot replace them. (Row 6)

## Other notes from the test

- dnd5e 5.3.3 raises its own deprecation warnings (`senses.*`, `ChatMessage#applyRollMode`) whenever this module rolls a save; they are dnd5e's, not this module's.
- The live test's `CONFIG.compatibility` failure trap is too broad for this module (it catches dnd5e's internal deprecations); the plan's Task 8 should record direct callers instead.
