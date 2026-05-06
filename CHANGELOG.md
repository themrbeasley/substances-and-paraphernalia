# Changelog

All notable changes to this module will be documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/) once it
reaches v1.0. Pre-1.0 minor bumps may carry breaking schema changes.

## [Unreleased]

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
