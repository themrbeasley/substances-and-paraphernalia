# Roadmap

Post-v0.2 themes for **Substances and Paraphernalia**, ordered as a
working backlog rather than a release schedule. Each theme has enough
shape for a spec/plan pass; numbers and slice boundaries land at spec
time, not here.

v0.2 is shipped: addiction loop, paraphernalia-granted save bypass,
3-dot-menu authoring form, content invariants, CI, tag-driven release
workflow.

---

## Explicitly out of scope

- **Custom "Addicted" condition.** Active Effects + the existing
  Poisoned condition cover this — adding a bespoke condition record
  is a hat on a hat.
- **Foundry package registry submission.** Defer until the module is
  shipped, stable, and in real worlds. Foundry's own guidance prefers
  proven modules at submission time.

---

## Theme 1 — GM Guide refactor (wiki-first)

**Status today.** Single-page in-world journal at
`_source/fishut-journals/gm-guide.json` covering Overview, Addiction
& Withdrawal, Save Bypass & Administration. Maintaining it in the
journal pack means every rev requires a content-pack rebuild and an
in-world re-import for users on existing worlds.

**Direction.** Move the GM Guide to a GitHub wiki. Replace the
in-world journal with a single short page that:

- Names what the module adds to the UI (3-dot menu entry, gating
  dialog, addiction chat lines, withdrawal AE, `Toggle Paraphernalia
  Enforcement` macro).
- Links to the wiki page that mirrors that scope, with screenshots.
- Lists the key world settings that change behavior, with one-line
  guidance per setting.

**Why wiki over in-world.**

- Edits are a `git push` to the wiki repo, not a content-pack rebuild
  + user re-import.
- Screenshots are first-class on the wiki and unwieldy in journal
  HTML.
- Most GMs read documentation at a desktop browser anyway.

**Open questions for spec.**

- Which sections from the current journal stay in-world vs. move to
  the wiki?
- How do we keep the in-world page from rotting (CI link-check?
  manual quarterly pass?).

---

## Theme 2 — Schema migration framework

**Why this matters (justification).**

The v0.2 schema bump was a clean break — users re-import substances
and paraphernalia from compendium and lose any per-actor or
per-world customization they layered on top. That's defensible at
v0.2 because (a) the module is pre-1.0, (b) there were ~no real-world
installations, and (c) the breaking-change CHANGELOG entry was loud.

After 1.0, that posture stops working. A user who has authored ten
of their own substances in their world's items directory cannot lose
that work to a flag-shape revision. Even if their world copies of our
shipped substances are re-importable from compendium, **their own**
items are not — those live in `world.items`, not in `packs/*`.

The existing `scripts/migrations.js` carries an empty `MIGRATORS`
array and a `dataVersion` world setting that tracks the last applied
schema version. The skeleton is right; what's missing is:

- **Per-document version stamps.** Every substance / paraphernalia
  flag block already carries `schemaVersion`. The framework needs to
  read each document's stamp, run only the migrators that bridge
  *that document's* stamp to the world target, and rewrite the
  stamp atomically. World-level `dataVersion` is necessary but not
  sufficient.
- **Idempotent, chainable migrators.** Each migrator is a pure
  `(flagBlock) → flagBlock` function. Running migrator N twice on the
  same document is a no-op. Migrator N-then-N+1 produces the same
  output regardless of intermediate persistence.
- **Read everywhere, write only the GM client.** The migration runs
  during the world's first `ready` after the module updates, on the
  active GM client only (mirroring the addiction long-rest tick's
  `game.users.activeGM === game.user` guard). All other clients see
  the migrated state on their next refresh.
- **Per-document logging + a JSON dump of pre-migration state.**
  Mirror the Remove Addiction macro pattern: whisper the pre-migration
  flag block to the GM as JSON before mutating, so a botched migration
  is recoverable by hand.
- **Unit-testable migrators.** Each migrator imports cleanly under
  Node `node --test` with no Foundry globals. Fixtures live under
  `test/fixtures/migrations/`.
- **The "no document found" path.** First migrator post-1.0 will
  almost certainly need to seed defaults (e.g. add `administration`
  to substances that pre-date it). Framework needs to distinguish
  "missing field" from "explicitly null" and apply defaults only to
  the former.

**Pre-1.0 implication.** We can still break flag shapes pre-1.0
without writing migrators — but each break should land *with* a
migrator that bridges the prior shape, even if MIGRATORS is empty
in the merged version of that PR. That builds the framework
incrementally rather than as a single "migration framework" PR
with no real bridges to test against.

**Open questions for spec.**

- Migrate compendium documents in `packs/*` too, or only world
  documents? (Compendium content is shipped — re-import should be
  the answer; framework probably skips compendium-locked items.)
- AE-flag and actor-flag migration (e.g. `sourceSubstanceId`
  rename if it ever happens) — does the framework own these, or
  do those live in their own migrator class?

---

## Theme 3 — Bypass type expansion

**Status today.** `addictionSaveBypass.type` is reserved for
`auto-pass`, `advantage`, `+N`, and `reroll-on-fail`. Schema accepts
the strings; only `auto-pass` is implemented in
`scripts/data/save-bypass.js` and `scripts/hooks/addiction.js`.

**Direction.**

- **`advantage`** — pass `advantage: true` into `actor.rollAbilitySave`.
  No new chat string needed; the standard 5e save dialog shows the
  advantage state.
- **`+N`** — add a numeric situational bonus to the save roll.
  `usesPerDay` still gates how often the bonus applies. Schema needs
  a `bonus` field (number or formula).
- **`reroll-on-fail`** — observe the rolled result; if it's a fail,
  re-roll once. Probably implemented as a wrapper around
  `actor.rollAbilitySave` rather than a flag passed in.

**Order to implement.** `advantage` is the smallest delta — it's a
single boolean change at the call site. `+N` adds one schema field
and one bonus resolution path. `reroll-on-fail` is the most
intrusive and should be last; it changes the post-hook control flow.

**Open questions for spec.**

- Should `usesPerDay` be consumed on each reroll attempt, or per-use?
  (Per-use is the natural reading; spec should call it out so it's
  not a question at review time.)
- Stacking rules when multiple gate-satisfying paraphernalia each
  grant a different bypass type — current `consumeBypassIfAvailable`
  picks the first match deterministically. Does that change?

---

## Theme 4 — Token Magic FX visual filters

**Status today.** TokenMagic is in `relationships.recommends` but
the module never invokes its API. The integration warning is
surface-only.

**Direction.** Bind a TMFX filter to the **`Altered by {Substance}`**
benefit AE. When the AE is applied, push the filter onto the actor's
token; on AE removal, pop the filter.

**Per-substance defaults.**

- Coalshade Powder → subtle red/orange glow (stimulant).
- Black Lift → motion-blur or speed-trail (performance enhancing).
- Stellar Mist → blue-purple distortion / shader (mind altering).

**Mechanism.** Hook `createActiveEffect` and `deleteActiveEffect`
keyed by `flags.substances-and-paraphernalia.kind === "substance"`
or by AE-name pattern (`Altered by *`). Filter parameters live on
the substance flag block (`tmfx.filterParams`). Defaults are baked
in per substance; authors can override via the 3-dot-menu form.

**Why this is bigger than it looks.**

- TMFX filter parameters are a non-trivial config surface — a
  full filter is a `params` object with dozens of fields.
- The 3-dot menu form needs a TMFX subform that doesn't drown new
  authors. Probably "preset name" with a free-text "raw JSON
  override" escape hatch.
- TMFX may not be active. Hook registration must be guarded by
  `isActive("tokenmagic")`; missing-module path should be a no-op,
  not a warning storm.

**Open questions for spec.**

- Bind to the benefit AE only, or also to the `{Substance}
  Addiction` AE? (Addiction filter would be useful — washed-out,
  greyish — but doubles the per-substance config burden.)
- Per-token vs per-actor — TMFX supports both; pick one.

---

## Theme 5 — Deeper Midi-QoL workflow chaining

**Status today.** When midi-qol is active, our save-on-use
post-hook lets midi own the save dialog (it intercepts
`actor.rollAbilitySave`). The post-hook still observes the result
and applies the addiction AE. No on-use macros, no damage rolls,
no midi-specific feature toggles.

**Direction.** Midi opens up a few automation paths we currently
don't take:

- **On-use macros.** Some substances have side effects beyond an
  AE — e.g. a smokable that imposes 1d4 psychic damage on
  inhalation. Midi's `onUseMacroName` lets the substance run a
  macro at a defined workflow phase.
- **Damage on failed save.** Substances that hurt when the body
  rejects them. Midi's damage chain handles this cleanly; we'd
  configure damage parts on the activity and let midi roll them.
- **Saves with auto-targeting.** For multi-target substances
  (gas grenades, smoke clouds — post-MVP content), midi's
  template-based save targeting is the natural fit.

**Why this is theme 5, not theme 1.** Each midi feature ships a
new substance-flag knob and a new conditional path through the
post-hook. The authoring form (3-dot menu) needs new sections. The
content invariants validator needs new assertions. None of it is
load-bearing for the core loop — the v0.2 loop already works with
midi active or absent.

**Open questions for spec.**

- Which midi features warrant a substance-flag knob vs which the
  author should configure on the activity directly using midi's own
  flags? (The latter is cheaper for us; the former is friendlier.)
- Test plan for midi-active integration tests — Quench under midi
  active, or a separate harness?

---

## Theme 6 — Compendia content expansion (3×3 matrix)

**Status today.** v0.2 ships 7 substances + 5 paraphernalia,
exercising every code path (gating, readiness, automation, bypass,
UUID resolution) but not filling the 3×3 matrix
(setting × category = `{fantasy, modern, sciFi} × {stimulant,
mindAltering, performanceEnhancing}`).

**Direction.** Pace fills over minor releases — 0.3 fills the gaps
in the matrix; 0.4 adds a second example per cell for variety;
0.5 adds setting-flavor paraphernalia (e.g. fantasy
ritual-incense burner, modern pill-cutter, sci-fi neural shunt)
that pair with the new substances.

**Per release — author-driven.**

- One substance per cell minimum.
- Each new substance ships full canonical description, AE pair,
  flag block, and a passing content-invariants assertion.
- Each cell should exercise at least one behavior the existing 7
  don't — empty `requiredParaphernalia`, multi-group `anyOf`,
  consumable-uses-driven readiness, UUID reference, DAE-required
  variant, bypass interaction.

**Why pace this.** Authoring is the bottleneck, not framework
work. Bundling the matrix into a single big PR risks half-finished
content. Pacing also lets users absorb each batch in their own
worlds before the next lands.

**Open questions for spec.**

- Do we want a content-style guide (name conventions, DC ranges,
  WMod ranges per category) checked in alongside the substances,
  or kept in the GM Guide / wiki?
- One substance per cell strict, or do we let the matrix tilt
  toward genres we have more author energy for?

---

## What ships when (rough)

- **0.3** — Theme 1 (wiki refactor) + Theme 6 round 1 (matrix
  fill). Both are content-shaped, not framework-shaped, and can
  ship together.
- **0.4** — Theme 3 (bypass types: `advantage` + `+N`) + Theme 6
  round 2.
- **0.5** — Theme 4 (TokenMagic FX) + Theme 6 round 3.
- **0.6** — Theme 3 finish (`reroll-on-fail`) + Theme 5 first
  cut (on-use macro hook).
- **1.0** — Theme 2 (migration framework) lands on the first
  flag-shape change after 1.0 is set as the stability goal.
  Foundry package registry submission lands here too.

This ordering is editable. Pin nothing in this doc that should be
pinned in a spec.
