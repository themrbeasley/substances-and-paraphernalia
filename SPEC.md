# Substances and Paraphernalia — v0.3 → v1.0 Spec

## Context

v0.2 shipped: addiction loop, paraphernalia-granted save bypass, 3-dot authoring form, content invariants, CI, tag-driven release. v0.3 shipped: native Details-tab authoring, AE-flag modifier pipeline, drag-to-inventory dialog, matrix round 1. v0.4 shipped: tolerance auto-stacking, overdose d100, withdrawal-bite picker, voluntary abstain, poisoned-coupling tri-state, simulate-dose, GM Guide → wiki, `+N` bypass, matrix round 2, three Remove-X macros, Paraphernalia Subtype Manager.

This spec defines the v0.3 → v1.0 forward arc. It supersedes `ROADMAP.md` for the items it covers; `ROADMAP.md` becomes a higher-level themes index after this lands.

The spec absorbs the six existing roadmap themes plus six previously-undocumented features the author wants in this arc. Two further idea clusters (content/narrative and crafting/expansion) are out of scope for this module and have been extracted to a separate companion-module file.

## Objective

Move the module from a working v0.2 core loop to a 1.0-grade release with:

- A native dnd5e item-sheet authoring surface (replaces the 3-dot form).
- A general AE-flag-based modifier pipeline that unifies bypass, tolerance, and future modifiers.
- Rounded mechanics: tolerance, overdose, withdrawal-that-bites, voluntary abstain — each AE-driven and GM-authorable.
- Visual layers (TMFX for altered, CSS vignette for withdrawal) with graceful degradation.
- Documentation moved to a maintainable surface (GitHub wiki).
- A 3×3 setting × category matrix of compendium content with author-friendly tooling.
- Foundry package registry submission at 1.0.

## Release plan

Each release has a single thesis. Slipping a feature out of a release is preferred over stuffing.

| Release | Thesis | Contents |
|---|---|---|
| **v0.3** — *shipped* | Foundation: native sheet + bypass canonicalization | Theme 2 (Details-tab integration; deletes 3-dot form). AE-flag bypass canonicalization (auto-pass + advantage `type`). Drag-to-inventory state-injection dialog. Module-integration settings pattern (groundwork — toggles per recommended module). Theme 6 round 1 (matrix fill). |
| **v0.4** — *shipped* | Mechanics + Wiki + Authoring polish | Tolerance system. Overdose system. Withdrawal-bite (AE picker + content guidance). Voluntary abstain at long rest. Poisoned-coupling tri-state setting. Theme 1 (GM Guide → wiki). Simulate-dose authoring tool. Macro parity (Remove Tolerance/Overdose/Withdrawal). Bypass `type: '+N'`. Theme 6 round 2. Paraphernalia Subtype Manager (user addition, not original spec). |
| **v0.5** | Visuals | Theme 4 (TMFX integration for "Altered" AEs, gated by setting, default-on-if-installed). CSS withdrawal vignette (built-in, hex from AE flag, per-player). JB2A licensing evaluation; if cleared, JB2A added to recommends and used as preferred overlay. Theme 6 round 3. |
| **v0.6** | Advanced bypass + Midi | Bypass `type: 'reroll-on-fail'`. Theme 5 first cut (midi-qol on-use macros for substances; midi-driven overdose adjudication if installed). |
| **v1.0** | Stability + submission | No new features. Bug fixes, content polish, wiki completeness, Foundry package registry submission. |

## Per-feature design

### AE-flag bypass canonicalization (v0.3)

Today, `consumeBypassIfAvailable` walks `requiredParaphernalia` groups and finds bypass-granting paraphernalia. This is hard-coded to a single shipped magic-item pattern.

**New canonical pattern.** Any AE on the actor whose flag block carries `flags.substances-and-paraphernalia.modifier = { kind: "bypass", type, appliesTo, usesPerDay }` is a candidate at consumption time. The existing paraphernalia path becomes a special case: ready paraphernalia grants/maintains such an AE.

Flag shape:
```
flags["substances-and-paraphernalia"].modifier = {
  kind: "bypass",                       // discriminator
  type: "auto-pass" | "advantage" | "+N" | "reroll-on-fail",
  bonus?: number,                       // when type = "+N"
  appliesTo: ["inhaled" | "ingested" | "injected" | ...],
  usesPerDay?: number                   // optional gate
}
```

`scripts/data/save-bypass.js` becomes the modifier-resolution pipeline (rename consideration: `scripts/data/modifier-pipeline.js`). At consumption, it walks all AEs on the actor, collects modifier-flagged ones, filters by `appliesTo` and `kind`, returns the composed result.

**Acceptance criteria.**

- `consumeBypassIfAvailable` reads from AE flags, not from paraphernalia walks. Paraphernalia continues to function (its bypass effect now grants such an AE).
- Quench tests for: AE-on-actor grants bypass; AE without `appliesTo` match doesn't; `usesPerDay` is decremented and re-locked at consumption; multiple bypass AEs compose deterministically (first match by document order).
- Public API documents the flag shape under `api.modifierFlag`.
- Authoring docs explain "Add an AE to your custom item with these flags to grant bypass." Macro fallback for non-AE-comfortable GMs ships in the macro compendium.
- Existing v0.2 example magic item refactored to the new pattern. Behavior identical.

### Drag-to-inventory state injection dialog (v0.3)

When a GM/ASSISTANT-permissioned user drags a substance item onto an actor's inventory (PC, NPC, or vehicle): a dialog asks "Apply effects now? [Altered] [Addicted] [Withdrawing] [Tolerant] [Overdosed] [Decline]." Decline or close → item lands normally. Selection → dialog applies the chosen AE(s) to the actor with substance-author defaults, then the item lands.

Hooks: `dropItemSheetData` (or current dnd5e equivalent), gated on `game.user.isGM || game.user.role === ASSISTANT`. Vehicle-actor support is one extra branch.

**Acceptance criteria.**

- Drag substance to PC sheet inventory → dialog appears for GM, not for player.
- Selecting "Addicted" applies the substance's addiction AE with `restsRemaining` computed from the withdrawal formula.
- Selecting "Decline" → no AEs applied; item lands normally.
- Vehicle actor accepts the dialog without error.
- Quench: dialog renders, decline path no-ops, each option applies the right AE.

### Theme 2 — Details-tab integration (v0.3)

Per existing ROADMAP. Confirmed unchanged; details there. Authoring fields exposed in the Details tab now include: substance fields (Setting, Category, Administration, Save Ability, Save DC, Withdrawal Mod, Addiction Effect picker, Required Paraphernalia editor), paraphernalia fields, and an AE-flag-aware Bypass field on items that grant a bypass via AE.

**Cleanup at the same time.** Delete `scripts/ui/item-settings-form.js` + `templates/item-settings-form.hbs` + the broken `FISHUT.ItemSettings.*` lang keys. Remove the 3-dot header-control hook.

### Tolerance system (v0.4)

A `Tolerance to {Substance}` AE accumulates over time and acts as a multi-direction modifier on consumption.

**Accumulation.** Each successful addiction save applies one stack of Tolerance for that substance.

**Mechanical bites — three knobs on the Tolerance AE flag.**

```
flags["substances-and-paraphernalia"].modifier = {
  kind: "tolerance",
  substanceId: <itemId>,
  attenuateAltered?: { durationFactor, modifierFactor, dropAdvantage },
  addictionDcBump?: number,
  withdrawalAmplify?: { durationFactor, modifierFactor, addDisadvantage }
}
```

At consumption, the modifier pipeline walks all `kind: "tolerance"` AEs for the substance, sums stack effect, applies. Author writes the per-substance per-stack values into the AE.

**Macro parity.** "Remove Tolerance" macro ships in `fishut-illicit-macros`.

**Acceptance criteria.**

- Successful Con save against addiction → Tolerance AE applied (or stack incremented).
- Subsequent consumption → Altered AE attenuated per author's settings.
- Subsequent consumption → addiction save DC bumped.
- Subsequent withdrawal AE → amplified per author's settings.
- Removing Tolerance AE clears all three effects from the next consumption forward.
- Quench tests for each direction.

### Overdose system (v0.4)

Substance-level "X% chance of overdose on use." On hit, applies `Overdosed on {Substance}` marker AE. The AE description (free-text, GM-authored) tells the GM/player what should happen mechanically; outcomes are GM-adjudicated by default. With midi-qol installed (Theme 5, v0.6), automation can be wired through midi's workflow.

**Schema.**

```
flags["substances-and-paraphernalia"].overdose = {
  enabled: true,
  chancePercent: 5,
  description: "Take 1d4 psychic damage on next attack."
}
```

Engine rolls d100 in the post-use hook. On hit: applies the marker AE, posts a chat card with the description and an "Adjudicate" button hint to the GM.

**Macro parity.** "Remove Overdose" macro ships.

**Acceptance criteria.**

- Authored chance = 5%, run consumption 1000 times in a Quench harness → ~50 hits ±tolerance.
- Hit → Overdosed AE applied with author's description visible in AE description.
- No-midi path: chat card appears with the description.
- Midi path (Theme 5): documented but not implemented in v0.4.

### Withdrawal-bite — AE picker + content guidance (v0.4)

Today, the Withdrawal AE is auto-applied with `restsRemaining` set; its mechanical content is whatever the author writes in the AE.

**v0.4 change.** Details-tab adds a "Withdrawal Effect" picker next to the Addiction Effect picker. Author picks an AE on the substance item to use as the withdrawal AE template. Hint text below: *"Don't duplicate poisoned (disadv on attacks/checks). Escalate: exhaustion, disadv on saves, speed reduction, stat penalty."*

**Acceptance criteria.**

- Picker shows AEs on the substance item.
- Saved selection persists in `flags["substances-and-paraphernalia"].withdrawalEffectId`.
- On long rest tick, withdrawal AE template is what authoring picked (current code uses a default; new code respects the picker).
- Hint text renders in the Details tab.
- Macro parity: "Remove Withdrawal" macro ships.

### Voluntary abstain mechanic (v0.4)

While a withdrawal AE is active on an actor, the long-rest dialog (or the post-rest chat) offers an "Abstain this rest" option: Wis save, **DC = 8 + withdrawalMod**. Success → advance withdrawal counter by 2. Fail → normal 1-rest progress, no penalty.

GM-toggleable via setting `voluntaryAbstainEnabled` (default on).

**Acceptance criteria.**

- Long rest while withdrawal AE active → abstain option appears for the player.
- Setting off → option doesn't appear.
- Wis save passes → `restsRemaining` decrements by 2 (clamped at 0, AE removed if 0).
- Wis save fails → normal decrement.
- Unit test on the formula (pure function in `scripts/data/withdrawal.js`).
- Quench test on the dialog flow.

### Poisoned-coupling tri-state setting (v0.4)

Setting key: `addictionPoisonedCoupling`. Tri-state:

- `linked-cascade` (default — current v0.2 behavior). Addiction AE adds poisoned. Removing poisoned cascades to remove addiction (and Altered/Tolerance/Withdrawal end with it).
- `linked-isolated`. Addiction AE adds poisoned. Removing poisoned does NOT remove addiction.
- `independent`. Addiction AE does NOT add poisoned. Removing poisoned has no effect on addiction state.

**Acceptance criteria.**

- All three states observable in a Quench test (apply addiction, run remove-poisoned macro, observe state).
- Setting changes take effect on next addiction-AE application; existing AEs are not retroactively rewritten.

### Trip overlay — visual layer (v0.5)

**Altered → TMFX (token-level).** When the integration setting `tmfxIntegration` is on (default on if `tokenmagic` module is active), the module registers a 3×3 palette of TMFX presets (setting × category — e.g. `fishut-tmfx-fantasy-stimulant`) into the `tmfx-main` library at `ready`. Each substance's Altered AE carries a Change row with `key: "macro.tokenMagic"`, `mode: 0` (CUSTOM), `value: "<preset-name>"` — DAE forwards that value verbatim to `TokenMagic.addFilters(token, value)` on apply and removes the matching filter on remove. The preset name doubles as filterId (TMFX overwrites each param's `filterId` with the preset name during registration). Authoring happens on the AE's Changes table (Foundry's standard surface) — there is no Details-tab TMFX picker and no `flags[…].tmfxFilterParams` block. Authors can override with their own preset name or omit the Change to opt out. No TMFX or DAE → silent no-op (the CUSTOM-mode Change is the implicit "needs DAE" signal that `aeRequiresDae` already detects).

**Withdrawing → CSS vignette (screen-level).** When the Withdrawal AE applies to a token the current player owns, a screen-edge color vignette renders. Hex code from `flags["substances-and-paraphernalia"].vignetteColor` on the AE (or substance, with AE inheriting). Built-in CSS, no external dep.

**JB2A evaluation.** Their free pack is CC BY-NC-SA 4.0 and includes screen overlays. Eval: confirm license compatibility (this module is free; "non-commercial" may apply or not depending on monetization model — the module is gratis but the author runs a Patreon, which needs review). If cleared, JB2A overlays become a "preferred-path" upgrade above the CSS vignette, gated by `jb2aIntegration` setting.

**Acceptance criteria.**

- TMFX installed, Altered AE on owned token → filter visible.
- TMFX uninstalled, Altered AE on owned token → no error, no filter.
- Withdrawal AE on owned token → vignette visible to that player only.
- Other players don't see the vignette for an actor they don't own.
- Settings toggle each integration off → integration becomes inert.

### Module-integration settings pattern (v0.3 onward)

Each external-module integration is gated by a settings toggle. Default: **on if integration module is active, off otherwise.** Setting key pattern: `<integrationId>Integration`, e.g. `tmfxIntegration`, `daeIntegration`, `midiqolIntegration`, `jb2aIntegration`.

The setting exists so users with the integration module installed for unrelated reasons can opt out of substances-and-paraphernalia using it.

### Simulate-dose authoring tool (v0.4)

Header button on substance items: "Simulate dose..." Opens a dialog with knobs (Con mod override, current addiction state, paraphernalia available, etc.). Engine creates a temporary actor (named `__fishut-test-<uuid>__`), runs the activity against it, captures chat output, then deletes the actor.

Cleanup is critical — the temporary actor MUST be deleted on dialog close, on error, on world reload (worldReady hook sweeps any orphaned `__fishut-test-*` actors).

**Acceptance criteria.**

- Dialog opens, runs the activity, shows chat output.
- Test actor deleted on close.
- World reload finds and cleans orphaned test actors.
- Quench test on the round-trip.

### Theme 1 — GM Guide → wiki (v0.4)

Per existing ROADMAP. The in-world journal becomes a single short pointer page; the full guide moves to the GitHub wiki repo. CI link-check on the in-world page (lightweight — fetch the wiki URL, expect 200).

### Theme 5 — Midi on-use macros (v0.6)

Per existing ROADMAP. Substance flag carries `onUseMacro` reference. When midi-qol is active and the integration is enabled, midi runs the macro at the configured workflow phase. Without midi, the flag is ignored. Used principally for damage-on-failed-save substances.

### Bypass type expansion (v0.3 + v0.4 + v0.6)

Theme 3 absorbed into the AE-flag pattern via the `type` discriminator. Implementation order:

- v0.3: `auto-pass`, `advantage`. Both are small at the call site.
- v0.4: `+N`. Adds `bonus` field to the modifier flag.
- v0.6: `reroll-on-fail`. Wraps `actor.rollAbilitySave` to observe and re-roll. Last because it changes post-hook control flow.

`usesPerDay` consumed per consumption attempt, not per re-roll (call-out so it isn't a question at review time).

### Macro parity (v0.4)

Add three macros to `fishut-illicit-macros`: Remove Tolerance, Remove Overdose, Remove Withdrawal. Pattern matches existing Remove Addiction / Remove Altered.

## Commands

No change. `npm run lint`, `npm run validate`, `npm run test:unit`, `npm run pack`, `npm run unpack`, `npm run format`. New `test/unit/*.test.mjs` files added per CLAUDE.md guidance (must be added to `package.json`'s `test:unit` script explicitly).

## Project structure

Additions during the arc:

- `scripts/data/modifier-pipeline.js` — replaces `scripts/data/save-bypass.js` (or rename in place). Generic AE-flag modifier walker.
- `scripts/hooks/drag-to-inventory.js` — handles state injection dialog.
- `scripts/hooks/long-rest-abstain.js` — voluntary abstain dialog.
- `scripts/hooks/overdose.js` — d100 trigger + marker AE application.
- `scripts/data/tolerance.js` — pure tolerance accumulation logic; called from `addiction.js` post-hook.
- `scripts/ui/details-tab.js` — Theme 2 sheet injection (replaces `scripts/ui/item-settings-form.js`).
- `scripts/ui/simulate-dose.js` — authoring tool.
- `scripts/integrations/jb2a.js` — when JB2A clears licensing.
- `templates/details-tab/*.hbs` — partials for the Details-tab sub-sections.
- `styles/withdrawal-vignette.css` — withdrawal vignette CSS.

Deletions during the arc:

- `scripts/ui/item-settings-form.js` (v0.3).
- `templates/item-settings-form.hbs` (v0.3).
- `FISHUT.ItemSettings.*` lang keys (v0.3).
- 3-dot header control registration in `module.mjs` (v0.3).

## Code style

No deviation from CLAUDE.md guidance. Reinforcing call-outs:

- Pure-function discipline: every new mechanic gets a pure helper in `scripts/data/*` testable without Foundry globals; Foundry-coupled wrapper in `scripts/hooks/*`.
- Schema-as-data: new enums (modifier `kind`, `type`, overdose flag) extend `scripts/data/schema.json` with `labelKey` entries. No hardcoded enum values in JS.
- Localization: every new string keyed under `FISHUT.*` in `lang/en.json`. Verify in a live world after adding strings.
- AE naming contract: existing rules apply. New AEs:
  - Tolerance AE name: `Tolerance to {Substance}` (must contain `tolerance` for fallback macro matching).
  - Overdose AE name: `Overdosed on {Substance}` (must contain `overdose`).
  - Withdrawal AE name: `Withdrawing from {Substance}` (must contain `withdraw`).

## Testing strategy

Pattern matches v0.2's split.

**Unit tests** (`test/unit/*.test.mjs`, pure Node, no Foundry globals).

- `modifier-pipeline.test.mjs` — composition rules, deterministic ordering, `appliesTo` filtering.
- `tolerance.test.mjs` — accumulation, three-knob composition.
- `overdose.test.mjs` — chance roll boundary cases.
- `withdrawal.test.mjs` (existing) — extend with abstain DC calculation.
- `poisoned-coupling.test.mjs` — tri-state behavior (uses pure-function wrappers).

Each new file added explicitly to `package.json`'s `test:unit` script.

**Quench tests** (`test/quench/test-suite.mjs`, run inside Foundry).

- Drag-to-inventory dialog flows.
- Long-rest abstain dialog.
- Overdose d100 trigger + AE.
- Tolerance stack accumulation across multiple consumptions.
- Trip overlay TMFX filter apply/remove.
- Withdrawal vignette visibility per ownership.
- Simulate-dose round-trip + cleanup.
- Details-tab field persistence.

**Content invariants** (`tools/validate-content.mjs`).

- Tolerance AE has `flags["substances-and-paraphernalia"].modifier.kind === "tolerance"`.
- Overdose flag block, if `enabled`, has `chancePercent` 1–100 and non-empty `description`.
- Withdrawal AE doesn't impose `disadvantage` on `attack` or `check` (warning, not error — author can override with confirmation).
- AE name contracts (`tolerance`, `overdose`, `withdraw`).

## Boundaries

### Always do

- Read settings via `game.settings.get()` not via cached module-level constants — settings change at runtime.
- Respect the GM-arbiter pattern for `restCompleted` and any new "exactly one client should run this" hooks.
- Surface gating dialogs and override buttons to all users (CLAUDE.md feedback memory).
- Default-on integrations when their module is active and a setting is exposed for opt-out (CLAUDE.md feedback memory: don't ship a setting whose off-state nobody wants).
- Use pure-function helpers in `scripts/data/*` for any logic that needs unit testing.
- Add new lang keys to `lang/en.json` and verify rendering in a live world before merging.

### Ask first

- Adding a new world setting beyond the ones in this spec (`addictionPoisonedCoupling`, `voluntaryAbstainEnabled`, integration toggles).
- Document-level migrators for flag-shape changes — sheet-level rendering with default-on-missing reads is the explicit migration path; framework-level migrators are out of scope per CLAUDE.md and ROADMAP.
- Adding a new external-module dependency to `relationships.recommends`.
- Touching the AE-naming contract (substring rules) — downstream macros depend on it.

### Never do

- Hardcode enum values in JS (`kind`, `category`, `type`, etc.) — always read from `SCHEMA`.
- Add a setting whose off-state has no real use case.
- Re-introduce an item-level `requiresDae` flag — DAE-required detection is per-AE only.
- Downgrade pack ownership from `PLAYER: OBSERVER, ASSISTANT: OWNER` (CLAUDE.md feedback memory).
- Restrict gating dialogs / overrides to GMs only (CLAUDE.md feedback memory).
- Ship withdrawal AEs whose mechanical bite duplicates poisoned (disadv on attacks + checks) — escalate per the content guidance hint.
- Stuff a release beyond its single thesis (Path B principle from this spec — slipping is preferred).

## Out of scope

Two future-companion-module ideas captured in `COMPANION-MODULE-IDEA.md` (separate file at project root, to be moved by author):

1. Module A — Content & Narrative companion (premium): scenarios, encounter tables, dealer NPCs, smuggling/criminal mechanics, recovery arcs, narrative beats.
2. Module B — Expansion + Crafting Integration companion (premium): additional substances/paraphernalia, recipe journals for The Cauldron and Mastercrafted, mixed-substance interactions.

Both companion modules require substances-and-paraphernalia as a base.

Also explicitly out of scope per existing ROADMAP and unchanged by this spec:

- Custom "Addicted" condition (poisoned + AE covers it).
- Foundry package registry submission until v1.0.
- Schema migration framework.

## Verification (end-to-end)

Per-release sign-off:

- All unit tests pass (`npm run test:unit`).
- All Quench tests pass in a fresh world with the release build.
- Content invariants pass (`npm run validate:content`).
- Lint + format clean (`npm run lint`, `npm run format`).
- Live-world manual verification of: any new dialog, any new sheet field, any new AE pattern, any new macro.
- Tag-driven release workflow runs cleanly; published `module.json` + `module.zip` install in a fresh world.
- v1.0 only: Foundry package registry submission accepted.
