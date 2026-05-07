# v0.3 Sprint Plan — Foundation: native sheet + bypass canonicalization

## Context

`SPEC.md` defines the v0.3 → v1.0 arc; v0.3 is the next release with thesis **"Foundation: native sheet + bypass canonicalization."** v0.2 already shipped the addiction loop, paraphernalia-granted save bypass, the (now-deprecated) 3-dot authoring form, content invariants, CI, and tag-driven release. v0.3 replaces the 3-dot form with native dnd5e Details-tab integration, generalizes bypass into an AE-flag modifier pipeline, adds a drag-to-inventory state-injection dialog, and fills the first round of the 3×3 setting × category compendium matrix. The integration-settings pattern moves to v0.5 where it actually has consumers. v0.3 is the release that turns the v0.2 prototype into a maintainable foundation for the mechanics work in v0.4–v0.6.

The module is pre-1.0 with no shipped users to migrate; clean breaks are the preferred change shape.

## Architecture decisions (from `SPEC.md`)

- **Modifier pipeline replaces save-bypass.** `scripts/data/save-bypass.js` becomes `scripts/data/modifier-pipeline.js`. At consumption, the pipeline walks every AE on the actor whose `flags["substances-and-paraphernalia"].modifier` block matches `kind: "bypass"` and `appliesTo` includes the substance's administration. Paraphernalia continues to gate consumption at the item level; bypass is now AE-driven.
- **Paraphernalia carry an embedded AE with `transfer: true`.** Foundry's native item→actor transfer copies the AE onto the actor automatically when the paraphernalia is owned, and removes it on drop. No bespoke lifecycle code; the dubious-pipe refactor uses this pattern. `usesPerDay` lives on the source item's native `system.uses` (with `recovery = [{ period: "day", type: "recoverAll" }]`); the AE flag block carries the `usesPerDay` value for the pipeline to read but does not itself store live counts.
- **Composition rule.** When multiple matching AEs are present, prefer the strongest resolution: `auto-pass` > `advantage` > `none`. Engine-level rule, encoded in the pipeline.
- **v0.3 ships `auto-pass` and `advantage` only.** `+N` is v0.4; `reroll-on-fail` is v0.6. Don't anticipate them at the call site beyond a `type` discriminator.
- **Schema-as-data.** Every new enum (`modifier.kind`, `modifier.type`) extends `scripts/data/schema.json` with `labelKey` entries. No hardcoded values in JS.
- **Pure-function discipline.** Composition logic lives in `scripts/data/*` and gets a Node unit test. Foundry-coupled wrappers live in `scripts/hooks/*` and get a Quench test.
- **dnd5e ApplicationV2 only.** Sheet hooks target the V2 architecture in dnd5e 5.2.5; V1 is dead and not back-supported. `module.json` pins `compatibility.verified` to dnd5e 5.2.5.
- **Sheet hook deletes 3-dot form in the same release.** Theme 2 lands fully working before the form, template, and `FISHUT.ItemSettings.*` lang keys are deleted. No half-state.
- **Drag-to-inventory dialog visible to GM/ASSISTANT only**, but the gating dialogs and override paths it builds on remain visible to all users (CLAUDE.md feedback memory).
- **No vehicle-actor handling in v0.3.** A "Living Vessel" actor concept is the right home for substance-affected vessels; that lives in `COMPANION-MODULE-IDEA.md`, not here.

## Dependency graph

```
schema.json (modifier kind/type enums, flagKeys.modifier)
    │
    ├── flag-schema.js (getModifier accessor; AE-side reader)
    │       │
    │       └── modifier-pipeline.js (rename + AE-walk rewrite)
    │               │
    │               ├── addiction.js postUseActivity (reads pipeline result; advantage path)
    │               │
    │               └── dubious-pipe content refactor → embedded AE w/ transfer:true
    │                       │
    │                       └── validate-content.mjs (invariants for AE modifier shape)
    │
    ├── ui/details-tab.js + templates/details-tab/*.hbs (V2 sheet hook)
    │       │
    │       └── delete: ui/item-settings-form.js, templates/item-settings-form.hbs,
    │               FISHUT.ItemSettings.* keys, registerItemSettingsForm() in module.mjs
    │
    └── hooks/drag-to-inventory.js (independent; reads schema + flag-schema)

Theme 6 round 1 content (parallelizable from day 1; touches _source/ only)
```

Bottom-up build order: schema → flag accessor → pipeline → call sites → content. Sheet integration and the drag dialog can run in parallel with the pipeline once the schema is set. Content is independent.

## Phases

### Phase 1 — Foundation (modifier schema + pipeline)

#### Task 1: Extend `schema.json` with modifier enums

**Description.** Add `modifier.kinds` (`bypass` only for v0.3 — `tolerance` and other kinds are out of scope), `modifier.types` (`auto-pass`, `advantage`), and a `flagKeys.modifier = "modifier"` entry. Add corresponding `FISHUT.Modifier.Kind.*` and `FISHUT.Modifier.Type.*` lang keys. The new flag is on AEs, not items, so item `schemaVersion` stays at 2.

**Acceptance criteria.**
- [ ] `SCHEMA.modifier.kinds` and `SCHEMA.modifier.types` import cleanly from `scripts/config.js`.
- [ ] No JS file hardcodes `"bypass"`, `"auto-pass"`, or `"advantage"` outside `schema.json`.
- [ ] `lang/en.json` has `FISHUT.Modifier.Kind.bypass`, `FISHUT.Modifier.Type.autoPass`, `FISHUT.Modifier.Type.advantage`.

**Verification (CI).**
- [ ] `npm run lint && npm run validate && npm run test:unit` clean.

**Dependencies.** None.

**Files.** `scripts/data/schema.json`, `scripts/config.js` (if it explicitly re-exports), `lang/en.json`.

**Scope.** S.

---

#### Task 2: Add `getModifier` AE-side accessor in `flag-schema.js`

**Description.** Add `getModifier(activeEffect)` and a setter for the AE flag block. Mirrors the substance/paraphernalia accessor pattern; reads from `effect.flags["substances-and-paraphernalia"].modifier`. Return shape matches the spec: `{ kind, type, bonus?, appliesTo, usesPerDay? }`. No defaults beyond returning `null` for missing block.

**Acceptance criteria.**
- [ ] `getModifier(ae)` returns `null` when AE has no modifier flag, returns the typed object otherwise.
- [ ] Setter writes to the canonical key (single point of write, per CLAUDE.md three-layer-data-model rule).
- [ ] No other module reads `effect.flags["substances-and-paraphernalia"].modifier` directly.

**Verification (CI).**
- [ ] New unit test `test/unit/modifier-flag-shape.test.mjs` covering accessor round-trip and the null path. Add the file to `package.json`'s `test:unit` script (CLAUDE.md: explicit list, not glob).
- [ ] `npm run test:unit` includes and passes the new file.

**Dependencies.** Task 1.

**Files.** `scripts/data/flag-schema.js`, `test/unit/modifier-flag-shape.test.mjs`, `package.json`.

**Scope.** S.

---

#### Task 3: Rename `save-bypass.js` → `modifier-pipeline.js`; rewrite to walk AEs

**Description.** Rename the file. Replace the current paraphernalia-walking implementation with: enumerate `actor.appliedEffects` (or equivalent), filter to those whose `getModifier(ae)` returns `kind === "bypass"` and whose `appliesTo` includes `getAdministration(item)`, gate by source-item `system.uses.value > 0` if `usesPerDay` is declared. Composition rule: when multiple AEs match, pick the strongest resolution (`auto-pass` > `advantage`); within a tier, deterministic by AE `id`. On match, decrement uses on the AE's source item (read AE `origin`/`parent` to find it). Public API name stays `consumeBypassIfAvailable` for v0.3 (rename in v0.4 if useful).

**Acceptance criteria.**
- [ ] `consumeBypassIfAvailable(actor, substance)` returns `{ resolution: "auto-pass" | "advantage" | "none", source }` (where `source` is the granting AE).
- [ ] Composition: if any matching AE has `type: "auto-pass"`, resolution is `auto-pass` regardless of other matches.
- [ ] Within a tier, selection is deterministic by AE `id`.
- [ ] `usesPerDay` is enforced — when source item's `system.uses.value` is exhausted, the AE no longer matches even if present.
- [ ] All existing call sites (`scripts/hooks/addiction.js`) updated to consume the new return shape; `paraphernalia` field renamed to `source`.

**Verification (CI).**
- [ ] New unit test `test/unit/modifier-pipeline.test.mjs` covers: AE present + `appliesTo` match → `auto-pass`; `appliesTo` mismatch → `none`; `usesPerDay` zero → no match; multiple bypass AEs of mixed types → `auto-pass` wins; only `advantage` AEs → `advantage`; no matching AEs → `none`; tie within tier resolved by `id`.
- [ ] Existing `bypass-match.test.mjs` rewritten or deleted as superseded — don't leave stale tests around.
- [ ] `npm run test:unit` clean.

**Dependencies.** Task 2.

**Files.** `scripts/data/modifier-pipeline.js` (renamed from `save-bypass.js`), `scripts/hooks/addiction.js`, `test/unit/modifier-pipeline.test.mjs`, `test/unit/bypass-match.test.mjs` (delete or replace), `package.json`, public-API export site.

**Scope.** M.

---

#### Task 4: Clean-break refactor of `dubious-pipe.json` to embedded modifier AE

**Description.** **Delete** the item-level `addictionSaveBypass` block from `_source/fishut-illicit-paraphernalia/dubious-pipe.json` outright — pre-1.0 module, no users to migrate, clean break. Add an embedded AE on the item with `transfer: true` so Foundry's native item→actor transfer pipeline auto-applies it on actor pickup and removes it on drop. The AE carries `flags["substances-and-paraphernalia"].modifier = { kind: "bypass", type: "auto-pass", appliesTo: ["inhaled"], usesPerDay: <prof-equivalent> }`. AE name suggestion: `"Dubious Pipe — Bypass"` (any name is fine; the modifier flag — not the name — is what the pipeline keys on). Per-day uses live on the item's native `system.uses` with `recovery = [{ period: "day", type: "recoverAll" }]`; the AE flag's `usesPerDay` is just a declarative value the pipeline reads.

**Acceptance criteria.**
- [ ] Item-level `addictionSaveBypass` block is gone from `dubious-pipe.json`.
- [ ] Embedded AE present with `transfer: true` and the modifier flag block.
- [ ] Item's `system.uses` has a `day`/`recoverAll` recovery entry.
- [ ] `npm run unpack && npm run pack` round-trips cleanly.
- [ ] `validate-content.mjs` updated: paraphernalia with bypass intent is detected via `transfer:true` AE carrying `kind: "bypass"`; the legacy `addictionSaveBypass` shape becomes a hard validation error (no transitional grace).

**Verification (CI).**
- [ ] `npm run validate:content` passes.
- [ ] `npm run pack` clean.
- [ ] Quench: `paraphernalia → AE → bypass` end-to-end test passes — drop the item on a PC, consume an inhaled substance, verify pipeline returns `auto-pass`.

**Dependencies.** Task 3.

**Files.** `_source/fishut-illicit-paraphernalia/dubious-pipe.json`, `tools/validate-content.mjs`, `test/quench/test-suite.mjs`.

**Scope.** S.

---

### Checkpoint A — Foundation

- [ ] `npm run lint && npm run validate && npm run test:unit && npm run pack` all clean.
- [ ] Quench: dubious-pipe + inhaled substance round-trip works (behavior identical to v0.2, mechanism changed).
- [ ] `consumeBypassIfAvailable` no longer reads `requiredParaphernalia` for bypass selection.
- [ ] User hand-tests in a live world before Phase 2 begins.

---

### Phase 2 — Advantage path

#### Task 5: Wire `type: "advantage"` into the addiction save path

**Description.** With the pipeline returning `{ resolution, source }`, `addiction.js` branches: `auto-pass` → save skipped, treated as success; `advantage` → roll with `advantage: true` (dnd5e roll API); `none` → roll normally. `usesPerDay` decrements on the consumption attempt regardless of which branch fires (per spec call-out: "consumed per consumption attempt, not per re-roll").

**Acceptance criteria.**
- [ ] `auto-pass` → save is skipped, treated as success; chat card cites the source AE.
- [ ] `advantage` → save rolls with `advantage: true`; chat card cites the source AE.
- [ ] `none` → save rolls normally.
- [ ] Source-item `system.uses.spent` decrements once per consumption attempt for the resolving AE only.

**Verification (CI).**
- [ ] Unit test extended: pipeline returns the right resolution for each combination.
- [ ] Quench: `advantage`-only AE on actor → roll evaluator receives `advantage: true`; chat card cites the AE.

**Dependencies.** Task 3.

**Files.** `scripts/data/modifier-pipeline.js`, `scripts/hooks/addiction.js`, `test/unit/modifier-pipeline.test.mjs` (extend), `test/quench/test-suite.mjs`.

**Scope.** S.

---

### Phase 3 — Authoring surface (Details-tab integration)

#### Task 6: V2 sheet hook + Details-tab partial scaffolding

**Description.** Create `scripts/ui/details-tab.js` that hooks the dnd5e ApplicationV2 item-sheet render event (verify exact hook name against dnd5e 5.2.5; V1 is not back-supported) and injects a partial into the Details tab when `getKind(item)` is `"substance"` or `"paraphernalia"`. Pin `module.json` `compatibility.verified` to `5.2.5`. Initially render a single read-only "Substances & Paraphernalia" section header with a placeholder; persistence and editable fields land in tasks 7 and 8. Register from `module.mjs` alongside existing `register*` calls.

**Acceptance criteria.**
- [ ] `module.json` `compatibility.verified` is `5.2.5` (or higher if the user upgrades during sprint).
- [ ] V2 item-sheet hook fires; hook name and payload are documented in a code comment in `details-tab.js`.
- [ ] Substance item sheet → Details tab → new section visible with header.
- [ ] Paraphernalia item sheet → same.
- [ ] Non-substance/non-paraphernalia item sheets → no injection, no console noise.

**Verification (CI).**
- [ ] No additional unit/Quench tests for scaffolding alone — scaffolding is exercised via Tasks 7/8 below.
- [ ] `npm run lint && npm run validate` clean.

**Dependencies.** Task 1 (schema).

**Files.** `scripts/ui/details-tab.js`, `templates/details-tab/section.hbs`, `scripts/module.mjs`, `module.json`, `lang/en.json`.

**Scope.** S.

---

#### Task 7: Substance authoring fields in Details tab

**Description.** Render substance authoring fields in the new partial: Setting (select from `SCHEMA.settings`), Category (select), Administration (select), Save Ability + DC (text + number), Withdrawal Mod (number), Addiction Effect picker (select from AEs on the item), Required Paraphernalia editor (the existing UX pattern from the 3-dot form, ported). Persistence: V2 form submission → `setFlag` → re-render. Reuse logic from `scripts/ui/item-settings-form.js` where applicable; **don't delete the form yet** — it's the fallback during this transition.

**Acceptance criteria.**
- [ ] All fields persist round-trip (set → reload sheet → values present).
- [ ] Select fields are localized via `labelKey()`.
- [ ] Required Paraphernalia editor adds/removes refs and persists.
- [ ] Addiction Effect picker lists only AEs on the current item, with a "(none)" option.

**Verification (CI).**
- [ ] Quench: `details-tab-substance-persistence` test asserts each field round-trips through flag-schema accessors.

**Dependencies.** Task 6.

**Files.** `scripts/ui/details-tab.js`, `templates/details-tab/substance-fields.hbs`, `lang/en.json`, `test/quench/test-suite.mjs`.

**Scope.** M.

---

#### Task 8: Paraphernalia authoring fields + AE-flag-aware Bypass field

**Description.** Render paraphernalia fields: Setting, Category (allow `null`/"any"), `paraphernaliaId` (kebab-case validated), `tags` (array editor). Add a Bypass section that surfaces the embedded-AE pattern: when the item has an AE with `getModifier(ae).kind === "bypass"`, show its `type`, `appliesTo`, and `usesPerDay` read-only with a "Manage on Effects tab" link. When no such AE exists, show a "Grant bypass via Active Effect…" button that creates a stub AE with `transfer: true` and the modifier flag pre-filled (this is authoring sugar, not new mechanism).

**Acceptance criteria.**
- [ ] Paraphernalia fields persist round-trip.
- [ ] Bypass section reflects current AE state and updates on AE change (re-render).
- [ ] "Grant bypass…" button creates an AE with `transfer: true` that the modifier pipeline immediately recognizes when the item is owned by an actor.

**Verification (CI).**
- [ ] Quench: `details-tab-paraphernalia-persistence` test.
- [ ] Quench: `grant-bypass-button` test creates the stub AE and confirms its shape.

**Dependencies.** Tasks 4, 6.

**Files.** `scripts/ui/details-tab.js`, `templates/details-tab/paraphernalia-fields.hbs`, `templates/details-tab/bypass-section.hbs`, `lang/en.json`, `test/quench/test-suite.mjs`.

**Scope.** M.

---

#### Task 9: Delete the 3-dot form and its supporting code

**Description.** Once Tasks 6–8 are merged and verified working in a live world (Checkpoint B), delete `scripts/ui/item-settings-form.js`, `templates/item-settings-form.hbs`, the `FISHUT.ItemSettings.*` cluster (~32 keys) from `lang/en.json`, and the `registerItemSettingsForm()` import + call in `scripts/module.mjs`. Drop any unused exports from the public API surface that referenced the form.

**Acceptance criteria.**
- [ ] Files deleted; no remaining imports.
- [ ] `npm run lint && npm run validate && npm run test:unit && npm run pack` clean.
- [ ] Item header in Foundry no longer shows the 3-dot menu entry.
- [ ] `lang/en.json` has zero `FISHUT.ItemSettings.*` keys.

**Verification (CI).**
- [ ] `Grep` for `ItemSettings` and `item-settings-form` across the repo — zero matches.

**Dependencies.** Tasks 6, 7, 8 + Checkpoint B.

**Files.** Deletes: `scripts/ui/item-settings-form.js`, `templates/item-settings-form.hbs`. Edits: `scripts/module.mjs`, `lang/en.json`, public API site.

**Scope.** S.

---

### Checkpoint B — Authoring surface complete

- [ ] All v0.2 authoring flows reachable via Details tab; 3-dot form behavior reproduced.
- [ ] Quench tests for both persistence flows green.
- [ ] User hand-tests authoring of a brand-new substance + paraphernalia from scratch in a live world before Task 9 deletion lands.

---

### Phase 4 — Drag-to-inventory dialog

#### Task 10: `drag-to-inventory.js` hook + state-injection dialog

**Description.** Add `scripts/hooks/drag-to-inventory.js` that listens on the dnd5e 5.2.5 actor-side drop hook (verify exact hook — likely `preCreateItem` on the actor or `dropItemSheetData`; document in code) and, when the dropped item's `getKind` is `"substance"` and the user is GM or `ASSISTANT`, opens a dialog with buttons: Altered, Addicted, Withdrawing, Tolerant, Overdosed, Decline. Tolerant and Overdosed are stubs in v0.3 that show a toast saying "Available in v0.4" — don't apply AEs we don't ship yet. Selecting Addicted applies the substance's addiction AE with `restsRemaining` from the existing `withdrawal.js` formula. Decline = no-op.

No vehicle handling — dialog only opens when the target actor is a `character` or `npc`. Vessels / Living Vessels are out of scope (see `COMPANION-MODULE-IDEA.md`).

**Acceptance criteria.**
- [ ] Drag substance onto PC sheet inventory as GM → dialog appears.
- [ ] Drag as Player → dialog does **not** appear; item lands normally.
- [ ] Selecting Decline → item lands, no AEs.
- [ ] Selecting Addicted → item lands, addiction AE on actor, `restsRemaining` correct.
- [ ] Drag onto vehicle/group actor → no dialog, item lands normally without error.
- [ ] Tolerant/Overdosed buttons show "Coming in v0.4" toast.

**Verification (CI).**
- [ ] Quench: `drag-to-inventory-dialog` test exercises decline path, addicted path, and player-no-show path.

**Dependencies.** Task 1 (schema), pure-function withdrawal (already exists).

**Files.** `scripts/hooks/drag-to-inventory.js`, `templates/drag-to-inventory-dialog.hbs`, `scripts/module.mjs` (register), `lang/en.json`, `test/quench/test-suite.mjs`.

**Scope.** M.

---

### Phase 5 — Theme 6 round 1 content

**What "3×3 matrix" means.** SPEC.md says v1.0 needs a "3×3 setting × category matrix of compendium content." The schema defines **3 settings** (`fantasy`, `sciFi`, `modern`) and **3 categories** (`stimulant`, `mindAltering`, `performanceEnhancing`), so the substances pack should ultimately have ≥1 item in every (setting, category) cell — 9 cells total. (Paraphernalia carries `setting` only, not `category` — it's not part of this matrix and is already adequately covered.) "Round 1" in v0.3 = fill every empty cell once so every cell is non-empty by end of v0.3. Round 2 (v0.4) and Round 3 (v0.5) deepen the matrix with additional items per cell.

**Current substance coverage.**

|  | stimulant | mindAltering | performanceEnhancing |
|---|---|---|---|
| **fantasy** | was-reserve, coalshade-powder | bogwitches-prank | ⬜ EMPTY |
| **sciFi** | ⬜ EMPTY | stellar-mist | ⬜ EMPTY |
| **modern** | ⬜ EMPTY | embergrass | black-lift |

**Round-1 target.** Author one substance for each of the four empty cells:

1. (fantasy, performanceEnhancing) — e.g. an alchemical strength tonic
2. (sciFi, stimulant) — e.g. a spaceport stim-patch
3. (sciFi, performanceEnhancing) — e.g. a combat-reflex injector
4. (modern, stimulant) — e.g. an underground rave pill

Concept names above are placeholders to make the cells concrete; flavor is the author's call.

#### Task 11: Author (fantasy, performanceEnhancing) substance

**Description.** Add `_source/fishut-illicit-substance/<slug>.json` plus its addiction AE entry, lang keys, and folder placement. Closest peer: `was-reserve.json` for fantasy mechanics shape; mirror its `system.uses`, `addiction`, withdrawal, and AE shape.

**Acceptance criteria.**
- [ ] Substance file passes `npm run validate:content`.
- [ ] Addiction AE name contains `addict` (CLAUDE.md naming contract).
- [ ] Lang keys for name + description added under `FISHUT.Content.<slug>.*`.
- [ ] `npm run pack` clean.

**Verification (CI).**
- [ ] `npm run validate:content && npm run pack` clean.
- [ ] Existing addiction-loop Quench tests still pass with the new item present in the pack.

**Dependencies.** None (parallel with Tasks 12–14).

**Files.** `_source/fishut-illicit-substance/<slug>.json`, `lang/en.json`.

**Scope.** S.

---

#### Task 12: Author (sciFi, stimulant) substance

**Description.** Same shape as Task 11. Closest peer: `coalshade-powder.json` (stimulant) for mechanics + `stellar-mist.json` (sciFi) for flavor.

**Acceptance criteria.** Same shape as Task 11.

**Verification (CI).** Same shape as Task 11.

**Dependencies.** None (parallel).

**Files.** `_source/fishut-illicit-substance/<slug>.json`, `lang/en.json`.

**Scope.** S.

---

#### Task 13: Author (sciFi, performanceEnhancing) substance

**Description.** Same shape. Closest peer: `black-lift.json` (performanceEnhancing) for mechanics + `stellar-mist.json` (sciFi) for flavor.

**Acceptance criteria.** Same shape as Task 11.

**Verification (CI).** Same shape as Task 11.

**Dependencies.** None (parallel).

**Files.** `_source/fishut-illicit-substance/<slug>.json`, `lang/en.json`.

**Scope.** S.

---

#### Task 14: Author (modern, stimulant) substance

**Description.** Same shape. Closest peer: `coalshade-powder.json` (stimulant) for mechanics + `embergrass.json` (modern) for flavor.

**Acceptance criteria.** Same shape as Task 11.

**Verification (CI).** Same shape as Task 11.

**Dependencies.** None (parallel).

**Files.** `_source/fishut-illicit-substance/<slug>.json`, `lang/en.json`.

**Scope.** S.

---

### Checkpoint C — Sprint complete

- [ ] All unit tests pass (`npm run test:unit`).
- [ ] All Quench tests pass in a fresh world.
- [ ] `npm run validate:content` clean.
- [ ] `npm run lint && npm run format` clean.
- [ ] User hand-tests the full loop end-to-end: author a new substance + paraphernalia from Details tab, drag onto PC via dialog, consume with bypass.
- [ ] Tag `v0.3.0` → release workflow publishes `module.json` + `module.zip`; install in fresh world succeeds.
- [ ] `ROADMAP.md` updated: v0.3 items struck through; integration-settings pattern moved into v0.5 entry.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `actor.appliedEffects` ordering not deterministic across reloads | Medium — non-deterministic bypass selection within a tier | Sort by AE `id` at the pipeline level rather than relying on iteration order. Document in `modifier-pipeline.js`. |
| Theme 6 content scope creep — author wants to fill all 9 cells in v0.3 | Low — slows the sprint | Strict round-1 budget set in Tasks 11–14; defer round 2/3 explicitly (matches `SPEC.md` release table). |
| `ASSISTANT` role check in drag dialog uses the wrong API | Low | Use `game.user.isGM \|\| game.user.role >= CONST.USER_ROLES.ASSISTANT`. |
| dnd5e 5.2.5 V2 sheet hook signature changes in a future patch | Low — would break Tasks 6–8 | `module.json` `compatibility.verified = 5.2.5`; if user upgrades dnd5e, re-verify hook before bumping. |

## Resolved decisions

1. **Bypass `source` cites the AE label** when no origin item is traceable; chat-card output uses `effect.label` as the displayed source.
2. **Task 9 ships in the same `v0.3.0` tag** as Tasks 6–8. Checkpoint B is a hard gate: if Details-tab integration isn't fully working, the 3-dot form deletion does not ship — which slips the v0.3 tag, not the deletion into v0.3.1.
3. **Round-1 matrix cells specified.** Four substances, one per empty cell — see Phase 5.
4. **Clean break on `dubious-pipe.json`.** Pre-1.0 module, no users to migrate; the `addictionSaveBypass` block is deleted, not transitioned.
5. **No `usesPerDay` storage on the AE itself.** Live counts ride on the source item's native `system.uses`. The AE flag's `usesPerDay` is a declarative value the pipeline reads.
6. **Composition rule: `auto-pass` > `advantage` > `none`.** Encoded in the pipeline.
7. **dnd5e ApplicationV2 only** (5.2.5+). V1 is not back-supported.
8. **No vehicle handling.** Substances-affected vessels become a "Living Vessel" actor in `COMPANION-MODULE-IDEA.md`, not a v0.3 task.
9. **Integration-settings pattern moved to v0.5.** It has no v0.3 consumers; shipping the helper without consumers is overhead.
10. **Manual hand-testing is the user's responsibility,** not a CI step. Verification sections list automated tests only; checkpoints call out where the user should hand-test before proceeding.

## Parallelization notes

After Task 1 lands, the following can run in parallel:
- Tasks 2 → 3 → 4 → 5 (sequential — modifier pipeline chain).
- Tasks 6 → 7 → 8 (sequential — sheet integration chain).
- Task 10 (drag dialog) — independent.
- Tasks 11, 12, 13, 14 (content cells) — independent of all code work and of each other.

Three parallel streams are realistic: pipeline chain, sheet chain, content. The drag dialog slots into whichever stream finishes first. The four content tasks can be split across four sub-agents.
