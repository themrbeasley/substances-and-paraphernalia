# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A FoundryVTT V13 / dnd5e 5.2.5 module that adds illicit substances + paraphernalia, a `preUseActivity`-time gate that blocks consumption when required gear isn't ready, and a `postUseActivity`-time addiction loop with paraphernalia-granted save bypasses. Pre-1.0; latest shipped is v0.5.x. Clean breaks preferred over migration shims (no shipped users).

## Common commands

```sh
npm install
npm run lint                 # eslint scripts/, tools/, test/
npm run validate             # validate:manifest + validate:content
npm run test:unit            # node --test, pure functions only (no Foundry globals)
npm run pack                 # _source/<pack>/*.json   → packs/<pack>/  (LevelDB)
npm run unpack               # packs/<pack>/           → _source/<pack>/*.json
npm run format               # prettier
```

Run a single unit test file:
```sh
node --test test/unit/withdrawal-duration.test.mjs
```

`npm run test:unit` lists files explicitly (not a glob) — when adding a new `test/unit/*.test.mjs`, add it to the script in `package.json` or it won't run in CI.

`packs/` and `node_modules/` are gitignored. `_source/` is the source of truth for compendium content; `packs/` is built from it and is what Foundry reads at runtime.

## Release flow

Tag-driven. Pushing a `v*` tag fires `.github/workflows/release.yml`, which:

1. Runs lint + validate + unit tests + pack.
2. Runs `tools/prepare-release.mjs` to patch `module.json` — sets `version` from the tag, sets `download` to the per-tag asset URL, leaves `manifest` pointing at `releases/latest/download/module.json`.
3. Builds `module.zip` and creates a GitHub release with `module.json` + `module.zip` attached.

The in-repo `module.json` keeps both `manifest` and `download` pointed at `releases/latest/download/*` — the release workflow rewrites `download` per tag so `module.json` always installs the version that owns it. **Don't commit a version-specific `download` URL** — the workflow handles it.

CI (`.github/workflows/ci.yml`) runs lint + validate + unit tests + pack on every push and PR. No release on CI.

If a tag/release pair ends up stale (e.g. tag pushed before a PR landed), recover with `gh release delete vX.Y.Z --yes --cleanup-tag` — that drops both the release and the remote tag — then `git tag -a vX.Y.Z <sha> -m "..."` and `git push origin vX.Y.Z` to re-fire the workflow.

## Architecture

### One init pipeline

`scripts/module.mjs` is the entry point. The flow is:

- `init` hook: register settings, register the `preUseActivity` gate, register the addiction hooks (`postUseActivity` + `restCompleted`), register the dnd5e Details-tab item-sheet injection.
- `ready` hook: run migrations (currently a no-op — empty `MIGRATORS` array), publish `game.modules.get(MODULE_ID).api`, notify GMs of missing optional integrations.

Adding a new hook means adding a `register*` call in `module.mjs` and a corresponding `Hooks.on(...)` inside the new module.

### Schema-as-data

`scripts/data/schema.json` is the single source of truth for:

- The legal values of `kind`, `category`, `setting`, `administration`, etc.
- Localization key paths for those enums (`labelKey` field).
- The schema version number that goes into `flags.schemaVersion`.

`scripts/config.js` fetches `schema.json` at module load and exports frozen constants. **Don't hardcode enum values in JS** — read them from `SCHEMA` / use `labelKey()`.

Paraphernalia subtypes are an exception: the legal list is **runtime-composed** by `scripts/data/paraphernalia-subtypes.js` `getEffectiveParaphernaliaSubtypes()` (built-ins from `SCHEMA.paraphernalia.subtypes` + custom entries from the `customParaphernaliaSubtypes` world setting, written by the Manage Subtypes settings menu). Authoring code, the Details-tab select, and `validate-content.mjs` all call the helper — never read `SCHEMA.paraphernalia.subtypes` directly.

### Three-layer data model

1. **Item flags** (the canonical source). `scripts/data/flag-schema.js` is the only place that reads/writes `flags["substances-and-paraphernalia"]`. Every other module talks to flags through these accessors.
2. **Actor flags** (`flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { appliedAt, endsAt }`) — canonical state for an active withdrawal window on a given actor. `appliedAt` and `endsAt` are ISO timestamps; `endsAt` is derived from the AE's authored duration at apply time and is what Times-Up counts down against.
3. **Active Effects on the actor** — UI mirror of the actor flag. Applied addiction and withdrawal AEs carry `flags["substances-and-paraphernalia"].sourceSubstanceId = <itemId>` so callers can match the AE back to its substance. Times-Up removes the withdrawal AE at expiry; `scripts/hooks/withdrawal-cleanup.js` listens on `deleteActiveEffect` and clears the matching actor flag entry. We do not poll or tick — the flag entry and AE come up and go down together.

### AE naming contract

AE names **must contain** the relevant substring (case-insensitive): addiction AEs → `addict`, withdrawal AEs → `withdraw`, overdose AEs → `overdose`, tolerance AEs → `tolerance`, benefit AEs → `altered`. The `Remove {X}` macros use the matching substring as a regex fallback when source-flag matching fails. Benefit AEs follow `Altered by {Substance}` for uniformity.

### Gate vs save are independent

`scripts/hooks/activity-gating.js` (`preUseActivity`) handles **paraphernalia gating** with a `bypassOnce` set keyed on `activity.id` — when the user clicks "Use anyway" on the blocked dialog, the gate adds the activity ID to the set and re-invokes `activity.use()`. The next `preUseActivity` for that ID consumes the bypass and lets the activity through.

`scripts/hooks/addiction.js` (`postUseActivity`) handles **save-on-use + addiction AE application + bypass consumption**. It does not know or care whether the gate fired — it only checks the substance's own addiction block.

This split means turning `enforceParaphernalia` off disables the gate but leaves addiction automation intact (intentional).

### Admin-type gate (no per-substance `requiredSubtypes`)

The paraphernalia gate keys off the dnd5e Poison subtype on the consumable (`item.system.type.subtype` ∈ `contact | ingested | inhaled | injury`) — substances do **not** carry a `requiredSubtypes` list. Paraphernalia items advertise an `appliesTo` array of admin types in their flag block; the gate passes when the actor owns at least one ready paraphernalia whose `appliesTo` includes the substance's admin. `scripts/data/admin-match.js` `actorSatisfiesAdmin(owned, admin)` is the pure helper; `scripts/hooks/activity-gating.js` is the Foundry wrapper.

Paraphernalia readiness comes from `scripts/data/references.js` `inspectParaphernaliaItem(item)` — checks the equipped/attuned/uses-remaining state per the item's flag block. Authoring of `appliesTo` happens on the Details-tab "Paraphernalia Properties" fieldset as admin-type checkboxes.

### Save bypass lookup

`scripts/data/modifier-pipeline.js` `consumeBypassIfAvailable(actor, substance)`:

1. Reads the substance's admin from `system.type.subtype` (same source the gate uses).
2. Walks `actor.appliedEffects` for AEs whose `flags[MODULE_ID].modifier` block has `kind: "bypass"`. Resolves each AE's source item via `effect.origin`; if the source is paraphernalia, requires its `appliesTo` to include the admin.
3. Composes contributors via `pickBypassResolution`: `auto-pass > advantage > +N`. Within `auto-pass` / `advantage`, deterministic ascending-by-AE-id picks one. Within `+N`, ALL eligible AEs contribute and their `bonus` values sum.
4. For each contributing AE whose source item has a `system.uses` config, increments `system.uses.spent` by 1.

Bypass-granting paraphernalia must satisfy the gate's `appliesTo` for the substance's admin — the bypass isn't a free aura. Per-day uses ride on dnd5e's native `system.uses.recovery = [{ period: "day", type: "recoverAll" }]`; we don't write our own recovery hook.

### Long-rest handling is GM-arbitrated

The `dnd5e.preRestCompleted` handler in `scripts/hooks/long-rest-abstain.js` (Phase 2: Abstain dialog → Wis Abstain Check → Con Withdrawal Save → withdrawal AE apply) and the `deleteActiveEffect` cleanup in `scripts/hooks/withdrawal-cleanup.js` both early-return unless `game.users.activeGM === game.user`. This is the same single-arbiter pattern Foundry uses for other "exactly one client should run this" cases. Don't add per-actor-owner logic to either hook.

### Optional-integration detection is presence-only

`scripts/integrations/index.js` `isActive(id)` is `game.modules.get(id)?.active === true`. No version negotiation, no API calls. DAE-required detection (`scripts/integrations/dae.js` `aeRequiresDae(effect)`) is **per-AE** — scans `effect.changes` for DAE-only modes — not item-level. Don't reintroduce an item-level `requiresDae` flag check; it's been removed.

As of v0.5.1, **`dae`, `midi-qol`, and `tokenmagic` are declared `relationships.requires`** in `module.json` — Foundry refuses to activate the module when any are missing. The `KNOWN_INTEGRATIONS` "missing modules" notice list intentionally drops `dae` and `midi-qol`; `tokenmagic` stays in the list only because the `tmfxIntegration` world setting is still a per-world visuals opt-out, even though TMFX itself is required. Do not add fallback paths that assume any of these three could be absent at runtime.

### dnd5e ItemSheet5e has two independent editability signals

`app.isEditable` reflects **ownership permission only** (Foundry document-level). The pencil-icon view/edit toggle drives a **separate** signal, `app._mode` (`PLAY=1`, `EDIT=2`). Effective editability requires **both** to agree. dnd5e's own `_disableFields()` runs at `_onRender` when `_mode === PLAY` but only walks dnd5e's own fields — our Details-tab injection runs after dnd5e finishes, so we have to repeat the resolution ourselves.

`scripts/data/sheet-mode.js` `resolveSheetEditable({ isEditable, mode })` is the pure resolver; `lockInjectedFields(root)` in `scripts/ui/details-tab.js` mirrors dnd5e's `_disableFields` selector (INPUT/SELECT/TEXTAREA/BUTTON/DND5E-CHECKBOX/COLOR-PICKER/...) and runs after every injection site. **Never gate Details-tab injection on `isEditable` alone** — that was the v0.8.3 → v0.8.7 regression class. If dnd5e ever renumbers `ItemSheet5e.MODES`, `test/unit/sheet-mode.test.mjs` breaks on purpose so the resolver can be updated before users hit it.

### TMFX integration is DAE-driven, not a custom hook

The TMFX (Token Magic FX) overlay on `Altered by *` AEs is dispatched via DAE's `macro.tokenMagic` Active Effect Change mode — **we do not ship a TMFX-aware hook**. The pattern:

- `scripts/integrations/tmfx.js` `registerTmfxPresets()` runs at `ready` and registers a 3×3 palette of presets (setting × category) into TMFX's `tmfx-main` library via `TokenMagic.addPreset({ name, library: "tmfx-main" }, params, /* silent */ true)`. Names are `fishut-tmfx-{setting}-{category}` (e.g. `fishut-tmfx-fantasy-stimulant`). `addPreset` is **first-write-wins** on `{name, library}` collision (it warns and returns false), so the registration loop calls `deletePreset` first to make re-registration idempotent and let us push tuning updates without churning preset names. Gated on `game.user.isGM` (preset registry is a world setting) and `isIntegrationEnabled("tokenmagic")`. TMFX binds `globalThis.TokenMagic` inside its own `ready` handler; if our `ready` runs first we defer to `canvasReady` (which fires strictly after every module's `ready` work). A diagnostic helper `verifyTmfxPresets()` is exposed at `module.api.integrations.verifyTmfxPresets` — returns `{registered, missing}` so a GM can triage from the console.
- The substance's benefit AE (e.g. `Altered by Coalshade Powder`) carries a Change row with `key: "macro.tokenMagic"`, `mode: 0` (CUSTOM), `value: "<preset-name>"`. The CUSTOM mode is the implicit "this AE needs DAE" signal that `aeRequiresDae` already detects. Filter params are validated against TMFX 0.7.6.3+; **unknown params are silently ignored at construction time**, so silently-misnamed authoring (e.g. `amplitude` on `wave`) renders with default uniforms and looks like nothing happened — when adding a new filter, cross-check param names against the TMFX filter source.
- DAE forwards `change.value` verbatim to `TokenMagic.addFilters(token, value)` on apply and removes the matching filter on remove. TMFX overwrites each param's `filterId` with the preset name during registration, so add/remove key cleanly off the same string.
- There is no Details-tab TMFX selector and no `flags[…].tmfx` / `flags[…].tmfxFilterParams` block. Authoring happens directly on the AE's Changes table (Foundry's standard AE editor) — same surface authors already use for any other AE Change.

Why a preset library and not a compendium of macros: DAE's `macro.execute` keypath does name-only lookup against `game.macros` (the world directory), not UUID resolution against compendia, so an earlier compendium-macro design silently no-op'd. `macro.tokenMagic` sidesteps the macro indirection entirely.

When adding a new substance with TMFX visuals, append a `macro.tokenMagic` Change row to its benefit AE with `value` set to one of the registered preset names, or to a user-authored preset registered separately.

### Withdrawal vignette is an authored AE Change

The per-owner CSS withdrawal vignette (red screen-edge bloom mounted to `#interface`) reads its color from `actor.flags.substances-and-paraphernalia.vignetteColor`. That flag is set by an AE Change row on the **withdrawal AE** itself — `key: "flags.substances-and-paraphernalia.vignetteColor"`, `mode: 5` (OVERRIDE), `value: "<#hex>"`, `priority: 20`. No color-inheritance step at apply time; the color rides on the AE.

Each shipped substance carries an authored withdrawal AE template in its item's `effects` array (matched into the addiction system via `flags[…].withdrawal.effectIds`). Authors who want a custom vignette color hand-edit the Change row's `value` on the template; `applyWithdrawalEffect` clones the template onto the actor when the addiction lands. The default fallback template (built by `buildDefaultWithdrawalTemplate` when an item has no `effectIds`) carries `#a02020`.

Note: the addiction AE already carries the `poisoned` status — the withdrawal AE deliberately does not, because `validate-content` warns on the duplicate. Withdrawal AEs ship with `statuses: []`.

### Withdrawal duration

Withdrawal duration is authored as `withdrawal.duration.value` + `withdrawal.duration.unit` (`minutes | hours | days | weeks | months`, with months = 30 days). `scripts/data/withdrawal-duration.js` `durationToSeconds(value, unit)` is the pure converter (testable without Foundry globals — see `test/unit/withdrawal-duration.test.mjs`). The seconds value rides on the applied AE's `duration`; **Times-Up** (bundled with DAE; both required) removes the AE at expiry, and `scripts/hooks/withdrawal-cleanup.js` clears the matching actor flag entry on the resulting `deleteActiveEffect`. We do not ship a rest-decrement counter and withdrawal does not scale against Constitution — Con only gates onset via the Withdrawal Save DC.

### Public API surface

`game.modules.get("substances-and-paraphernalia").api` exposes `schema`, `flagSchema`, `references`, `requirements`, `addiction`, `saveBypass`, `integrations`. When adding a new public capability, expose it here.

### Pure-function discipline

`test/unit/*` runs in plain Node — **no Foundry globals**. Anything imported under unit tests must be importable without `game`, `Hooks`, `ui`, etc. existing. When adding logic that needs these, split: pure helper in `scripts/data/*` (testable), Foundry-coupled wrapper in `scripts/hooks/*` (exercised manually in a live world).

### Localization

All user-facing strings go through `game.i18n.localize(key)` / `format(key, args)` against `lang/en.json`. Key prefix is `FISHUT.*`. There's no fallback machinery — a missing key renders as the literal key string at runtime, so verify in a live world after adding strings.

**Prefix-collision invariant:** Foundry runs `lang/en.json` through `foundry.utils.expandObject`, which throws `Cannot use 'in' operator to search for '<child>' in <leaf>` when any key is a strict dotted prefix of another key — and the throw aborts the entire file load (every `FISHUT.*` lookup falls back to the literal key string). `test/unit/details-tab-lang-keys.test.mjs` asserts that no key is a strict dotted prefix of another. If you add `FOO.Bar` and want `FOO.Bar.minutes` underneath it, rename the leaf to `FOO.Bar.Label` first.

## Memory + roadmap context

- `ROADMAP.md` is the post-v0.2 backlog. **Schema migration framework is explicitly out of scope** — sheet-level rendering with default-on-missing flag reads is the migration path. Don't propose document-level migrators without an explicit ask.
- Authoring lives on the dnd5e item-sheet **Details tab** (`scripts/ui/details-tab.js` + `templates/details-tab/*.hbs`). The legacy 3-dot-menu form was deleted in v0.3; don't reintroduce it.
- Module compendium pack ownership ships as `PLAYER: OBSERVER, ASSISTANT: OWNER` intentionally. Don't propose downgrading.
- Gating dialogs and override buttons are visible to all users (no GM-only paths).
- Prefer baked-in behavior over world settings — don't ship a setting whose off-state nobody actually wants.
