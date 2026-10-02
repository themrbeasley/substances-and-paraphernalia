# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A FoundryVTT V14 / dnd5e 5.3.x module that adds illicit substances + paraphernalia, a `preUseActivity`-time gate that blocks consumption when required gear isn't ready, and a `postUseActivity`-time addiction loop with paraphernalia-granted save bypasses. Pre-1.0; current is v0.10.0, the release candidate (Foundry V14 only; v1.0 is the same code after table play). Hosted on GitHub only, never on the Foundry registry. Clean breaks preferred over migration shims (no shipped users).

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

`npm run test:unit` lists files explicitly (not a glob); when adding a new `test/unit/*.test.mjs`, add it to the script in `package.json` or it won't run in CI.

`packs/` and `node_modules/` are gitignored. `_source/` is the source of truth for compendium content; `packs/` is built from it and is what Foundry reads at runtime.

## Release flow

Tag-driven. Pushing a `v*` tag fires `.github/workflows/release.yml`, which:

1. Runs the release-docs check (`tools/check-release-docs.mjs`: a `## [X.Y.Z]` CHANGELOG section and an `X.Y.Z` mention in ROADMAP.md), then lint + validate + unit tests + pack.
2. Runs `tools/prepare-release.mjs` to patch `module.json`: sets `version` from the tag, sets `download` to the per-tag asset URL, leaves `manifest` pointing at `releases/latest/download/module.json`.
3. Builds `module.zip` and creates a GitHub release with `module.json` + `module.zip` attached.

The in-repo `module.json` keeps both `manifest` and `download` pointed at `releases/latest/download/*`; the release workflow rewrites `download` per tag so `module.json` always installs the version that owns it. **Don't commit a version-specific `download` URL**: the workflow handles it.

Before tagging, update CHANGELOG.md and ROADMAP.md for the version and run `npm run check:release`; the release workflow runs it too and stops without them.

CI (`.github/workflows/ci.yml`) runs lint + validate + unit tests + pack on every push and PR. No release on CI.

The GitHub Wiki tab is published by hand at each release, not by CI (there is no wiki token). After the tag, clone `themrbeasley/substances-and-paraphernalia.wiki.git` (add `-c core.longpaths=true` on Windows), replace its pages with `docs/wiki/*.md` so pages removed from the repo leave the wiki too, commit, and push after the user confirms. Publish only at a release, so the wiki matches the installed version.

If a tag/release pair ends up stale (e.g. tag pushed before a PR landed), recover with `gh release delete vX.Y.Z --yes --cleanup-tag` (which drops both the release and the remote tag), then `git tag -a vX.Y.Z <sha> -m "..."` and `git push origin vX.Y.Z` to re-fire the workflow.

## Architecture

### One init pipeline

`scripts/module.mjs` is the entry point. The flow is:

- `init` hook: register settings, register the `preUseActivity` gate, register the addiction hooks (`postUseActivity` + `dnd5e.preRestCompleted`), register the dose-marker listener (`registerDoseOthers`), register the dnd5e Details-tab item-sheet injection.
- `ready` hook: run migrations (currently a no-op, with an empty `MIGRATORS` array), publish `game.modules.get(MODULE_ID).api`, notify GMs of missing optional integrations.

Adding a new hook means adding a `register*` call in `module.mjs` and a corresponding `Hooks.on(...)` inside the new module.

### Schema-as-data

`scripts/data/schema.json` is the single source of truth for:

- The legal values of `kind`, `category`, `setting`, `administration`, etc.
- Localization key paths for those enums (`labelKey` field).
- The schema version number that goes into `flags.schemaVersion`.

`scripts/config.js` fetches `schema.json` at module load and exports frozen constants. **Don't hardcode enum values in JS**: read them from `SCHEMA` / use `labelKey()`.

Paraphernalia subtypes are an exception: the legal list is **runtime-composed** by `scripts/data/paraphernalia-subtypes.js` `getEffectiveParaphernaliaSubtypes()` (built-ins from `SCHEMA.paraphernalia.subtypes` + custom entries from the `customParaphernaliaSubtypes` world setting, written by the Manage Subtypes settings menu). Authoring code, the Details-tab select, and `validate-content.mjs` all call the helper; never read `SCHEMA.paraphernalia.subtypes` directly.

### Three-layer data model

1. **Item flags** (the canonical source). `scripts/data/flag-schema.js` is the only place that reads/writes `flags["substances-and-paraphernalia"]`. Every other module talks to flags through these accessors.
2. **Actor flags** (`flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { appliedAt, endsAt }`): canonical state for an active withdrawal window on a given actor. It means "in withdrawal" and nothing else: "addicted" is the Addiction effect itself (`getAddictedSubstanceIds`). `appliedAt` and `endsAt` are ISO timestamps; `endsAt` is derived from the AE's authored duration at apply time.
3. **Active Effects on the actor**: UI mirror of the actor flag. Applied addiction and withdrawal AEs carry `flags["substances-and-paraphernalia"].sourceSubstanceId = <itemId>` so callers can match the AE back to its substance. On V14, core only marks an expired withdrawal AE as expired; the user's House Automation module deletes it instead (its "Delete expired effects" switch, on by default), and then `scripts/hooks/withdrawal-cleanup.js` listens on `deleteActiveEffect`: when a substance's last withdrawal effect goes, it clears the matching actor flag entry and, unless the delete came from a relapse (`options.fishutRelapse`), removes the substance's Addiction effects. Finishing withdrawal ends the addiction. We do not poll or tick; the flag entry and AE come up and go down together.

### AE naming contract

AE names **must contain** the relevant substring (case-insensitive): addiction AEs → `addict`, withdrawal AEs → `withdraw`, overdose AEs → `overdose`, tolerance AEs → `tolerance`, benefit AEs → `altered`. The `Remove {X}` macros use the matching substring as a regex fallback when source-flag matching fails. Benefit AEs follow `Altered by {Substance}` for uniformity. The dose marker is the exception: an effect whose name contains `dose` or `dosed` must carry `aeRole: "dose"` (the validator errors otherwise), and the runtime finds the marker by role only, with no name fallback.

### Gate vs save are independent

`scripts/hooks/activity-gating.js` (`preUseActivity`) handles **paraphernalia gating** with a `bypassOnce` set keyed on `activity.id`: when the user clicks "Use anyway" on the blocked dialog, the gate adds the activity ID to the set and re-invokes `activity.use()`. The next `preUseActivity` for that ID consumes the bypass and lets the activity through.

The gate's two checks look at the activity, not just the drug (`onPreUseActivity`). The gear check applies only to an activity that doses the user: one that doses others (`dosesOthers`: it lists the dose marker, or places a cloud with `regionBehavior.enabled`) needs no gear, since spiking a drink needs no pipe. The 0-dose block applies only to an activity that spends the drug (`spendsDrug`): a cloud tick spends nothing, so it keeps firing after the last bomb. A `dnd5e.activityConsumption` listener keeps the last dose at 0 instead of letting dnd5e delete the item, which the cloud also needs (`scripts/data/last-dose.js`).

`scripts/hooks/addiction.js` (`postUseActivity`) runs one dose in order (`runDosePipeline`): relapse check, bypass and addiction save, the high scaled by tolerance, tolerance +1, overdose (which also rolls when the dose lands while this drug's high is still on). It is the only post-use listener for substances, and it skips a dose-others activity. It does not know or care whether the gate fired. Before the pipeline, `spendConsumableGear` looks at the gear on its own and uses up one use (or one item) of ready single-use gear when no ready reusable gear covers the administration (`pickGearToSpend` in `scripts/data/admin-match.js`); after "Use anyway" nothing is ready, so nothing is spent. A `preCreateActiveEffect` listener cancels any other copy of a drug's high (no `sourceSubstanceId`, origin under one of the actor's drugs; `isStrayHigh` in `scripts/data/prior-high.js`). The pipeline and the drag dialog's "Altered" choice pick a drug's highs the same way (`findAlteredTemplates`, same file), so neither picks up the dose marker.

This split means turning `enforceParaphernalia` off disables the gate and gear spending but leaves addiction automation intact (intentional).

### Dose others: the dose marker

Each drug carries one extra effect, the dose marker (`aeRole: "dose"`, no changes, not transferred; `scripts/data/dose-marker.js`). A dose-others activity lists it as its effect. Whatever puts it on a creature (Midi after a failed save or a hit, a plain targeted use, dnd5e's Apply button) delivers the dose, so the module never needs to know how it landed. A second `preCreateActiveEffect` listener, `onPreCreateDoseMarker` in `scripts/hooks/dose-others.js`, returns `false` at once (Foundry only cancels on an immediate `false`) and starts `doseCreature` without awaiting it. It finds the drug from `flags.dae.activity`, else the effect's origin (`drugUuidFrom`; under concentration Midi sets the origin to the concentration effect).

It runs on the client that creates the marker. DAE creates it on the GM's client for a creature the user doesn't own, so the addiction save rolls on the GM's screen, and with no GM online nothing happens. The dose runs against the creature's own copy of the drug (same id, else same name, else an empty 0-dose copy that keeps the compendium source, so a later drop stacks onto it; `findOwnCopy`, `emptyCopyData`), because tolerance, withdrawal and the Long Rest all key on the creature's own copy. `runDosePipeline(actor, item, { forced: true })` skips the creature's own save-bypass gear.

The user isn't dosed: every other activity on a drug still doses the user, and the Long Rest relapse uses `firstSelfDoseActivity`, not simply the first activity. `module.api.dose.doseCreature` is the public entry.

A dose-others attack sets `otherActivityId: "none"`; otherwise Midi pairs it with the drug's "Use" and a hit doses the attacker too (the validator errors without it).

The gas bomb only places the cloud: a utility activity with Midi's `regionBehavior`, no save and no marker, and an activity with `regionBehavior.enabled` counts as dosing others. The cloud's automation-only "Breathe the cloud" save lists the marker and does every dose, including the entry rule Foundry fires for every creature already inside when Midi attaches the behavior (a save on the bomb would make them save twice). The bomb sets `excludeSource: true`, so the cloud skips the thrower; the tick sets `confirmTargets: "never"`, so it never asks to confirm targets.

Once per turn: a cloud tick (an activity that spends nothing) and another dose of the same drug land on a creature only once per turn (`doseTurn`: combat round and turn, else world time; `doseLands`); two direct doses both land. A dropped dose whispers the GM. Midi's own `oncePerTurn` works only in combat and fails for player tokens, which is why the module keeps its own record. That record is the per-client `lastDose` map, so a dose made on one client and a tick on another aren't deduped.

### Admin-type gate (no per-substance `requiredSubtypes`)

The paraphernalia gate keys off the dnd5e Poison subtype on the consumable (`item.system.type.subtype` ∈ `contact | ingested | inhaled | injury`). Substances do **not** carry a `requiredSubtypes` list. Paraphernalia items advertise an `appliesTo` array of admin types in their flag block; the gate passes when the actor owns at least one ready paraphernalia whose `appliesTo` includes the substance's admin. `scripts/data/admin-match.js` `actorSatisfiesAdmin(owned, admin)` is the pure helper; `scripts/hooks/activity-gating.js` is the Foundry wrapper.

Paraphernalia readiness comes from `scripts/data/references.js` `inspectParaphernaliaItem(item)`: checks the equipped/attuned/uses-remaining state per the item's flag block. Authoring of `appliesTo` happens on the Details-tab "Paraphernalia Properties" fieldset as admin-type checkboxes.

### Save bypass lookup

`scripts/data/modifier-pipeline.js` `consumeBypassIfAvailable(actor, substance)`:

1. Reads the substance's admin from `system.type.subtype` (same source the gate uses).
2. Walks `actor.appliedEffects` for AEs whose `flags[MODULE_ID].modifier` block has `kind: "bypass"`. Resolves each AE's source item from `effect.parent` (item-transferred effects), falling back to `effect.origin`; if the source is paraphernalia, requires its `appliesTo` to include the admin.
3. Composes contributors via `pickBypassResolution`: `auto-pass > advantage > +N`. Within `auto-pass` / `advantage`, deterministic ascending-by-AE-id picks one. Within `+N`, ALL eligible AEs contribute and their `bonus` values sum.
4. For each contributing AE whose source item has a `system.uses` config, increments `system.uses.spent` by 1.

Bypass-granting paraphernalia must satisfy the gate's `appliesTo` for the substance's admin; the bypass isn't a free aura. Per-day uses ride on dnd5e's native `system.uses.recovery = [{ period: "day", type: "recoverAll" }]`; we don't write our own recovery hook.

### Long-rest handling runs on the resting client

The `dnd5e.preRestCompleted` handler in `scripts/hooks/long-rest-abstain.js` runs on the client that performs the rest: dnd5e calls that hook locally, on exactly one client (the player's for their own rest or an accepted group rest request, the GM's for a GM-run rest), and that client owns the actor. The `deleteActiveEffect` cleanup in `scripts/hooks/withdrawal-cleanup.js` fires on every client, so it early-returns on every client but the active GM's; with no GM online the actor's owners run it (a non-owner's write would fail with an error toast), so a player can still recover. Its recover / relapse / wait decision is the pure `scripts/data/recovery.js` `recoveryAction`. Don't add a GM check to the rest hook: player rests would never reach the Withdrawal Choices.

### Optional-integration detection is presence-only

`scripts/integrations/index.js` `isActive(id)` is `game.modules.get(id)?.active === true`. No version negotiation, no API calls. DAE-required detection (`scripts/integrations/dae.js` `aeRequiresDae(effect)`) is **per-AE** (it scans `effect.changes` for DAE-only modes), not item-level. Don't reintroduce an item-level `requiresDae` flag check; it's been removed.

As of v0.5.1, **`dae`, `midi-qol`, and `tokenmagic` are declared `relationships.requires`** in `module.json`; Foundry refuses to activate the module when any are missing. The `KNOWN_INTEGRATIONS` "missing modules" notice list intentionally drops `dae` and `midi-qol`; `tokenmagic` stays in the list only because the `tmfxIntegration` world setting is still a per-world visuals opt-out, even though TMFX itself is required. Do not add fallback paths that assume any of these three could be absent at runtime.

### dnd5e ItemSheet5e has two independent editability signals

`app.isEditable` reflects **ownership permission only** (Foundry document-level). The pencil-icon view/edit toggle drives a **separate** signal, `app._mode` (`PLAY=1`, `EDIT=2`). Effective editability requires **both** to agree. dnd5e's own `_disableFields()` runs at `_onRender` when `_mode === PLAY` but only walks dnd5e's own fields; our Details-tab injection runs after dnd5e finishes, so we have to repeat the resolution ourselves.

`scripts/data/sheet-mode.js` `resolveSheetEditable({ isEditable, mode })` is the pure resolver; `lockInjectedFields(root)` in `scripts/ui/details-tab.js` mirrors dnd5e's `_disableFields` selector (INPUT/SELECT/TEXTAREA/BUTTON/DND5E-CHECKBOX/COLOR-PICKER/...) and runs after every injection site. **Never gate Details-tab injection on `isEditable` alone**: that was the v0.8.3 → v0.8.7 regression class. If dnd5e ever renumbers `ItemSheet5e.MODES`, `test/unit/sheet-mode.test.mjs` breaks on purpose so the resolver can be updated before users hit it.

### TMFX integration is DAE-driven, not a custom hook

The TMFX (Token Magic FX) overlay on `Altered by *` AEs is dispatched via DAE's `macro.tokenMagic` Active Effect Change mode. **We do not ship a TMFX-aware hook**. The pattern:

- `scripts/integrations/tmfx.js` `registerTmfxPresets()` runs at `ready` and registers a 3×3 palette of presets (setting × category) into TMFX's `tmfx-main` library via `TokenMagic.addPreset({ name, library: "tmfx-main" }, params, /* silent */ true)`. Names are `fishut-tmfx-{setting}-{category}` (e.g. `fishut-tmfx-fantasy-stimulant`). `addPreset` is **first-write-wins** on `{name, library}` collision (it warns and returns false), so the registration loop calls `deletePreset` first to make re-registration idempotent and let us push tuning updates without churning preset names. Gated on `game.user.isGM` (preset registry is a world setting) and `isIntegrationEnabled("tokenmagic")`. TMFX binds `globalThis.TokenMagic` inside its own `ready` handler; if our `ready` runs first we defer to `canvasReady` (which fires strictly after every module's `ready` work). A diagnostic helper `verifyTmfxPresets()` is exposed at `module.api.integrations.verifyTmfxPresets`; it returns `{registered, missing}` so a GM can triage from the console.
- The substance's benefit AE (e.g. `Altered by Coalshade Powder`) carries a Change row with `key: "macro.tokenMagic"`, `type: "custom"`, `value: "<preset-name>"`. The `custom` type is the implicit "this AE needs DAE" signal that `aeRequiresDae` already detects. Filter params are validated against TMFX 0.7.6.3+; **unknown params are silently ignored at construction time**, so silently-misnamed authoring (e.g. `amplitude` on `wave`) renders with default uniforms and looks like nothing happened; when adding a new filter, cross-check param names against the TMFX filter source.
- DAE forwards `change.value` verbatim to `TokenMagic.addFilters(token, value)` on apply and removes the matching filter on remove. TMFX overwrites each param's `filterId` with the preset name during registration, so add/remove key cleanly off the same string.
- There is no Details-tab TMFX selector and no `flags[…].tmfx` / `flags[…].tmfxFilterParams` block. Authoring happens directly on the AE's Changes table (Foundry's standard AE editor), the same surface authors already use for any other AE Change.

Why a preset library and not a compendium of macros: DAE's `macro.execute` keypath does name-only lookup against `game.macros` (the world directory), not UUID resolution against compendia, so an earlier compendium-macro design silently no-op'd. `macro.tokenMagic` sidesteps the macro indirection entirely.

When adding a new substance with TMFX visuals, append a `macro.tokenMagic` Change row to its benefit AE with `value` set to one of the registered preset names, or to a user-authored preset registered separately.

### Withdrawal vignette is an authored AE Change

The per-owner CSS withdrawal vignette (red screen-edge bloom mounted to `#interface`) reads its color from `actor.flags.substances-and-paraphernalia.vignetteColor`. That flag is set by an AE Change row on the **withdrawal AE** itself: `key: "flags.substances-and-paraphernalia.vignetteColor"`, `type: "override"`, `value: "<#hex>"`, `priority: 20`. No color-inheritance step at apply time; the color rides on the AE.

Each shipped substance carries an authored withdrawal AE template in its item's `effects` array (matched into the addiction system via `flags[…].withdrawal.effectIds`). Authors who want a custom vignette color hand-edit the Change row's `value` on the template; `applyWithdrawalEffect` clones the template onto the actor when the addiction lands. The default fallback template (built by `buildDefaultWithdrawalTemplate` when an item has no `effectIds`) carries `#a02020`.

Note: the addiction AE already carries the `poisoned` status; the withdrawal AE deliberately does not, because `validate-content` warns on the duplicate. Withdrawal AEs ship with `statuses: []`.

### Withdrawal duration

Withdrawal duration is authored as `withdrawal.duration.value` + `withdrawal.duration.unit` (`minutes | hours | days | weeks | months`, with months = 30 days). `scripts/data/withdrawal-duration.js` `durationToSeconds(value, unit)` is the pure converter (testable without Foundry globals; see `test/unit/withdrawal-duration.test.mjs`). The seconds value rides on the applied AE's V14 duration (`value` + `units: "seconds"`); core marks it expired, House Automation's "Delete expired effects" switch deletes it, and `scripts/hooks/withdrawal-cleanup.js` clears the matching actor flag entry on the resulting `deleteActiveEffect`. We do not ship a rest-decrement counter.

Abstaining always leads to withdrawal; the Constitution save only decides how long. `withdrawalSeconds(duration, { halved })` gives the authored length, halved on a passed save, and permanent (0) stays permanent. `runAbstainBranch` passes `halved: passed` to `applyWithdrawalEffect`; a blank Withdrawal DC means full length with no save. Finishing withdrawal ends the addiction, so every character can recover.

### Withdrawal bites in combat: the OverTime keep-alive rule

Combat damage from withdrawal is an authored Midi `flags.midi-qol.OverTime` Change row on the withdrawal AE, damage only (`turn=start,damageRoll=1d4,damageType=psychic,label=Withdrawal`). Midi runs it on the GM's client during combat; we ship no tick code. Deleting the last withdrawal effect ends the addiction, so author the effect with no way to remove itself early. `overTimeProblems` in `tools/validate-content-checks.mjs` errors on a row with a save DC and no `saveCount`/`failCount` keep-alive (or a count ending in `-`), on `removeCondition`, `actionSave` and `itemName`. `validate-content` also errors on a DAE special duration, or a DAE stacking policy that deletes the effect (`none`, `noneName`), on a withdrawal AE.

### Tolerance scales numbers, not roll modes

`scripts/data/tolerance.js` `attenuateChangeRows` scales only `add`/`subtract` rows with numeric values (whole numbers round toward zero). dnd5e reads a roll mode only as `add 1` (advantage) or `add -1` (disadvantage), and halving 1 gives 0, so a row whose key ends `.roll.mode` is left alone while the curve is above 0 and zeroed at 0: advantage from a high lasts until tolerance empties it. Midi flag rows are authored as `override`, which is never scaled.

### V14 Active Effect data lives in one helper

`scripts/data/effect-data.js` is the only place that knows V14's AE data shape. `effectChanges(effect)` reads `system.changes`; `prepareEffectPayload(data, { sourceSubstanceId, origin, role, duration })` turns a template's `toObject()` into a create payload: it drops `_id` and `start` (V14 keeps an incoming start), merges our flags, sets `origin`, and sets duration (`undefined` keep, `null` or `<= 0` permanent with `expiry: null`, positive seconds). Every effect the module applies to an actor goes through it (the Details tab's blank-template buttons create item effects directly). Change rows are written with string `type`s and string values; readers accept native values, because V14's converter `JSON.parse`s legacy strings and V14's effect sheet saves values as native JSON. `validate-content` errors on legacy shapes in `_source/`, and ESLint rejects `.changes` outside `system`, legacy duration fields, `CONST.ACTIVE_EFFECT_MODES` and V14-removed globals. Don't add expiry handling here: deleting expired effects is House Automation's job.

**A change row can't add Exhaustion.** A row that writes an Exhaustion level does nothing (true in every dnd5e since 3.0.0), and DAE's status row wipes every level when it ends. A real level would need new code for little gain, so no effect gives Exhaustion; stimulant withdrawal uses plain penalties.

### Public API surface

`game.modules.get("substances-and-paraphernalia").api` exposes `schema`, `flagSchema`, `references`, `addiction`, `dose` (`doseCreature`), `overdose`, `saveBypass`, `tolerance`, `simulateDose`, `integrations`. When adding a new public capability, expose it here.

### Pure-function discipline

`test/unit/*` runs in plain Node: **no Foundry globals**. Anything imported under unit tests must be importable without `game`, `Hooks`, `ui`, etc. existing. When adding logic that needs these, split: pure helper in `scripts/data/*` (testable), Foundry-coupled wrapper in `scripts/hooks/*` (exercised manually in a live world).

### Localization

All user-facing strings go through `game.i18n.localize(key)` / `format(key, args)` against `lang/en.json`. Key prefix is `FISHUT.*`. There's no fallback machinery; a missing key renders as the literal key string at runtime, so verify in a live world after adding strings.

**Prefix-collision invariant:** Foundry runs `lang/en.json` through `foundry.utils.expandObject`, which throws `Cannot use 'in' operator to search for '<child>' in <leaf>` when any key is a strict dotted prefix of another key, and the throw aborts the entire file load (every `FISHUT.*` lookup falls back to the literal key string). `test/unit/details-tab-lang-keys.test.mjs` asserts that no key is a strict dotted prefix of another. If you add `FOO.Bar` and want `FOO.Bar.minutes` underneath it, rename the leaf to `FOO.Bar.Label` first.

## Memory + roadmap context

- `ROADMAP.md` is short: what shipped by version (one line each, pointing at the CHANGELOG), what's next (v1.0 after table play, then the left-out items), and what's out of scope (the Foundry registry, never; a custom Addicted condition; a migration framework). Update it, and the CHANGELOG, at every release; `npm run check:release` fails without them. **Schema migration framework is explicitly out of scope**: sheet-level rendering with default-on-missing flag reads is the migration path. Don't propose document-level migrators without an explicit ask.
- Authoring lives on the dnd5e item-sheet **Details tab** (`scripts/ui/details-tab.js` + `templates/details-tab/*.hbs`). The legacy 3-dot-menu form was deleted in v0.3; don't reintroduce it.
- Module compendium pack ownership ships as `PLAYER: OBSERVER, ASSISTANT: OWNER` intentionally. Don't propose downgrading.
- Gating dialogs and override buttons are visible to all users (no GM-only paths).
- Prefer baked-in behavior over world settings; don't ship a setting whose off-state nobody actually wants.
