# v0.4 Sprint Plan — Mechanics + Wiki + Authoring polish

## Context

`SPEC.md` defines v0.4 as the **mechanics-depth + wiki + authoring** release that turns the v0.3 foundation into a richer addiction loop. v0.3 just shipped (tagged `v0.3.0`): native Details-tab authoring, AE-driven modifier pipeline (`auto-pass`/`advantage`), drag-to-inventory dialog, full 3×3 setting × category content matrix round 1.

v0.4 ships per `SPEC.md` line 28: tolerance system (auto-tracked stacks), overdose system (d100 chance per use), withdrawal-bite (AE template picker + content guidance), voluntary abstain (long-rest dialog option), poisoned-coupling tri-state setting, Theme 1 (GM Guide → wiki), simulate-dose authoring tool, macro parity (three Remove-X macros), `+N` bypass type, Theme 6 round 2.

**v0.4 user adds (this sprint scope, not in SPEC.md):** a Paraphernalia Subtype Manager — a settings sub-menu the GM uses to add / edit / remove paraphernalia subtypes that authors then pick from in the Details tab.

Module remains pre-1.0 with no shipped users; clean breaks preferred over migration shims.

## Architecture decisions

### Tolerance: auto-tracked stacks, sum-composed per SPEC.md

- `scripts/data/schema.json` `modifier.kinds` extends `["bypass"]` → `["bypass", "tolerance"]`.
- Tolerance AE flag shape per `SPEC.md` lines 90-98:
  ```
  flags["substances-and-paraphernalia"].modifier = {
    kind: "tolerance",
    substanceId: <itemId>,
    attenuateAltered?: { durationFactor, modifierFactor, dropAdvantage },
    addictionDcBump?: number,
    withdrawalAmplify?: { durationFactor, modifierFactor, addDisadvantage }
  }
  ```
- **Auto-application** (`SPEC.md` line 86): each successful addiction save → tolerance AE applied OR an existing AE's `flags.stacks` counter incremented. Lives in `addiction.js applyOutcome` on the pass branch.
- Composition: `SPEC.md` says *"sums stack effect."* Plain read: stack count multiplies the per-stack delta (e.g. `addictionDcBump: 1` × 3 stacks = +3 DC). For factor fields (`durationFactor`, `modifierFactor`), the per-stack semantic is genuinely ambiguous — flagged as **open execution-time question** (see Risks).
- Lives in `scripts/data/tolerance.js` (per `SPEC.md` line 249) as a pure helper, unit-testable without Foundry globals.
- Stack representation: single AE per (actor, substance) with an integer `flags.stacks` counter. Cleaner UI than N duplicate AEs; matches dnd5e 5.2.5 status-counter convention. Verify at execution.

### Overdose: d100 chance per consumption, marker AE on hit

- Item flag shape per `SPEC.md` lines 117-126:
  ```
  flags["substances-and-paraphernalia"].overdose = {
    enabled: true,
    chancePercent: 5,
    description: "..."
  }
  ```
- `scripts/hooks/overdose.js` (per `SPEC.md` line 248) registers in `postUseActivity` alongside addiction. Each successful consumption rolls d100; on hit (≤ `chancePercent`), applies marker AE `Overdosed on {Substance}` and posts a chat card with the description.
- Overdose runs **alongside** the addiction save, not pre-empting it. Both can fire in one consumption.
- AE name must contain `overdose` (extends naming contract per `SPEC.md` line 272).

### Withdrawal-bite: AE template picker, application stays on long-rest tick

- `flag-schema.js` adds `getWithdrawalEffectId(item) / setWithdrawalEffectId(item)` — item-level pointer to a withdrawal AE template on the same item.
- v0.3 long-rest tick already applies a default withdrawal AE; v0.4 makes it pick from the authored template per `SPEC.md` line 148. Application path itself doesn't move.
- AE name must contain `withdraw` (per `SPEC.md` line 273).
- Details-tab adds a hint string under the picker per `SPEC.md` line 142: *"Don't duplicate poisoned (disadv on attacks/checks). Escalate: exhaustion, disadv on saves, speed reduction, stat penalty."*

### Voluntary abstain: long-rest dialog option, gated by setting

- `scripts/hooks/long-rest-abstain.js` (per `SPEC.md` line 247) hooks the long-rest dialog. When the actor has any active withdrawal AE and `voluntaryAbstainEnabled === true`, the dialog gains an "Abstain this rest" button per substance.
- DC = `8 + withdrawalMod`. Wis save. Pass: `restsRemaining -= 2` (clamped at 0; AE removed if 0). Fail: normal 1-rest progress, **no penalty** (per `SPEC.md` line 154).
- Pure helper `scripts/data/abstain.js` exports `defaultAbstainDc(withdrawalMod)` and `applyAbstainOutcome(passed, currentRests)`. Unit-tested.

### Poisoned-coupling: world setting, three modes, read at AE-apply

- World setting `addictionPoisonedCoupling` per `SPEC.md` lines 168-178. Choices: `linked-cascade` (default — current v0.3 behavior), `linked-isolated`, `independent`.
- Read at addiction-AE apply time. Existing AEs not retroactively rewritten when the setting changes (per `SPEC.md` line 178).
- `linked-isolated` mode requires a `preDeleteActiveEffect` hook to prevent cascade-removal of the addiction AE when poisoned is removed externally. If this turns out to need DAE, mark "DAE recommended" and document — verify at execution.

### `+N` bypass tier

- `modifier.types` extends `["auto-pass", "advantage"]` → `["auto-pass", "advantage", "+N"]`.
- `modifier-resolution.js` `TIER_RANK` becomes `{ "auto-pass": 0, "advantage": 1, "+N": 2 }`. `+N` is the weakest tier.
- Within `+N`, all matching AEs **sum** their `bonus` values. Across tiers, strongest wins (any `auto-pass` → `auto-pass`; else any `advantage` → `advantage`; else `+N` sum).
- Pipeline returns `{ resolution: "+N", bonus: <sum>, sources: [<ae>...] }`. Consumer in `addiction.js` passes the bonus to `actor.rollSavingThrow` (verify exact dnd5e 5.2.5 API at execution).

### Simulate-dose: 3-dot menu entry on substance items (not header button)

- The dnd5e ApplicationV2 item sheet's built-in 3-dot menu (header context menu — verify exact V2 API name at execution Phase 1) gets a "Simulate dose…" entry on substance items.
- Opens a dialog with knobs per `SPEC.md` line 204: Con mod override, current addiction state, paraphernalia available.
- Engine creates an ephemeral actor named `__fishut-test-<uuid>__`, runs the activity, captures chat output, deletes the actor.
- Cleanup: deleted on dialog close, on error, and a `ready` hook sweeps any orphaned `__fishut-test-*` actors (GM-arbitrated).

### Paraphernalia Subtype Manager (user addition)

- New `game.settings.registerMenu` entry "Manage Paraphernalia Subtypes" opens an ApplicationV2 sub-menu — CRUD UI for a custom subtypes list.
- Storage: world setting `customParaphernaliaSubtypes` of shape `[{ id, label }, ...]`. Default empty.
- Read path: a new `getEffectiveParaphernaliaSubtypes()` helper composes `SCHEMA.paraphernalia.subtypes` (built-in defaults) + the custom list. Built-ins are not deletable; custom entries are user-managed. The Details-tab subtype select consumes this composed list.
- Built-ins remain in `schema.json` so authoring docs and content invariants stay schema-as-data. Custom entries are runtime-only and don't get content-validation hooks (the validator's job is to verify enum membership against the live composed list).
- This is the ONE non-spec'd feature in v0.4. It's small (~M-sized) and fits cleanly into the settings work already in flight.

### Settings registered in v0.4

Per `SPEC.md` and the user addition:
- `addictionPoisonedCoupling` — choice (`linked-cascade` | `linked-isolated` | `independent`), default `linked-cascade`.
- `voluntaryAbstainEnabled` — boolean, default `true`.
- Integration toggles per `SPEC.md` lines 196-200: `<integrationId>Integration` keys, default-on if module active. v0.4 needs these for `daeIntegration` (already in v0.3?). Audit at execution; only register what v0.4 actually consumes.
- `customParaphernaliaSubtypes` — hidden world data setting (no UI; written by the manager sub-menu).
- Settings menu entry "Manage Paraphernalia Subtypes" pointing at the new sub-app.

Per CLAUDE.md memory ("Prefer baked-in over settings"), I'm only registering what `SPEC.md` explicitly scopes plus the user-added subtype manager. No drift.

### Schema-as-data and pure-function discipline

Holds. New enums (`tolerance` kind, `+N` type, overdose ability/dc shape, `coupling.modes` for the setting choice list, paraphernalia-subtypes default list) extend `schema.json` with `labelKey` entries. Pure helpers in `scripts/data/*` for tolerance, overdose, abstain.

## Dependency graph

```
schema.json (kinds += tolerance, types += "+N", overdose shape, coupling modes for setting list)
    │
    ├── flag-schema.js
    │     ├── getOverdose / setOverdose
    │     └── getWithdrawalEffectId / setWithdrawalEffectId
    │
    ├── settings registration
    │     ├── addictionPoisonedCoupling
    │     ├── voluntaryAbstainEnabled
    │     ├── integration toggles (audit)
    │     └── customParaphernaliaSubtypes (data) + Manage Subtypes menu
    │
    ├── paraphernalia-subtypes manager (FormApp V2 + getEffectiveParaphernaliaSubtypes)
    │     └── consumed by details-tab paraphernalia subtype select
    │
    ├── pure helpers (tolerance.js, overdose.js, abstain.js)
    │     │
    │     └── modifier-pipeline.js — +N tier in pickBypassResolution; consumeToleranceForSubstance
    │
    └── consumers
          ├── addiction.js — +N save bonus; tolerance auto-stack on pass; coupling read at AE-apply
          ├── overdose.js (NEW hook) — d100 in postUseActivity, marker AE
          ├── long-rest-abstain.js (NEW hook) — abstain dialog button
          └── validate-content.mjs — new shape invariants

Authoring surface
    ├── details-tab/substance-fields.hbs — withdrawalEffectId picker + hint, overdose fieldset
    ├── details-tab/paraphernalia-fields.hbs — subtype select reads composed list
    ├── details-tab/bypass-section.hbs — +N display
    └── details-tab.js — 3-dot menu hook for "Simulate dose…"

Macros: Remove Tolerance, Remove Overdose, Remove Withdrawal (parallel to existing Remove Addiction)

Theme 1 wiki: in-world journal becomes pointer; full GM guide to GitHub wiki repo

Round-2 content: parallelizable from day 1; matrix re-verify first
```

Build order: schema + settings + accessors → pure helpers → pipeline → consumers → UI → validation → macros → content + wiki.

## Phases

### Phase 1 — Foundation

#### Task 1: Extend `schema.json`

**Description.** Add `tolerance` to `modifier.kinds`, `+N` to `modifier.types`, `flagKeys.overdose` and `flagKeys.withdrawalEffect`, `coupling.modes` (for the setting choice list), and the default `paraphernalia.subtypes` list with `labelKey`s. Add lang keys: `FISHUT.Modifier.Kind.tolerance`, `FISHUT.Modifier.Type.plusN`, `FISHUT.Coupling.Mode.*`, `FISHUT.Overdose.*`, `FISHUT.Settings.*`, `FISHUT.Paraphernalia.Subtype.*` (built-ins).

**Acceptance.**
- [ ] `SCHEMA.modifier.kinds` includes `tolerance`; `SCHEMA.modifier.types` includes `"+N"`.
- [ ] `SCHEMA.coupling.modes` resolves with three entries.
- [ ] `flagKeys.overdose` and `flagKeys.withdrawalEffect` resolve.
- [ ] `SCHEMA.paraphernalia.subtypes` lists current built-ins with `labelKey`s.
- [ ] No JS hardcodes `"tolerance"`, `"+N"`, `"linked-cascade"`, etc. outside `schema.json` reads.

**Verify.** `npm run lint && npm run validate && npm run test:unit` clean.

**Files.** `scripts/data/schema.json`, `lang/en.json`, `scripts/config.js`. **Scope.** S.

---

#### Task 2: Item-flag accessors — `getOverdose / setOverdose`, `getWithdrawalEffectId / setWithdrawalEffectId`

**Description.** Item-level accessors in `flag-schema.js`. `getOverdose(item)` returns `{ enabled, chancePercent, description } | null`. `getWithdrawalEffectId(item)` returns AE id string or null. Setters write to canonical keys.

**Acceptance.**
- [ ] Round-trip: set then get returns the same shape.
- [ ] Both return `null` when flag absent (no defaults).
- [ ] No other module reads these flag paths directly.

**Verify.** New unit test `test/unit/overdose-flag-shape.test.mjs` round-trips both accessors. Add to `package.json` `test:unit`.

**Files.** `scripts/data/flag-schema.js`, `test/unit/overdose-flag-shape.test.mjs`, `package.json`. **Scope.** S.

---

#### Task 3: Register world settings

**Description.** Register in `module.mjs init`:
- `addictionPoisonedCoupling` — choice (three modes from `SCHEMA.coupling.modes`), default `linked-cascade`.
- `voluntaryAbstainEnabled` — boolean, default `true`.
- Integration toggles audit: enumerate active integrations referenced by v0.4 code; register a setting per the `<integrationId>Integration` pattern, default-on-if-active.
- `customParaphernaliaSubtypes` — hidden data setting, default `[]`.
- `manageParaphernaliaSubtypes` — `registerMenu` entry pointing at the FormApp from Task 4.

**Acceptance.**
- [ ] All four settings + the menu entry appear in the module's settings panel as appropriate.
- [ ] Defaults match.
- [ ] Reading via `game.settings.get()` returns expected values in a fresh world.

**Verify.** Quench: `settings-registration` test confirms presence + defaults. Manual hand-test the settings panel renders cleanly.

**Files.** `scripts/module.mjs`, `scripts/settings.js` (new — verify if a settings module already exists at execution), `lang/en.json`. **Scope.** S.

---

#### Task 4: Paraphernalia Subtype Manager

**Description.** New `scripts/ui/paraphernalia-subtypes-app.js` — an ApplicationV2 form that reads/writes the `customParaphernaliaSubtypes` setting. UI: list rows of `{ id, label }`, an "Add row" button, per-row delete and inline edit, a "Save" footer. `id` is kebab-case-validated (matches existing schema convention); `label` is free-text.

Add a pure helper `scripts/data/paraphernalia-subtypes.js` exporting `getEffectiveParaphernaliaSubtypes()` that composes `SCHEMA.paraphernalia.subtypes` (built-ins, frozen) + the custom list (from setting). Returns the merged list with built-in entries flagged `readOnly: true` for UI use.

Update `details-tab.js buildParaphernaliaContext` to call `getEffectiveParaphernaliaSubtypes()` instead of reading from `SCHEMA` directly.

**Acceptance.**
- [ ] Settings menu "Manage Paraphernalia Subtypes" opens the form.
- [ ] Add/edit/delete custom entries persists to the setting.
- [ ] Built-in subtypes listed but not deletable (UI flag).
- [ ] `id` collision (with built-in or another custom) rejected with an error.
- [ ] Details-tab subtype select on paraphernalia items shows built-ins + custom.

**Verify.** Unit test `test/unit/paraphernalia-subtypes.test.mjs` for the pure composition helper. Quench test for the full add → save → re-render flow.

**Files.** `scripts/ui/paraphernalia-subtypes-app.js`, `templates/paraphernalia-subtypes-app.hbs`, `scripts/data/paraphernalia-subtypes.js`, `scripts/ui/details-tab.js` (consumer update), `lang/en.json`, `test/unit/paraphernalia-subtypes.test.mjs`, `package.json`, `test/quench/test-suite.mjs`. **Scope.** M.

---

#### Task 5: Pure helpers — `tolerance.js`, `overdose.js`, `abstain.js`

**Description.** Three pure modules:

1. `scripts/data/tolerance.js` — exports `composeToleranceFor(actor, substanceId, candidates)` returning the summed effect: `{ attenuateAltered, addictionDcBump, withdrawalAmplify }`. Sum is per-stack × stack count, per AE, then summed across AEs.
2. `scripts/data/overdose.js` — exports `rollOverdose(chancePercent, randomFn = Math.random)` returning `{ hit: boolean, roll: number }`. Pure d100 with injectable RNG so the unit test can assert hit rates.
3. `scripts/data/abstain.js` — exports `defaultAbstainDc(withdrawalMod)` and `applyAbstainOutcome(passed, currentRests)` returning `{ newRests, removed: boolean }`.

**Acceptance.**
- [ ] All three importable in plain Node — no Foundry globals.
- [ ] Tolerance: 2-AE × 3-stack scenario sums correctly.
- [ ] Overdose: with seeded RNG, hit-rate over 1000 trials matches `chancePercent` ±5 per `SPEC.md` line 133.
- [ ] Abstain: pass → `newRests = max(0, currentRests - 2)`, `removed = newRests === 0`. Fail → `newRests = max(0, currentRests - 1)`.

**Verify.** Three new unit tests. Add to `package.json`.

**Files.** Three pure modules + three test files + `package.json`. **Scope.** M.

---

#### Task 6: Extend `modifier-resolution.js` and `modifier-pipeline.js` for `+N` and tolerance

**Description.**
- `TIER_RANK` gets `"+N": 2`. `pickBypassResolution`: any `auto-pass` → that tier wins; else any `advantage` → that tier wins; else if `+N` candidates present, return `{ resolution: "+N", bonus: <sum>, sources: [...] }`.
- `modifier-pipeline.js` adds `consumeToleranceForSubstance(actor, substanceId)` walking AEs filtered by `kind: "tolerance"` and matching `substanceId`, calling `composeToleranceFor`. No uses-consumption (tolerance is a state).

**Acceptance.**
- [ ] `consumeBypassIfAvailable` returns `{ resolution, source?, sources?, bonus? }` per shape doc'd in code.
- [ ] `+N` sum across multiple AEs.
- [ ] `consumeToleranceForSubstance` returns `null` when no matching AEs.
- [ ] Existing addiction.js consumer updated for the new return shape.

**Verify.** Extend `modifier-pipeline.test.mjs` with `+N` cases. New `tolerance-pipeline.test.mjs`.

**Files.** `scripts/data/modifier-resolution.js`, `scripts/data/modifier-pipeline.js`, `scripts/hooks/addiction.js`, two test files, `package.json`. **Scope.** M.

---

### Checkpoint A — Foundation

- [ ] `npm run lint && npm run validate && npm run test:unit && npm run pack` clean.
- [ ] Settings panel shows the four new settings + Manage Subtypes menu.
- [ ] Subtype manager opens and persists custom entries; details-tab paraphernalia select shows them.
- [ ] Pipeline returns `+N` for `+N`-only AE sets; bonus correctly summed.
- [ ] User hand-tests: drop a `+N` paraphernalia, verify save bonus; add a custom paraphernalia subtype, verify it appears in authoring.

---

### Phase 2 — Consumers

#### Task 7: Wire `+N` into the addiction save path

**Description.** When pipeline returns `+N`, pass the bonus to `actor.rollSavingThrow` (verify exact dnd5e 5.2.5 API name — `parts`, `bonus`, or `data` — at execution). Chat card cites all `sources`.

**Acceptance.** `+N` bonus reaches the rolled save total; chat lists each contributing AE; `auto-pass` / `advantage` paths unchanged.

**Verify.** Quench `+N-bonus-applies` covers single-AE, multi-AE-sum, mixed-tier-loses cases.

**Files.** `scripts/hooks/addiction.js`, `test/quench/test-suite.mjs`. **Scope.** S.

---

#### Task 8: Wire overdose d100 into `postUseActivity`

**Description.** New `scripts/hooks/overdose.js` registers in `postUseActivity` after the addiction save. Reads item's `overdose` flag; if `enabled`, calls `rollOverdose(chancePercent)`. On hit: applies marker AE `Overdosed on {Substance}` to the actor with the description copied to the AE description, and posts a chat card per `SPEC.md` line 127.

**Acceptance.**
- [ ] No flag or `enabled: false` → no roll, no marker.
- [ ] On hit: marker AE applied, chat card posted with description.
- [ ] Marker AE name contains `overdose`.
- [ ] Independent of addiction save outcome (overdose can fire on saved doses).

**Verify.** Quench `overdose-fires-and-applies-marker` (deterministic via seeded RNG path).

**Files.** `scripts/hooks/overdose.js`, `scripts/module.mjs` (register), `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** S.

---

#### Task 9: Wire tolerance auto-stack into `applyOutcome` (save pass branch)

**Description.** In `addiction.js applyOutcome`, on save **pass**, look for an existing tolerance AE on the actor matching this substance's id. If present: increment `flags.stacks` (and re-render). If absent: apply a new tolerance AE templated from the substance item's authored tolerance template AE (or a built-in default if none authored), with `flags.stacks: 1`.

Authoring of the per-stack values lives on the substance item's tolerance template AE (a normal AE with the modifier flag block). v0.4 does **not** add a Details-tab field for tolerance authoring — GMs author it on the Active Effects tab. Documented in the wiki (Theme 1 task).

**Acceptance.**
- [ ] First successful save → tolerance AE applied with `stacks: 1`.
- [ ] Second successful save (same substance) → same AE, `stacks: 2`.
- [ ] Different substance → its own tolerance AE.
- [ ] AE name contains `tolerance`.

**Verify.** Quench `tolerance-stacks-on-save-pass` covers single, repeat, and multi-substance cases.

**Files.** `scripts/hooks/addiction.js`, `test/quench/test-suite.mjs`. **Scope.** M.

---

#### Task 10: Withdrawal AE template selection at long-rest tick

**Description.** Re-scoped: not a new application path. v0.3 long-rest tick already applies a default withdrawal AE; v0.4 reads `getWithdrawalEffectId(item)` and uses the authored template if set, falling back to the v0.3 default if not.

**Acceptance.**
- [ ] With `withdrawalEffectId` set: long-rest tick applies the authored template's AE.
- [ ] Without: v0.3 default behavior preserved (no regression).
- [ ] AE name contains `withdraw`; warning + skip if not.

**Verify.** Quench `withdrawal-template-selection`.

**Files.** `scripts/hooks/addiction.js` (the `restCompleted` path), `test/quench/test-suite.mjs`. **Scope.** S.

---

#### Task 11: Poisoned-coupling tri-state at AE-apply

**Description.** In the addiction-AE apply path, read `game.settings.get(MODULE_ID, "addictionPoisonedCoupling")` and configure the applied AE's `statuses` array:
- `linked-cascade`: `statuses = ["poisoned"]`. Foundry's native cascade-on-removal of poisoned removes the addiction AE — current v0.3 behavior.
- `linked-isolated`: `statuses = ["poisoned"]` AND register a `preDeleteActiveEffect` guard that prevents the addiction AE's removal when triggered by external poisoned-clear.
- `independent`: `statuses = []`.

If the `linked-isolated` guard turns out to need DAE, downgrade to "DAE recommended" and document.

**Acceptance.** All three modes observable in Quench tests per `SPEC.md` line 176.

**Verify.** Quench `poisoned-coupling-modes` runs each mode end-to-end (apply addiction, run remove-poisoned, observe state).

**Files.** `scripts/hooks/addiction.js`, possibly a new hook file for the `linked-isolated` guard, `test/quench/test-suite.mjs`. **Scope.** M.

---

#### Task 12: Update `validate-content.mjs` for new shapes

**Description.** Extend invariants:
- `+N` modifier type allowed when `bonus: number` present; reject `+N` without `bonus`.
- `tolerance` modifier kind allowed; require `substanceId` and at least one of `attenuateAltered` / `addictionDcBump` / `withdrawalAmplify`.
- Item-level `overdose` flag: when `enabled`, require `chancePercent` 1–100 and non-empty `description` per `SPEC.md` line 304.
- `withdrawalEffectId` when set: must resolve to an AE on the same item whose name contains `withdraw`.
- Withdrawal AE warning (not error) per `SPEC.md` line 304: warn if AE imposes `disadvantage` on `attack` or `check`.
- Paraphernalia `subtype` field: must be in `getEffectiveParaphernaliaSubtypes()` (built-in OR custom). Authoring path validates against the live composed list.

**Acceptance.** Existing `_source/` content passes unchanged; new v0.4 shapes validated; warnings render distinctly from errors.

**Verify.** New / extended unit tests in `test/unit/validate-content.test.mjs`. Add to `package.json`.

**Files.** `tools/validate-content.mjs`, `test/unit/validate-content.test.mjs`, `package.json`. **Scope.** M.

---

### Checkpoint B — Consumers complete

- [ ] All unit + Quench tests pass; v0.3 behavior unchanged where unaffected.
- [ ] User hand-tests: full v0.3 substance with no v0.4 features (regression check); a v0.4 substance with overdose enabled (10% chance, dose 20× — observe roughly 2 hits); a substance + tolerance AE template (3 saves → 3 stacks).

---

### Phase 3 — Authoring surface

#### Task 13: Withdrawal effect picker + content guidance hint

**Description.** Insert select after `addictionEffectId` in `templates/details-tab/substance-fields.hbs` listing the item's AEs whose name contains `withdraw`. Below the picker, render the hint string from `SPEC.md` line 142. Persist via existing `persistField` mechanism.

**Acceptance.** Field renders, persists round-trip, hint text renders, lists matching AEs only.

**Verify.** Quench `details-tab-withdrawal-picker`.

**Files.** `templates/details-tab/substance-fields.hbs`, `scripts/ui/details-tab.js`, `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** S.

---

#### Task 14: Overdose fieldset

**Description.** Append a fieldset to `substance-fields.hbs`: enabled toggle (`<dnd5e-checkbox>`), `chancePercent` (number 1–100), `description` (textarea). Disabled fields are inert visually when toggle off; persist via `persistField`.

**Acceptance.** All three fields persist round-trip; toggle gates the others' UI state; `chancePercent` clamped 1–100 client-side.

**Verify.** Quench `details-tab-overdose-persistence`.

**Files.** `templates/details-tab/substance-fields.hbs`, `scripts/ui/details-tab.js`, `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** M.

---

#### Task 15: Bypass-section displays `+N` bonus

**Description.** When the bypass AE has `type: "+N"`, surface the `bonus` value in `bypass-section.hbs` alongside `appliesTo` and `usesPerDay`. Read-only display; authoring stays on the AE flags tab.

**Acceptance.** `+N` AE shows `+N: <bonus>`; `auto-pass` / `advantage` AEs unchanged.

**Verify.** Quench `bypass-section-displays-plus-n`.

**Files.** `templates/details-tab/bypass-section.hbs`, `scripts/ui/details-tab.js`, `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** S.

---

#### Task 16: Simulate-dose 3-dot menu entry + dialog

**Description.** Hook the dnd5e ApplicationV2 item-sheet header context menu (the built-in 3-dot menu next to Close) — verify exact V2 API (`_getHeaderControls` override, `getApplicationHeaderButtons` hook, or equivalent) at execution Phase 1. On substance items only, add a "Simulate dose…" entry.

Click opens an ApplicationV2 dialog with knobs per `SPEC.md` line 204: Con mod override, current addiction state (none / addicted / withdrawing), paraphernalia ready (toggle list of the substance's required paraphernalia). Submit creates an ephemeral actor `__fishut-test-<uuid>__<original-name>`, runs the activity end-to-end (gate → save → AEs → tolerance → overdose), captures chat output and renders a summary in the dialog. Dialog close → delete the temp actor.

`ready` hook sweeps any `__fishut-test-*` orphans (GM-arbitrated via `game.users.activeGM === game.user`).

**Acceptance.**
- [ ] 3-dot menu entry visible on substance items only.
- [ ] Dialog opens, runs activity, displays chat output.
- [ ] Temp actor deleted on close, on error, on world reload.
- [ ] Knobs (Con mod, addiction state, paraphernalia) influence the run as documented.

**Verify.** Quench `simulate-dose-roundtrip` covers happy path, error cleanup, orphan sweep on `ready`.

**Files.** `scripts/ui/simulate-dose.js`, `templates/simulate-dose-dialog.hbs`, `scripts/ui/details-tab.js` (3-dot menu hook registration), `scripts/module.mjs` (register `ready` sweep), `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** L.

---

### Checkpoint C — Authoring surface complete

- [ ] All v0.3 authoring still reachable.
- [ ] New fields persist round-trip; simulate-dose round-trips and cleans up.
- [ ] User hand-tests: author a v0.4 substance from scratch with overdose + withdrawal picker, simulate a dose, verify the simulation matches the live behavior afterwards.

---

### Phase 4 — Long-rest abstain + macros + drag dialog

#### Task 17: Long-rest abstain dialog hook

**Description.** New `scripts/hooks/long-rest-abstain.js`. Hooks the dnd5e long-rest dialog (verify exact hook at execution — likely `renderLongRestDialog` or `dnd5e.preRestCompleted`). When `voluntaryAbstainEnabled === true` AND the actor has any active withdrawal AE, the dialog shows an "Abstain this rest" button per active withdrawal substance. Click → roll Wis save vs `defaultAbstainDc(withdrawalMod)`. Pass: decrement `restsRemaining` by 2 (clamped at 0; AE removed via existing tick logic). Fail: normal 1-rest progress.

**Acceptance.**
- [ ] Setting on + active withdrawal AE → button appears.
- [ ] Setting off → no button.
- [ ] Pass path: -2 rests; AE cleared if newRests === 0.
- [ ] Fail path: -1 rest, no penalty.

**Verify.** Quench `long-rest-abstain-flow` covers pass, fail, setting-off, and clamp-at-0 cases.

**Files.** `scripts/hooks/long-rest-abstain.js`, `scripts/module.mjs` (register), `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** M.

---

#### Task 18: Three Remove-X macros

**Description.** Three new macros in `_source/fishut-illicit-macros/` parallel to existing Remove Addiction:
- `remove-tolerance.json` — match by `flags[MODULE_ID].sourceSubstanceId` first; regex fallback `/tolerance/i`.
- `remove-overdose.json` — same pattern; regex `/overdose/i`.
- `remove-withdrawal.json` — same; regex `/withdraw/i`.

Each macro: GM-only (per existing pattern), shows a dialog with a checkbox per matching AE on the selected actor, removes checked AEs.

**Acceptance.**
- [ ] All three pack into `fishut-illicit-macros` cleanly.
- [ ] Each removes the right AE class; doesn't remove unrelated AEs.
- [ ] Regex fallback works when source-flag is missing.

**Verify.** Quench `remove-x-macros` covers each macro with both flag-based and regex-fallback matches.

**Files.** Three new `_source/fishut-illicit-macros/*.json` files, `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** S.

---

#### Task 19: Replace v0.3 stubs in drag-to-inventory dialog

**Description.** v0.3's TOLERANT and OVERDOSED choices show "Coming in v0.4" toasts. Replace:
- TOLERANT → apply a tolerance AE on the target actor templated from the substance's tolerance template (or default), `flags.stacks: 1`.
- OVERDOSED → apply the overdose marker AE.

**Acceptance.** Both buttons apply the right AE; no toast; other dialog buttons unchanged.

**Verify.** Quench extends `drag-to-inventory-dialog` to cover both new paths.

**Files.** `scripts/hooks/drag-to-inventory.js`, `templates/drag-to-inventory-dialog.hbs`, `lang/en.json`, `test/quench/test-suite.mjs`. **Scope.** S.

---

### Checkpoint D — Mechanics complete

- [ ] All Phase 1-4 unit + Quench tests pass.
- [ ] User hand-tests the full v0.4 loop: author a substance with overdose + tolerance template, drag onto PC via dialog (apply Altered), dose multiple times, observe tolerance stacking, observe occasional overdose; voluntary abstain on long rest skips a rest correctly.

---

### Phase 5 — Theme 1 wiki + content + docs

#### Matrix re-verification (do this first)

Run `Glob _source/fishut-illicit-substance/*.json`, read each file's `setting` and `category`, tabulate. Round-2 target: every cell has ≥2 substances. Earlier session memory disagreed with one explorer's report — trust the source files.

#### Task 20: Theme 1 — GM Guide wiki migration

**Description.** Per `SPEC.md` line 215:
- Reduce the in-world journal to a single short pointer page linking to the GitHub wiki.
- Move the full GM guide content to the GitHub wiki repo (separate from the code repo per Foundry-Wiki convention; create the wiki and seed the pages).
- Add a lightweight CI check: fetch the wiki URL, expect 200. Failure → CI fails. Lives in `.github/workflows/ci.yml` or a new workflow.
- Wiki content covers the v0.4 mechanics: tolerance authoring, overdose authoring, withdrawal-bite hint guidance, voluntary abstain, poisoned-coupling modes, simulate-dose usage, paraphernalia subtype manager, the `+N` modifier type.

**Acceptance.**
- [ ] In-world journal is a one-page pointer.
- [ ] Wiki repo exists with seeded pages covering v0.4 mechanics.
- [ ] CI link-check passes when wiki is up; fails when down.

**Verify.** Manual review of wiki content. CI green on the link-check.

**Files.** `_source/fishut-illicit-journals/*.json` (in-world content), wiki repo (separate), `.github/workflows/*.yml`. **Scope.** M.

---

#### Task 21: Round-2 substances

**Description.** Author one substance per matrix cell that has fewer than 2 substances (count determined by the matrix re-verification above). Each follows the v0.3 substance template. AE-naming contracts honored (`addict`, `withdraw`, `overdose` substring rules where applicable).

**Acceptance.** Every (setting, category) cell has ≥2 substances. `npm run validate:content && npm run pack` clean.

**Verify.** Validate + pack clean. Existing addiction-loop Quench tests still pass with new content.

**Files.** `_source/fishut-illicit-substance/*.json` (count TBD post-verify), `lang/en.json`. **Scope.** M-L (sized after verify).

---

#### Task 22: One round-2 paraphernalia exercising `+N`

**Description.** Author one paraphernalia item with a `transfer: true` AE carrying `kind: "bypass", type: "+N", bonus: 2, appliesTo: [<one administration>]` so the `+N` path has content-level coverage at release.

**Acceptance.** Validates and packs. Simulate-dose against a substance using its administration shows the `+N` bonus on the save chat card.

**Verify.** `npm run validate:content && npm run pack` clean. Manual verify in a live world.

**Files.** `_source/fishut-illicit-paraphernalia/<slug>.json`, `lang/en.json`. **Scope.** S.

---

### Checkpoint E — Sprint complete

- [ ] All unit tests pass.
- [ ] All Quench tests pass in a fresh world.
- [ ] `npm run validate:content` clean.
- [ ] `npm run lint && npm run format` clean.
- [ ] Every matrix cell has ≥2 substances.
- [ ] Theme 1 wiki live; CI link-check passes.
- [ ] Paraphernalia subtype manager round-trips end-to-end.
- [ ] User hand-tests the full v0.4 loop end-to-end in a fresh world.
- [ ] Tag `v0.4.0` → release workflow publishes module.json + module.zip; install in fresh world succeeds.
- [ ] `ROADMAP.md` updated: v0.4 items struck through.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Tolerance per-stack semantics ambiguous in SPEC.md.** "sums stack effect" — for `durationFactor` (e.g. 0.8), is the 3-stack effect 0.8×3 = 2.4, 0.8^3 = 0.51, or 1 - (0.2×3) = 0.4? | Medium — wrong choice gives unintuitive math | **Open question for execution Phase 1: confirm the per-stack interpretation with the user before locking in `composeToleranceFor`.** Best-judgment default (subject to confirmation): per-stack delta is **additive on the result**, i.e. `addictionDcBump: 1` × 3 stacks = +3 DC; `durationFactor: 0.1` × 3 stacks = duration × (1 - 0.3) = 70%. Document the choice in `tolerance.js`. |
| **dnd5e 5.2.5 V2 3-dot-menu API name.** | Low | Verify at execution Phase 1 of Task 16. If the V2 hook is renamed or restructured, adapt; the dialog itself doesn't depend on the menu API. |
| **`linked-isolated` coupling needs DAE.** | Low-Med | Prototype with a minimal `preDeleteActiveEffect` first. If it requires DAE, downgrade to "DAE recommended" with a `getNotifications` warning when the setting is `linked-isolated` and DAE is absent. |
| **Tolerance stack representation: single AE + counter vs N AEs.** | Low | Single AE + `flags.stacks` counter chosen for cleaner UI. Verify dnd5e 5.2.5 status-counter UI conventions at execution. |
| **Matrix re-verification reveals more cells than budgeted.** | Low | Phase 5 task is sized post-verify; budget grows to fit. Content tasks parallelize. |
| **Wiki repo creation outside the code repo is a one-time chore.** | Low | Document the wiki repo URL in `module.json` and `README.md`. CI link-check is the ongoing guard. |
| **Paraphernalia subtype manager UI complexity.** | Low-Med | Keep the FormApp simple — list, add, edit, delete, save. No drag-reorder, no batch ops in v0.4. |

## Resolved decisions

1. **Tolerance is auto-tracked** via stack-counter AE on save pass per `SPEC.md` line 86.
2. **Tolerance composition is per-stack additive sum** (best-judgment default; confirm at execution Phase 1).
3. **Overdose is `chancePercent` d100 per consumption** per `SPEC.md` lines 117-127, runs alongside addiction save (not pre-empt).
4. **Withdrawal-bite is picker + persistence + content-guidance hint**, application path stays at long-rest tick.
5. **Voluntary abstain is a long-rest dialog button**, gated by `voluntaryAbstainEnabled`. Pass: -2 rests. Fail: -1 rest, no penalty.
6. **Poisoned-coupling is a world setting** (`addictionPoisonedCoupling`), three modes, read at AE-apply.
7. **Simulate-dose is a 3-dot menu entry on substance items** (NOT a header button — Foundry V13 convention).
8. **Macros are three Remove-X**: Remove Tolerance, Remove Overdose, Remove Withdrawal.
9. **Theme 1 wiki migration is a real Phase 5 task** with CI link-check.
10. **`+N` is the weakest tier**; auto-pass > advantage > +N > none. Within `+N`, all matching AEs sum.
11. **Paraphernalia Subtype Manager** added (user request, non-spec) via `registerMenu` + FormApp V2 + `customParaphernaliaSubtypes` setting + `getEffectiveParaphernaliaSubtypes()` composition helper.
12. **Settings registered in v0.4**: `addictionPoisonedCoupling`, `voluntaryAbstainEnabled`, integration toggles (audit), `customParaphernaliaSubtypes`, "Manage Paraphernalia Subtypes" menu entry.
13. **Round-2 content does not need to "exercise a v0.4 mechanic"** — content stays orthogonal to mechanics work. (Content authoring will naturally use new mechanics where it fits.)

## Parallelization notes

After Tasks 1-3 land (~half a day), three streams open:

- **Stream A — Mechanics:** Tasks 5 → 6 → 7/8/9/10/11/12.
- **Stream B — Authoring:** Tasks 4 (subtype manager) parallel with Tasks 13/14/15/16 (sheet extensions). Task 16 is the largest in this stream.
- **Stream C — Content + wiki:** Tasks 20/21/22 — independent of mechanics; matrix re-verify first.

Phase 4 (Tasks 17-19) sequences after Stream A. Three sub-agents can work in parallel after Task 3 lands.

---

# Task list (todo.md mirror)

```markdown
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
```

---

## Plan-mode note for the user

Plan mode currently restricts file writes to this single plan file. After ExitPlanMode approval I will:

1. Copy this plan into `tasks/plan.md` and the task list into `tasks/todo.md`.
2. Begin with Task 1 (schema extensions).

No code or content changes happen until you explicitly say "go" on Task 1.

**One open question I'd like resolved at execution Phase 1 of Task 5 / Task 9** (not blocking plan approval): what's the per-stack interpretation of tolerance factors? Best-judgment default in the plan is "additive deltas on the result" (3 stacks × `addictionDcBump: 1` = +3 DC; 3 stacks × `durationFactor: 0.1` = duration × 0.7). Confirm or correct before I lock in `composeToleranceFor`.
