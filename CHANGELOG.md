# Changelog

All notable changes to this module will be documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/) once it
reaches v1.0. Pre-1.0 minor bumps may carry breaking schema changes.

## [Unreleased]

### Breaking
- **Per-substance `requiredSubtypes` callout removed.** Paraphernalia gating
  no longer keys on a substance-authored list of subtype ids. Going forward
  the gate keys on the dnd5e Poison administration type at
  `system.type.subtype` (`contact` | `ingested` | `inhaled` | `injury`)
  matched against a paraphernalia-side `appliesTo` admin list (Phase 3+).
  The legacy `requiredSubtypes` flag is now a hard validator error. Pre-1.0
  clean break — no migration shim.

## [0.5.1] — 2026-05-10

### Breaking
- **`dae`, `midi-qol`, and `tokenmagic` are now `relationships.requires`.**
  Foundry refuses to activate the module on a world without all three. The
  `daeIntegration` and `midiqolIntegration` world settings have been
  removed (their off-states would silently break the addiction pipeline
  and weren't honest options). The `tmfxIntegration` toggle remains as a
  per-world visuals opt-out. Existing v0.5.0 worlds will hit Foundry's
  required-modules dialog on next load — install/activate the prereqs.

### Fixed
- **TMFX preset palette now actually registers under TMFX 0.7.6.3+.**
  Three preset bugs that silently no-op'd against the maintained TMFX
  fork (Feu-Secret/Tokenmagic):
  - `fishut-tmfx-modern-stimulant` declared `filterType: "bloom"` — the
    real enum is `xbloom`.
  - `fishut-tmfx-fantasy-mind-altering` (`wave`) used `amplitude` /
    `wavelength` — the actual `wave` filter takes `strength` /
    `frequency`.
  - `fishut-tmfx-scifi-mind-altering` (`ray`) used `intensity` /
    `amplitude` / `blend` / `divergence` — the actual `ray` filter
    takes `divisor` / `alpha`.
  Unknown filter types and unknown params are silently ignored by TMFX
  at construction time, which is exactly why this slipped past v0.5.0.
- **Preset registration is now truly idempotent.** `addPreset` is
  first-write-wins on `{name, library}` collision (returns false and
  keeps the original), so once a world had loaded any version of v0.5
  no preset tuning could ever reach users. Registration now calls
  `deletePreset` before each `addPreset`, so re-loads pick up the
  latest params.
- **Ready-hook ordering race repaired.** TMFX binds
  `globalThis.TokenMagic` inside its own `ready` handler. If our
  `ready` handler fired first, registration silently early-returned.
  We now defer to `canvasReady` when the global isn't yet bound, and
  warn-log if it's still missing then.

### Added
- `Remove Altered` macro in the `fishut-illicit-macros` compendium —
  fills the gap left by v0.4: the four other lifecycle removers
  (Addiction, Withdrawal, Tolerance, Overdose) all shipped, but the
  benefit AE (`Altered by *`) had no companion remover. Same UX as the
  other removers (preview list, per-AE checkboxes, paste-restore JSON
  whisper). Matches case-insensitively on `/altered/i` per the AE name
  contract.
- `module.api.integrations.verifyTmfxPresets()` — diagnostic helper
  that walks the preset palette, calls `TokenMagic.getPreset` on each
  entry, and returns `{registered, missing}`. Useful for triage from
  the GM console without reloading.
- Unit tests for the preset palette
  (`test/unit/tmfx-presets.test.mjs`) — pin every preset's `filterType`
  to TMFX 0.7.6.3+'s registered filter list so an invalid type fails
  CI rather than the live world.
- Quench round-trip suite (`S&P · TMFX preset round-trip`) — asserts
  every preset is retrievable from the `tmfx-main` library and
  optionally exercises `addFilters` against a canvas token.

## [0.3.0] — 2026-05-07

### Breaking
- **`addictionSaveBypass` removed from paraphernalia flag blocks.** Save
  bypass is now an AE-flag mechanism: any AE on the actor whose
  `flags["substances-and-paraphernalia"].modifier` block carries
  `kind: "bypass"` and an `appliesTo` administration list participates
  in the modifier pipeline. Paraphernalia grant bypass by carrying a
  `transfer: true` AE with that flag block. Pre-1.0 clean break — no
  migration shim. Re-import paraphernalia from the shipped compendium;
  the legacy item-level `addictionSaveBypass` shape is now a hard
  validator error.
- **Paraphernalia gating model switched to kebab-case subtypes.**
  Substances declare `requiredSubtypes: string[]` (open-enum, kebab-
  case), paraphernalia declare a single `subtype` field. The legacy
  `tags` / `requiredParaphernalia` / `paraphernaliaId` shapes are hard
  validator errors. Re-import shipped content.
- **3-dot authoring form removed.** `scripts/ui/item-settings-form.js`,
  its template, and the `FISHUT.ItemSettings.*` localization keys are
  deleted. Authoring lives on the dnd5e item-sheet **Details** tab.

### Added
- Native dnd5e Details-tab authoring section for substances and
  paraphernalia, replacing the 3-dot form. ApplicationV2 / dnd5e 5.2.5.
- AE-flag modifier pipeline (`scripts/data/modifier-pipeline.js`) with
  composition rule `auto-pass > advantage > none`; deterministic
  tie-break by AE id.
- `advantage` save-bypass type — addiction saves roll with advantage
  when a matching `kind: "bypass" / type: "advantage"` AE is on the
  actor.
- Drag-to-inventory state-injection dialog (GM/ASSISTANT only) that
  fires when a substance is dropped onto a `character` or `npc` actor.
  States: Altered (informational), Addicted (applies addiction AE +
  withdrawal entry), Withdrawing (withdrawal entry only), Decline
  (chat note). Tolerant / Overdosed buttons stub for v0.4.
- Theme 6 round 1 content: four substances filling the empty cells of
  the 3×3 setting × category matrix — Giantsbreath Tonic (fantasy /
  performance-enhancing), Spaceport Stim-Patch (sci-fi / stimulant),
  Reflex Injector (sci-fi / performance-enhancing), Voltbeans (modern
  / stimulant).
- Public API surface adds `api.modifierPipeline` and `api.modifierFlag`.

### Changed
- `consumeBypassIfAvailable(actor, substance)` returns
  `{ resolution, source }` (was `{ bypassed, paraphernalia, type }`).
- `module.json` `compatibility.verified` pinned to dnd5e 5.2.5.

## [0.2.0] — 2026-05-05

### Breaking
- **`schemaVersion` bumped to 2.** Substance and paraphernalia flag blocks
  carry new fields (`administration`, `addiction`, `addictionSaveBypass`).
  No automatic migration is provided — re-import substances and
  paraphernalia from the shipped compendia. Existing world copies authored
  against schema v1 will continue to load but will not be upgraded; gating
  still works, addiction automation does not fire on them.
- **Removed unimplemented stub settings.** `gmOverrideAllowed`,
  `playerSelfConsume`, `userCompendium`, and `tmfxEnabled` are gone from
  `scripts/data/schema.json`. They were never registered with
  `game.settings`; if a third party referenced them via
  `module.api.schema`, that reference is now `undefined`.

### Added
- Substance flag `administration` (`inhaled` / `ingested` / `injected` /
  `sublingual` / `topical`).
- Substance flag `addiction = { save: { ability, dc }, withdrawalMod,
  addictionEffectId }`.
- Paraphernalia flag `addictionSaveBypass = { type, appliesTo, usesPerDay }`
  for items that grant a saved-bypass against addiction (e.g. legendary
  attuned pipes).
- Actor flag `withdrawal[<substanceId>] = { restsRemaining, appliedAt }` —
  canonical state for withdrawal tracking.
- Active Effect flag `sourceSubstanceId` mirroring the substance item id on
  applied addiction effects.
- Item-settings 3-dot-menu form (ApplicationV2) for editing all of the
  above without hand-editing JSON.
- Save-on-use post-activity hook with standard 5e save dialog.
- GM-arbitrated long-rest withdrawal tick.
- `Remove Addiction` macro (preview, per-AE checkboxes, paste-restore
  whisper).
- `consumeBypassIfAvailable(actor, item)` helper exposed via
  `module.api.saveBypass`.
- Implicit DAE-required AE detection (per-AE, replaces item-level
  `requiresDae` flag).
- Pure-function unit tests under `test/unit/` runnable via
  `npm run test:unit`.
- Quench integration test suite under `test/quench/`.
- Content-invariants validator (`tools/validate-content.mjs`) wired into
  `npm run validate`.
- GitHub Actions CI workflow (`lint + validate + test:unit + pack`).

### Changed
- Substance descriptions standardized to a six-section canonical format
  (flavor → desired effects → save against addiction → addicted-from →
  withdrawal modifier + formula → requires footer).
- Benefit Active Effects renamed to `Altered by {Substance}` for
  uniformity and accessibility.
- Existing substances (`Coalshade Powder`, `Black Lift`, `Stellar Mist`)
  rewritten under the new schema and description format.
- GM Guide journal expanded with `Addiction & Withdrawal` and
  `Save Bypass & Administration` sections.

### Removed
- `requiresDae(item)` item-level accessor (replaced by per-AE
  `aeRequiresDae(effect)` in `scripts/integrations/dae.js`).

## [0.1.0] — initial scaffold

- Module skeleton, paraphernalia gate hook, AND-of-OR requirement
  evaluator, slug+UUID resolver, DialogV2 override flow, integration
  detection, four world/client settings, `Toggle Paraphernalia
  Enforcement` macro, single-page GM Guide.
