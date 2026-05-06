# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A FoundryVTT V13 / dnd5e 4.x module that adds illicit substances + paraphernalia, a `preUseActivity`-time gate that blocks consumption when required gear isn't ready, and a `postUseActivity`-time addiction loop with paraphernalia-granted save bypasses. Pre-1.0; v0.2 is a clean break from v0.1.

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

## Architecture

### One init pipeline

`scripts/module.mjs` is the entry point. The flow is:

- `init` hook: register settings, register the `preUseActivity` gate, register the addiction hooks (`postUseActivity` + `restCompleted`), register the item-settings 3-dot-menu form, conditionally register the Quench suite.
- `ready` hook: run migrations (currently a no-op — empty `MIGRATORS` array), publish `game.modules.get(MODULE_ID).api`, notify GMs of missing optional integrations.

Adding a new hook means adding a `register*` call in `module.mjs` and a corresponding `Hooks.on(...)` inside the new module.

### Schema-as-data

`scripts/data/schema.json` is the single source of truth for:

- The legal values of `kind`, `category`, `setting`, `administration`, etc.
- Localization key paths for those enums (`labelKey` field).
- The schema version number that goes into `flags.schemaVersion`.

`scripts/config.js` fetches `schema.json` at module load and exports frozen constants. **Don't hardcode enum values in JS** — read them from `SCHEMA` / use `labelKey()`.

### Three-layer data model

1. **Item flags** (the canonical source). `scripts/data/flag-schema.js` is the only place that reads/writes `flags["substances-and-paraphernalia"]`. Every other module talks to flags through these accessors.
2. **Actor flags** (`flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { restsRemaining, appliedAt }`) — canonical state for active addictions on a given actor.
3. **Active Effects on the actor** — UI mirror of the actor flag. The applied addiction AE carries `flags["substances-and-paraphernalia"].sourceSubstanceId = <itemId>` so the long-rest tick can match the AE back to the flag entry. Flag is canonical, AE is presentation; the long-rest tick rebuilds/clears the AE from the flag.

### AE naming contract

Substance addiction AE names **must contain** the substring `addict` (case-insensitive). The `Remove Addiction` macro uses `*addict*` as a fallback when `addictionEffectId` / `sourceSubstanceId` flags are missing. Benefit AEs follow `Altered by {Substance}` for uniformity.

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

### Withdrawal formula

`restsRemaining = max(withdrawalMod − ConMod, ⌈withdrawalMod/2⌉)`, minimum 1. The `⌈Y/2⌉` term is the **floor clamp** — high-Con characters can never wave off withdrawal entirely. Lives in `scripts/data/withdrawal.js` as a pure function so the unit test can hit it without Foundry globals.

### Public API surface

`game.modules.get("substances-and-paraphernalia").api` exposes `schema`, `flagSchema`, `references`, `requirements`, `addiction`, `saveBypass`, `integrations`, `ui`. The Quench tests are the canonical consumer — when adding a new public capability, add it here and exercise it from a Quench test.

### Pure-function discipline

`test/unit/*` runs in plain Node — **no Foundry globals**. Anything imported under unit tests must be importable without `game`, `Hooks`, `ui`, etc. existing. When adding logic that needs these, split: pure helper in `scripts/data/*` (testable), Foundry-coupled wrapper in `scripts/hooks/*` (Quench-tested).

### Localization

All user-facing strings go through `game.i18n.localize(key)` / `format(key, args)` against `lang/en.json`. Key prefix is `FISHUT.*`. There's no fallback machinery — a missing key renders as the literal key string at runtime, so verify in a live world after adding strings.

## Memory + roadmap context

- `ROADMAP.md` is the post-v0.2 backlog. **Schema migration framework is explicitly out of scope** — sheet-level rendering with default-on-missing flag reads is the migration path. Don't propose document-level migrators without an explicit ask.
- The 3-dot-menu item-settings form (`scripts/ui/item-settings-form.js` + `templates/item-settings-form.hbs`) is **scheduled for deletion** in v0.3, replaced by native dnd5e Details-tab injection (Theme 2 in `ROADMAP.md`). Don't extend the form; new authoring fields should land in the planned sheet integration.
- Module compendium pack ownership ships as `PLAYER: OBSERVER, ASSISTANT: OWNER` intentionally. Don't propose downgrading.
- Gating dialogs and override buttons are visible to all users (no GM-only paths).
- Prefer baked-in behavior over world settings — don't ship a setting whose off-state nobody actually wants.
