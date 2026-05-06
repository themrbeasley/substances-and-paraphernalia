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
- **Schema migration framework.** Sheet-level rendering with
  default-on-missing flag reads is the right "migration" path for
  this module — when we change how items render, the new code reads
  whatever's there and falls back to defaults. Documents aren't
  touched. World items GMs have edited stay edited. GM-from-scratch
  items are unaffected. Module-shipped compendium items get replaced
  wholesale by Foundry's normal update flow. The only case where a
  framework would matter is a semantic-rewrite of an existing flag
  meaning, and even there, handling it at the read site is cheaper
  than a framework. The empty `MIGRATORS` skeleton in
  `scripts/migrations.js` stays as-is in case that case ever arises.

---

## Theme 1 — GM Guide refactor (wiki-first)

**Status today.** Single-page in-world journal at
`_source/fishut-journals/gm-guide.json` covering Overview, Addiction
& Withdrawal, Save Bypass & Administration. Maintaining it in the
journal pack means every rev requires a content-pack rebuild and an
in-world re-import for users on existing worlds.

**Direction.** Move the GM Guide to a GitHub wiki. Replace the
in-world journal with a single short page that:

- Names what the module adds to the UI (Details-tab checkboxes and
  fields, gating dialog, addiction chat lines, withdrawal AE,
  `Toggle Paraphernalia Enforcement` macro).
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

## Theme 2 — Sheet-level Details-tab integration (replaces the 3-dot form)

**Status today.** v0.2 ships
`scripts/ui/item-settings-form.js` + `templates/item-settings-form.hbs`,
an ApplicationV2 form launched from the dnd5e item sheet's 3-dot
header menu. It works, but it has three structural problems that won't
age well:

- It's hidden out of the natural left-to-right authoring flow
  (Description → Details → Activities → Effects). Authors don't think
  to look there.
- It's a separate surface that has to mirror item state — every field
  is a round-trip through `flags["substances-and-paraphernalia"]`
  rather than living where dnd5e already persists item data.
- The shipped `FISHUT.ItemSettings.*` localization keys never resolved
  in the v0.2 build — the form currently displays raw key strings to
  anyone who opens it. (Cosmetic, but representative of the form
  living off to the side of the rest of the module's UI.)

**Direction.** Replace the form with native injection into the dnd5e
item sheet's **Details** tab, mirroring how dnd5e exposes its own
optional behaviors (e.g. the *Magical* checkbox under Consumable
Properties).

- On `consumable` items: add an **Illicit Substance** checkbox under
  the existing Consumable Properties section. Toggling it on reveals
  a new section above Usage with the substance fields (Setting,
  Category, Administration, Save Ability, Save DC, Withdrawal Mod,
  Addiction Effect picker, Required Paraphernalia editor).
- On `equipment` items: add a **Paraphernalia** checkbox under the
  equivalent Properties section. Toggling it on reveals
  paraphernalia fields (Setting, Paraphernalia ID, Save Bypass
  subform — type, appliesTo, usesPerDay).
- All persistence flows through the sheet's existing form-submit
  pipeline — same path the *Magical* checkbox uses. No bespoke
  ApplicationV2.

**Mechanism.** Hook `renderItemSheet5e2` (or whatever the dnd5e 4.x
class hook turns out to be — confirm at implementation time) and
inject the new fields into the rendered DOM. Field names use the
flag-path convention (`flags.substances-and-paraphernalia.kind`,
etc.) so dnd5e's form-submit picks them up natively.

**Why this is bigger than it looks.**

- The form's localization-key resolution bug needs to be properly
  cleared (the new fields' `FISHUT.*` keys must exist in
  `lang/en.json` and be registered through whatever path Foundry's
  template renderer expects). The lesson from the v0.2 form is that
  this is easy to miss; the new injection should be tested in a
  fresh world before merge.
- The "Required Paraphernalia editor" sub-widget (groups of
  `anyOf` rows, each row a slug-or-UUID) is the one piece that
  doesn't map cleanly onto dnd5e's existing form patterns. Likely
  needs a small Handlebars partial + a delegated event handler for
  add/remove.
- The save-bypass subform is small but conditionally visible. The
  toggle UX should match dnd5e's existing "checkbox reveals a sub-
  section" pattern (Limited Uses → Recovery shows/hides similarly).

**Cleanup at the same time.**

- Delete `scripts/ui/item-settings-form.js` and
  `templates/item-settings-form.hbs`.
- Delete the `FISHUT.ItemSettings.*` lang keys (they're broken
  anyway) and replace them with `FISHUT.Details.*` keys for the new
  fields.
- Remove the 3-dot header-control hook in
  `scripts/module.mjs` (or wherever it's registered).

**Open questions for spec.**

- For the *Required Paraphernalia* editor specifically — keep it
  inside the Details tab section, or move it to a small floating
  sub-dialog launched from a button in that section? The full editor
  may be too tall for the Details tab.
- Do we want the substance fields visible-but-disabled when "Illicit
  Substance" is unchecked, or hidden-until-checked? dnd5e's pattern
  is hidden-until-checked.

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
in per substance; authors can override via the new Details-tab
section (Theme 2).

**Why this is bigger than it looks.**

- TMFX filter parameters are a non-trivial config surface — a
  full filter is a `params` object with dozens of fields.
- The Details-tab substance section needs a TMFX subform that
  doesn't drown new authors. Probably "preset name" with a
  free-text "raw JSON override" escape hatch.
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
post-hook. The Details-tab substance section needs new fields. The
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

- **0.3** — Theme 2 (Details-tab integration; deletes the 3-dot
  form) + Theme 1 (wiki refactor) + Theme 6 round 1 (matrix fill).
  Theme 2 anchors the release; the other two are content-shaped
  and ride along.
- **0.4** — Theme 3 (bypass types: `advantage` + `+N`) + Theme 6
  round 2.
- **0.5** — Theme 4 (TokenMagic FX) + Theme 6 round 3.
- **0.6** — Theme 3 finish (`reroll-on-fail`) + Theme 5 first
  cut (on-use macro hook).
- **1.0** — stability pass + Foundry package registry submission.

This ordering is editable. Pin nothing in this doc that should be
pinned in a spec.
