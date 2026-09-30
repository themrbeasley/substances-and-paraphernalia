# Compatibility findings

Each entry is the result of a manual verification against a specific
Foundry + dnd5e combination. Findings here drive what the module ships and
what mitigations it carries.

## Foundry V14 (build 368) + dnd5e 5.3.3 (2026-09-30)

Verified by reading the installed V14 and dnd5e source. The live test is still to come.

- **Unchanged:** dnd5e `preUseActivity` / `postUseActivity` / `preRestCompleted` / `restCompleted` signatures; `ItemSheet5e.MODES` (`PLAY: 1`, `EDIT: 2`); the Details tab markup (`section.tab[data-tab="details"]`); `_getHeaderControls`; core `dropActorSheetData`; DAE 14 `macro.tokenMagic`; the Token Magic FX 0.8.4 preset API; `#interface`.
- **Active Effect data moved:** `changes` → `system.changes`; numeric `mode` → string `type`; `duration.seconds` → `duration.value` + `duration.units`; a new `start` block that V14 keeps if the incoming data already has one. V14 converts old data on load, and shims the old accessors (with warnings) until V16.
- **Expiry:** V14 core expires timed effects on the active GM's client. The default `CONFIG.ActiveEffect.expiryAction = "update"` only marks them `duration.expired`; `"delete"` deletes them. Times Up (which deleted them on V13) has no V14 build. DAE 14's `expiryAction` setting covers only its special durations.
- **Change values can be native JSON:** V14's effect sheet saves change values as numbers, true/false and lists whenever an effect is saved, and the load-time converter does the same to old string values, so readers must accept both.
- **`value: 0` is expired:** `isTemporary` is `!!expiry || Number.isFinite(value)`, so a zero duration expires at once.
- **Deprecated in V14, removed later:** global `renderTemplate` / `loadTemplates` (V15), `Dialog` / `Application` (V16), `CONST.ACTIVE_EFFECT_MODES` and `change.mode` (V16). The v12-era globals (`mergeObject`, `duplicate`, `getProperty`, …) are gone.
- **dnd5e 5.3.3** added `FORMULA-INPUT` to `_disableFields`.

## Foundry V13 + dnd5e 5.2.5 (2026-05-05)

Verified by manually exercising the Activity → chat-card flow in a dev
world before P4 implementation.

### Hook signature

`dnd5e.preUseActivity` fires with four arguments:

```
(activity, usageConfig, dialogConfig, messageConfig)
```

- `activity` is the typed Activity subclass (e.g. `HealActivity`,
  `UtilityActivity`). Exposes `.item` and `.actor`. This is what we read
  flags from.
- `usageConfig`, `dialogConfig`, `messageConfig` are plain objects.

The hook is treated as cancellable: returning `false` stops the workflow
cleanly: no usage dialog, no chat card, no resource consumption. The hook
is synchronous; returning a Promise does not delay the workflow and is
treated as truthy (i.e. does not cancel).

### autoDestroy + Active Effect interaction

The senior-dev critique on the v1 plan asserted a known dnd5e bug where
Active Effects evaporate when the source consumable is destroyed. This
**does not reproduce** in 5.2.5. The mechanism in stock dnd5e is:

1. Activity used → chat card posted with an apply-effect button per effect.
2. If `system.uses.autoDestroy` is true and uses are exhausted, the source
   item is deleted at the end of the activity workflow.
3. The chat card carries the effect's data independently of the source
   item. Clicking the apply-effect button after the source has been
   deleted still applies the effect to the actor correctly.

Conclusion: shipped substances may use `autoDestroy: true` without any
mitigation in P4. We do not need to copy effects in `postUseActivity` or
defer destruction.

### Effect application is manual in stock dnd5e

Without Midi-QoL, Active Effects from an Activity do not auto-apply. The
chat card surfaces a small curved-arrow icon next to each effect; the user
clicks to apply. This is by design and acceptable for our gating use case,
because gating runs at `preUseActivity`, *before* the chat card is posted, so the
manual apply step only matters for the effect, not the gate.

### Documented limitation

`dnd5e.preUseActivity` only fires for the dnd5e Activity path. RP-style
direct inventory edits, custom macros that mutate items directly, or
right-click → "Use" outside the Activity flow bypass our gate. This is
acceptable for v0.1 and called out in the GM journal.
