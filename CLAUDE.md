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
node --test test/unit/withdrawal-formula.test.mjs
```

`npm run test:unit` lists files explicitly (not a glob) — when adding a new `test/unit/*.test.mjs`, add it to the script in `package.json` or it won't run in CI.

`packs/` and `node_modules/` are gitignored. `_source/` is the source of truth for compendium content; `packs/` is built from it and is what Foundry reads at runtime.

The Quench integration suite at `test/quench/test-suite.mjs` only registers when the [Quench](https://foundryvtt.com/packages/quench) module is active in the running Foundry world. There's no Node-side Quench runner.

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

- `init` hook: register settings, register the `preUseActivity` gate, register the addiction hooks (`postUseActivity` + `restCompleted`), register the dnd5e Details-tab item-sheet injection, conditionally register the Quench suite.
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
2. **Actor flags** (`flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { restsRemaining, appliedAt }`) — canonical state for active addictions on a given actor.
3. **Active Effects on the actor** — UI mirror of the actor flag. The applied addiction AE carries `flags["substances-and-paraphernalia"].sourceSubstanceId = <itemId>` so the long-rest tick can match the AE back to the flag entry. Flag is canonical, AE is presentation; the long-rest tick rebuilds/clears the AE from the flag.

### AE naming contract

AE names **must contain** the relevant substring (case-insensitive): addiction AEs → `addict`, withdrawal AEs → `withdraw`, overdose AEs → `overdose`, tolerance AEs → `tolerance`. The `Remove {X}` macros use the matching substring as a regex fallback when source-flag matching fails. Benefit AEs follow `Altered by {Substance}` for uniformity.

### Gate vs save are independent

`scripts/hooks/activity-gating.js` (`preUseActivity`) handles **paraphernalia gating** with a `bypassOnce` set keyed on `activity.id` — when the user clicks "Use anyway" on the blocked dialog, the gate adds the activity ID to the set and re-invokes `activity.use()`. The next `preUseActivity` for that ID consumes the bypass and lets the activity through.

`scripts/hooks/addiction.js` (`postUseActivity`) handles **save-on-use + addiction AE application + bypass consumption**. It does not know or care whether the gate fired — it only checks the substance's own addiction block.

This split means turning `enforceParaphernalia` off disables the gate but leaves addiction automation intact (intentional).

### Save bypass lookup

`scripts/data/save-bypass.js` `consumeBypassIfAvailable(actor, item)`:

1. Reads `getAdministration(item)` (e.g. `"inhaled"`).
2. Walks `requiredParaphernalia` groups; calls `inspectParaphernalia(actor, ref)` per `anyOf` entry to enumerate ready candidates.
3. Filters to candidates whose `addictionSaveBypass.appliesTo` includes the substance's administration AND have `system.uses.value > 0`.
4. Picks first match (deterministic), decrements `system.uses.spent`, returns `{ bypassed: true, paraphernalia, type }`.

Bypass-granting paraphernalia must be a gate-satisfying paraphernalia for the substance — the bypass isn't a free aura. Per-day uses ride on dnd5e's native `system.uses.recovery = [{ period: "day", type: "recoverAll" }]`; we don't write our own recovery hook.

### Long-rest tick is GM-arbitrated

The `restCompleted` handler in `addiction.js` early-returns unless `game.users.activeGM === game.user`. This is the same single-arbiter pattern Foundry uses for other "exactly one client should run this" cases. Don't add per-actor-owner logic to this hook.

### Optional-integration detection is presence-only

`scripts/integrations/index.js` `isActive(id)` is `game.modules.get(id)?.active === true`. No version negotiation, no API calls. DAE-required detection (`scripts/integrations/dae.js` `aeRequiresDae(effect)`) is **per-AE** — scans `effect.changes` for DAE-only modes — not item-level. Don't reintroduce an item-level `requiresDae` flag check; it's been removed.

### TMFX integration is DAE-driven, not a custom hook

The TMFX (Token Magic FX) overlay on `Altered by *` AEs is dispatched via DAE's `macro.execute` Active Effect Change mode — **we do not ship a TMFX-aware hook**. The pattern:

- The substance's benefit AE (e.g. `Altered by Coalshade Powder`) carries a Change row with `key: "macro.execute"`, `mode: 0` (CUSTOM), `value: "<MacroUuid>"`. The CUSTOM mode is the implicit "this AE needs DAE" signal that `aeRequiresDae` already detects.
- DAE invokes the referenced macro twice: once with `args[0] === "on"` when the AE is applied, once with `args[0] === "off"` when it's removed. The last entry of `args` is a context object with `tokenId` / `actor` / `effectId`.
- The `fishut-illicit-macros` compendium ships a 3×3 palette (setting × category) of TMFX wrappers following that signature. Authors can reference these by UUID, override with their own macro UUID, or omit the macro.execute Change to opt out of TMFX entirely.
- There is no Details-tab TMFX selector and no `flags[…].tmfx` block. Authoring happens directly on the AE's Changes table (Foundry's standard AE editor) — same surface authors already use for any other AE Change.

When adding a new substance with TMFX visuals, append a `macro.execute` Change row to its benefit AE pointing at one of the shipped macros, or at a user-authored macro UUID.

### Withdrawal formula

`restsRemaining = max(withdrawalMod − ConMod, ⌈withdrawalMod/2⌉)`, minimum 1. The `⌈Y/2⌉` term is the **floor clamp** — high-Con characters can never wave off withdrawal entirely. Lives in `scripts/data/withdrawal.js` as a pure function so the unit test can hit it without Foundry globals.

### Public API surface

`game.modules.get("substances-and-paraphernalia").api` exposes `schema`, `flagSchema`, `references`, `requirements`, `addiction`, `saveBypass`, `integrations`. The Quench tests are the canonical consumer — when adding a new public capability, add it here and exercise it from a Quench test.

### Pure-function discipline

`test/unit/*` runs in plain Node — **no Foundry globals**. Anything imported under unit tests must be importable without `game`, `Hooks`, `ui`, etc. existing. When adding logic that needs these, split: pure helper in `scripts/data/*` (testable), Foundry-coupled wrapper in `scripts/hooks/*` (Quench-tested).

### Localization

All user-facing strings go through `game.i18n.localize(key)` / `format(key, args)` against `lang/en.json`. Key prefix is `FISHUT.*`. There's no fallback machinery — a missing key renders as the literal key string at runtime, so verify in a live world after adding strings.

## Memory + roadmap context

- `ROADMAP.md` is the post-v0.2 backlog. **Schema migration framework is explicitly out of scope** — sheet-level rendering with default-on-missing flag reads is the migration path. Don't propose document-level migrators without an explicit ask.
- Authoring lives on the dnd5e item-sheet **Details tab** (`scripts/ui/details-tab.js` + `templates/details-tab/*.hbs`). The legacy 3-dot-menu form was deleted in v0.3; don't reintroduce it.
- Module compendium pack ownership ships as `PLAYER: OBSERVER, ASSISTANT: OWNER` intentionally. Don't propose downgrading.
- Gating dialogs and override buttons are visible to all users (no GM-only paths).
- Prefer baked-in behavior over world settings — don't ship a setting whose off-state nobody actually wants.
