# Substances and Paraphernalia: Pre-1.0 To-Do List

> **Source:** Sanity-check review by Claude on 2026-05-12, with author (Mr. Beasley) responses applied.
> **Target repo:** https://github.com/themrbeasley/substances-and-paraphernalia
> **Current shipped version at time of review:** v0.6.0 (released 2026-05-11).
> **Goal:** Establish the work backlog for v0.7 through v1.0.
>
> **Note for future readers and contributors:** This file was generated as a draft in the World of Rolara project workspace because that was the only folder available during the review session. It belongs in the module repository, ideally moved to `tasks/v1.0-feedback-backlog.md` or wherever the module's task documents live. Once moved, delete this copy from the World of Rolara folder.

---

## How to read this document

Each work item below has the following shape:

1. **Title:** Short name for the item.
2. **Origin:** Which review section it came from and which letter of the author's feedback applies. References letters from the original report (A through R).
3. **Context:** Two to three sentences of background, written so a contributor with zero prior context can understand the problem.
4. **Scope:** What is in and out of scope for the item.
5. **Concrete actions:** Numbered steps. Specific enough to start work without re-reading the original review.
6. **Acceptance criteria:** How we know the item is done.
7. **Files and surfaces affected:** Where the work lives.
8. **Dependencies:** Which other items this depends on or is blocked by.

Items are grouped by category, not priority. Priority is assigned per release within each release's thesis: each release picks one or two items from this list and ships them.

---

## Category 1: Critical mechanical fixes (must land before v1.0)

### Item 1: Make save ability per-category in shipped compendium content, leave Con as the authoring-surface default

**Origin:** Review section A, author feedback A.

**Context:** The schema field `addiction.save.ability` defaults to Constitution in the authoring surface (the dnd5e Details-tab fields for substance authoring) and in every shipped compendium substance. Constitution is the right default for the authoring surface because most homebrew substances a GM will whip up are stimulants or performance-enhancers where physical dependence (Con) is the right fit, and changing the dropdown is trivial. Constitution is the wrong default for shipped compendium content because mind-altering substances should call Wisdom saves in 2024 D&D, where Wisdom is the canonical resist-compulsion-charm-fear stat. This split (UX default stays Con, shipped content varies by category) needs to be documented so end-user GMs understand the principle and apply it when authoring their own.

**Scope:**

- In scope: Updating shipped compendium content to use the right save ability per category. Documenting the design principle in the GM Guide and wiki. Adding category-based hint text under the Save Ability dropdown in the Details-tab authoring surface.
- Out of scope: Changing the authoring-surface default away from Constitution. Forcing per-category save ability via code; the schema continues to support per-substance override.

**Concrete actions:**

1. Update shipped compendium content (when the compendium is rebuilt; see Item 12 about the planned compendium rebuild for 1.0) so that:
   - Stimulant category substances default to Constitution.
   - Performance-enhancing category substances default to Constitution.
   - Mind-altering category substances default to Wisdom.
   - Explicit per-substance overrides (e.g., a "Wisdom-draining" stimulant) are allowed and should be exercised at least once across the compendium to demonstrate the override path.
2. Add a hint string under the Save Ability dropdown in the Details-tab authoring surface that reads roughly: "By convention: stimulants and performance-enhancers use Constitution (physical dependence). Mind-altering substances use Wisdom (psychic compulsion). Override freely for your design."
3. Add a "Choosing a Save Ability" sub-section to the Authoring wiki page that explains the convention in 2 to 3 paragraphs.
4. Add a one-paragraph note in the in-world GM Guide journal pointer page summarizing the convention.

**Acceptance criteria:**

- Every mind-altering substance in the shipped compendium uses Wisdom as the save ability.
- The Save Ability dropdown in the Details tab still defaults to Constitution and shows the hint text below the dropdown.
- The Authoring wiki page has the "Choosing a Save Ability" sub-section with the principle explained.
- The in-world GM Guide journal has a one-paragraph note pointing at the wiki.

**Files and surfaces affected:**

- `_source/fishut-substances/*.json` for mind-altering substances (rebuild via `npm run pack`).
- `templates/details-tab/*.hbs` for the Save Ability hint string.
- `lang/en.json` for the new hint key (e.g., `FISHUT.Details.SaveAbility.Hint`).
- `wiki/Authoring.md` for the new sub-section.
- `_source/fishut-journals/gm-guide.json` for the journal pointer note.

**Dependencies:** Item 12 (compendium rebuild) for the actual content update, but the authoring-surface hint and documentation can ship independently.

---

### Item 2: Add an `aeRole` flag on Active Effects, keep substring-name matching as a fallback

**Origin:** Review section B, author feedback B.

**Context:** The module currently identifies what an Active Effect "is" by substring-matching the AE's name (`addict`, `withdraw`, `overdose`, `tolerance`, `Altered by *`). This works in a single-locale, single-author world and breaks the moment a French GM renames an AE to its local-language equivalent, an author makes a typo, or a homebrewer names a bypass AE something like "Anti-addiction filter" and gets it false-positive-matched as an addiction AE. The module already uses AE flags for some semantic tagging (`sourceSubstanceId` from v0.2, `flags[...].modifier` from v0.3). Extending that pattern with an explicit role tag, while keeping the substring matcher as a warn-logged fallback, gives locale-independence and typo-tolerance without breaking hand-authored AEs.

**Scope:**

- In scope: A new flag `flags["substances-and-paraphernalia"].aeRole` with enum values `"addiction" | "withdrawal" | "altered" | "tolerance" | "overdose" | "bypass"`. Reading it from macros, sweeps, the modifier pipeline, and any place currently doing substring matches. Writing it on every AE the module creates or templates. Falling back to substring match when the flag is absent and warn-logging that fallback fired.
- Out of scope: Removing the substring matcher entirely. That fallback stays for hand-authored AEs in user worlds and for backwards compatibility with any existing AEs in worlds that have used pre-v0.7 versions of the module.

**Concrete actions:**

1. Extend `scripts/data/schema.json` with the `aeRole` enum.
2. Update every AE creation site in the module to write `aeRole` on creation:
   - `applyAddictionEffect` writes `aeRole: "addiction"`.
   - `applyWithdrawalEffect` writes `aeRole: "withdrawal"`.
   - Altered AE templates carry `aeRole: "altered"`.
   - Tolerance AE applications write `aeRole: "tolerance"`.
   - Overdose marker AE applications write `aeRole: "overdose"`.
   - Bypass-granting AEs on paraphernalia carry `aeRole: "bypass"` (this overlaps with the existing `modifier.kind: "bypass"`; both can coexist, or `aeRole` can be derived from `modifier.kind` for bypass AEs).
3. Update macro AE-discovery code (Remove Addiction, Remove Altered, Remove Tolerance, Remove Overdose, Remove Withdrawal) to read `aeRole` first and fall back to substring match. Log a console warning whenever the substring fallback matches an AE that has no `aeRole`.
4. Update the modifier pipeline walker (`scripts/data/modifier-pipeline.js`) to use the same flag-first, substring-fallback pattern.
5. Update shipped compendium AEs to carry `aeRole` on the next `npm run pack` (this is a content rebuild, not a doc change).
6. Add a content invariants validator rule (`tools/validate-content.mjs`) that every shipped AE has an `aeRole` flag.
7. Document the flag in the Authoring wiki page under a new "AE Conventions" sub-section.

**Acceptance criteria:**

- Every shipped compendium AE carries an `aeRole` flag and passes the new content invariant.
- All five Remove-X macros find their target AEs via `aeRole` and only fall back to substring matching when the flag is missing.
- The modifier pipeline reads bypass AEs via flag, not via name.
- A Quench test renames an addiction AE to a non-matching string (e.g., "Toxisch durch Kohlenschattenpulver") and confirms the Remove Addiction macro still finds it via the flag.
- A console warning is emitted (and visible to GMs) when the substring fallback fires.

**Files and surfaces affected:**

- `scripts/data/schema.json` for the enum.
- `scripts/hooks/addiction.js`, `scripts/hooks/overdose.js`, `scripts/data/tolerance.js`, `scripts/data/withdrawal.js` for AE creation sites.
- `scripts/data/modifier-pipeline.js` for bypass resolution.
- `_source/fishut-macros/*.json` for the Remove-X macros (rebuild via `npm run pack`).
- `tools/validate-content.mjs` for the new invariant.
- `wiki/Authoring.md` for the AE Conventions documentation.

**Dependencies:** None. Can ship in a single release as a clean upgrade.

---

### Item 3: Fix the Voluntary Abstain mechanic (narrative framing and failure consequences)

**Origin:** Review section G, author feedback G.

**Context:** The SPEC describes Voluntary Abstain as "while a withdrawal AE is active, the long-rest dialog offers an Abstain this rest button. Wis save, DC = 8 + withdrawalMod. Success advances the withdrawal counter by 2. Failure is normal 1-rest progress, no penalty." The author's intended design was different: the Wisdom save represents using willpower to resist the urge to consume the substance during a craving moment (typically the long rest, when the body is asking for it). The current implementation has no teeth on a failed save because there is no negative consequence. The intended consequence of a failed abstain check is that the character gives in, locates and consumes the substance, and re-triggers the post-use addiction loop (Constitution save against the substance's DC, full consequence chain). This is both a narrative reframing and a real mechanical change to the failure path.

**Scope:**

- In scope: Redesigning the abstain failure path so that failure triggers an in-fiction "you give in" outcome, which then runs through the standard `dnd5e.postUseActivity` addiction loop as though the character consumed a dose. Updating chat card text, button labels, and dialog prompts to use willpower-and-craving language rather than save-against-withdrawal language. Re-examining whether DC 8 + withdrawalMod is still the right scaling once the failure case has real teeth.
- Out of scope: Removing the voluntary abstain mechanic entirely. Allowing players to abstain when they have zero remaining substance in inventory should still gracefully no-op the consumption part of the failure path.

**Concrete actions:**

1. Confirm in code that the current implementation matches the SPEC description (it does, but verify before changing). Document the discrepancy between SPEC and authorial intent in the v0.7 CHANGELOG entry under "Changed" or "Fixed."
2. Update the long-rest dialog button label from "Abstain this rest" to something like "Resist the urge to use {Substance}" (per-substance, picks up the substance name from the withdrawal AE flag).
3. Update the Wisdom save chat card to frame the roll as "{Character} resists the urge to use {Substance}" rather than "abstain this rest."
4. Implement the new failure path:
   - On failed Wisdom save: locate the substance item on the actor (by `sourceSubstanceId` flag stored on the withdrawal AE template). If the substance item is present in inventory with at least one use remaining, automatically trigger the substance's `dnd5e.postUseActivity` flow as though the player had consumed it manually. If the substance is not in inventory, post a chat card noting that the character "looked for {Substance} but had none to find" and continue with normal 1-rest progress (this preserves the design as a soft-fail when the player has dropped or used up their stash).
   - On successful Wisdom save: behavior unchanged from current implementation (counter decrements by 2 instead of 1, chat card celebrates the willpower moment with substance-specific flavor).
5. Re-examine the DC scaling. With real failure consequences, the current DC 8 + withdrawalMod produces a high pass rate for Wisdom-positive characters (a level 5 Cleric with +5 Wis vs DC 12 is ~85% pass). Consider whether the DC should escalate with consumption count or with active addiction stacks, so repeat users find willpower harder. Hold the redesign decision until the failure path is implemented and playtested at least once.
6. Update the Mechanics wiki page to describe the corrected mechanic. Update the GM Guide journal pointer with a one-line note.
7. Add a Quench test for the failure path: pre-stage an actor with a withdrawal AE, the substance item in inventory, and a Wisdom save that will fail. Confirm the post-use addiction loop fires automatically and the chat card shows the willpower-failure narrative.

**Acceptance criteria:**

- The long-rest dialog button label is willpower-themed, not abstain-themed.
- Failed Wisdom save triggers automatic substance consumption when the substance is in inventory.
- Failed Wisdom save with no substance in inventory soft-fails to normal 1-rest progress.
- Chat card text uses craving-and-willpower language throughout.
- Mechanics wiki page describes the corrected mechanic.
- Quench test passes.

**Files and surfaces affected:**

- `scripts/hooks/long-rest-abstain.js`.
- `lang/en.json` for the new chat strings.
- `test/quench/test-suite.mjs` for the new test.
- `wiki/Mechanics.md` for the documentation update.

**Dependencies:** None. Implementable independently, though the willpower-failure-triggers-consumption logic interacts with the post-use addiction loop, which Item 6 (overdose-tolerance interaction) also touches; coordinate to avoid merge conflicts.

---

### Item 4: Make withdrawal duration formula explicit and previewable in the authoring surface

**Origin:** Review section C and F (formula opacity, partial use of substance options), author feedback C.

**Context:** The schema field `addiction.withdrawalMod` is a number used in the formula that computes `restsRemaining` (the count of long rests a withdrawal AE persists). The exact formula (e.g., `restsRemaining = withdrawalMod + 1d4` or `restsRemaining = withdrawalMod` flat) lives only in source code and is not documented on the wiki. Authors tuning a substance have no way to preview the resulting withdrawal duration from the Details-tab authoring surface, and the lack of clarity makes substance authoring feel like flying blind. The author has also noted that not every substance uses every option (some may have only an Altered effect with no addiction or withdrawal at all), which means the authoring surface should make it visually obvious which subsystems are configured for a given substance and which are inert.

**Scope:**

- In scope: Documenting the withdrawal duration formula explicitly in the Authoring wiki page. Adding a computed preview field next to Withdrawal Mod in the Details-tab authoring surface ("Estimated withdrawal: ~N long rests"). Making it visually obvious in the Details tab when a subsystem is disabled (e.g., addiction toggled off so withdrawal is also off).
- Out of scope: Changing the formula itself. Auto-generating withdrawal AEs (authors still pick the AE template manually).

**Concrete actions:**

1. Locate the current `restsRemaining` computation in `scripts/data/withdrawal.js` (or wherever it lives). Document the exact formula in a code comment.
2. Surface that formula on the Authoring wiki page in a new "Tuning Withdrawal Duration" sub-section, with at least three worked examples showing how `withdrawalMod` values of 2, 4, and 6 produce specific expected duration ranges.
3. Add a read-only preview span in the Details-tab authoring surface that updates live as the author edits Withdrawal Mod. Format: "Estimated withdrawal: ~N long rests (approximately N days)."
4. Audit the Details-tab authoring surface for subsystem-visibility: when "Addiction" is toggled off, all addiction-dependent fields (Save Ability, Save DC, Withdrawal Mod, Withdrawal Effect picker) should be visually grayed out or hidden, not just inert. Same for Overdose and Tolerance subsystems.
5. Add the same kind of clarity to the Paraphernalia authoring surface: when "Grants Save Bypass" is toggled off, the bypass-related fields hide. When "Required for Administration" is configured, show a small preview "Required for: ingested, injected" so authors can sanity-check the gating.

**Acceptance criteria:**

- The Authoring wiki page has a "Tuning Withdrawal Duration" section with the formula and worked examples.
- The Details-tab authoring surface shows a live withdrawal duration preview that updates as the author edits Withdrawal Mod.
- Subsystem-disabled fields are visually distinct from subsystem-enabled fields in the Details tab.
- Paraphernalia authoring surface has the same subsystem clarity.

**Files and surfaces affected:**

- `scripts/data/withdrawal.js` for the documented comment.
- `templates/details-tab/*.hbs` for the live preview and subsystem visibility.
- `scripts/ui/details-tab.js` for the live-preview hookup.
- `wiki/Authoring.md` for the documentation.

**Dependencies:** None. Pure authoring-UX work, no schema or mechanic change.

---

### Item 5: Bound the Tolerance system so it cannot reach unplayable extremes

**Origin:** Review section D, author feedback D.

**Context:** The Tolerance system has three knobs (attenuateAltered, addictionDcBump, withdrawalAmplify) that all make the next consumption worse: weaker buff, harder save, nastier withdrawal. Without bounds, an author can write a substance whose Tolerance progression eventually produces a state where the buff is fully attenuated (effectively zero benefit) and withdrawal is amplified beyond the most punishing baseline withdrawal in the compendium. The author's design intent is that Tolerance produces diminishing returns and a sense of cost, not a state where consumption is mathematically a pure loss. Some of this is documentation (authors are told not to write substances that progress to extreme states), some can be codified as soft caps in the engine.

**Scope:**

- In scope: Adding soft caps to the Tolerance system: a maximum number of stacks (default 5, author-overridable per substance), a floor on `attenuateAltered.modifierFactor` (default 0.25, so the buff can never fall below 25% of baseline), a cap on `addictionDcBump` (default +5 across all stacks), a cap on `withdrawalAmplify.durationFactor` (default 2.0, so withdrawal can at most double). Authors can override the defaults per substance. Documenting the bounds and the design rationale on the wiki.
- Out of scope: Forcing the bounds via hard validators that block authoring. The bounds are soft defaults that authors can override but receive a warn-log when they do.

**Concrete actions:**

1. Extend the tolerance flag schema with `caps: { maxStacks, modifierFactorFloor, addictionDcBumpCap, withdrawalDurationFactorCap }` fields, all optional with sensible defaults applied by the engine.
2. Update `scripts/data/tolerance.js` to enforce the caps when composing the stack effects: clamp at the floor / cap rather than letting values run away.
3. Add a content invariant that warns (not errors) when an author writes a substance whose cap overrides exceed the engine defaults, encouraging them to confirm the design choice.
4. Document the caps and the design rationale in a new "Tolerance: Bounds and Authoring Guidance" sub-section on the Mechanics wiki page.
5. Add author-facing prose on the wiki explaining the design pattern: "Tolerance is a diminishing-returns mechanic. The bounds prevent a substance from reaching a state where consumption is mathematically a pure loss. Override the caps if your substance is intentionally a severe-progression design, but consider whether the player experience supports it."

**Acceptance criteria:**

- The engine clamps tolerance stack effects at the documented caps.
- Authors can override caps per substance.
- The Mechanics wiki page documents the caps and the design rationale.
- A content invariant warn-logs when an author overrides a cap to exceed engine defaults.

**Files and surfaces affected:**

- `scripts/data/schema.json` for the new optional cap fields.
- `scripts/data/tolerance.js` for the clamping logic.
- `tools/validate-content.mjs` for the warn invariant.
- `wiki/Mechanics.md` for the documentation.

**Dependencies:** None.

---

### Item 6: Make the Overdose-Tolerance interaction author-controlled per substance

**Origin:** Review section F, author feedback F.

**Context:** The author's response to the original review point about overdose-vs-tolerance compounding raised a real design question: in some substances, building tolerance should reduce overdose risk (the body has adapted), while in others, building tolerance should increase overdose risk (users chase the diminishing buff with higher doses). The current schema treats overdose as a fixed per-use d100 chance with no tolerance interaction. The right shape is an authorable per-substance field that lets the GM author choose the interaction model for that specific substance.

**Scope:**

- In scope: A new schema field `overdose.toleranceInteraction` with enum values `"none" | "mitigate" | "compound"` and an associated magnitude field. When `mitigate`, each tolerance stack reduces overdose chance by a configured percentage. When `compound`, each tolerance stack increases overdose chance by a configured percentage. When `none` (the default for backwards compatibility), tolerance has no effect on overdose.
- Out of scope: Auto-scaling overdose severity (the description-only chat card stays GM-adjudicated). Changing the underlying d100 roll mechanic.

**Concrete actions:**

1. Extend the `overdose` flag schema with `toleranceInteraction: "none" | "mitigate" | "compound"` and `toleranceInteractionMagnitude: number` (a percentage-point change per stack, default 0).
2. Update `scripts/hooks/overdose.js` to read the actor's tolerance stacks for the substance, apply the interaction, and roll the d100 against the modified chance.
3. Add a Details-tab authoring surface section under Overdose that exposes the interaction dropdown and magnitude field. Include hint text explaining the design choice: "Mitigate models physical adaptation (body tolerates the substance better, overdose risk falls). Compound models dose-escalation behavior (tolerant users seek higher doses, overdose risk rises). None is the default for substances where tolerance and overdose are mechanically unrelated."
4. Document the interaction in the Mechanics wiki page.
5. Add unit tests for the modified d100 chance calculation across the three interaction modes.

**Acceptance criteria:**

- The authoring surface exposes the interaction dropdown.
- The engine applies the interaction correctly at the consumption hook.
- Unit tests pass for all three modes.
- The Mechanics wiki page documents the design choices.

**Files and surfaces affected:**

- `scripts/data/schema.json` for the new fields.
- `scripts/hooks/overdose.js` for the logic.
- `templates/details-tab/*.hbs` for the authoring fields.
- `test/unit/overdose.test.mjs` for the tests.
- `wiki/Mechanics.md` for the documentation.

**Dependencies:** Item 5 (Tolerance bounds) should land first or alongside, so the interaction math is bounded by the tolerance caps.

---

## Category 2: Documentation overhaul (the GM authoring manual)

### Item 7: Write a comprehensive substance-authoring manual

**Origin:** Review section C, author feedback C.

**Context:** The author has identified that the current documentation does not constitute a "GM-ready instruction manual" for authoring substances. A GM picking up the module today cannot easily learn how to create a new substance from scratch, with all subsystems (Altered effect, Addiction, Withdrawal, Tolerance, Overdose) properly configured. The fix is a deliberate end-to-end authoring manual that walks a new GM through creating one specific worked example, then provides reference material for each subsystem.

**Scope:**

- In scope: A new wiki page or set of wiki pages dedicated to substance authoring, structured as a tutorial-then-reference. One worked example substance built step-by-step from blank consumable item to fully configured. A reference section covering each subsystem (Altered, Addiction, Withdrawal, Tolerance, Overdose) with field definitions, valid value ranges, common pitfalls, and copy-pasteable prose templates for the substance description.
- Out of scope: Updating the in-world journal beyond the single pointer page (the journal stays a short pointer to the wiki).

**Concrete actions:**

1. Pick one canonical example substance for the manual. Recommendation: invent a clean, generic, demo-quality substance specifically for the documentation (call it something like "Example: Greyleaf Tea"). Do not reuse a shipped compendium substance because the shipped ones are testbed content per author feedback E.
2. Build the example substance from scratch in a documentation session, capturing every authoring step:
   - Create a new consumable item.
   - Toggle "Illicit Substance" in the Details tab.
   - Fill in Setting, Category, Administration.
   - Author the Altered AE (the benefit effect): include 2024-compliant prose template for the AE description.
   - Author the Addiction AE template: include 2024-compliant prose template.
   - Author the Withdrawal AE template: include 2024-compliant prose template, with guidance on what NOT to put in (the existing content invariant about not duplicating Poisoned).
   - Fill in Save Ability, Save DC, Withdrawal Mod.
   - Configure Tolerance (or note that this substance does not use tolerance and explain when to skip).
   - Configure Overdose (or note that this substance does not use overdose and explain when to skip).
   - Configure Required Paraphernalia (or note none required).
   - Write the substance description text using the canonical six-section format from v0.2 (flavor, desired effects, save against addiction, addicted-from, withdrawal mod and formula, requires footer).
3. Screenshot every step. The wiki supports images natively; lean on that.
4. After the tutorial, add a reference section for each authoring subsystem:
   - Altered AE reference: AE Changes table conventions, TMFX macro.tokenMagic Change row pattern, recommended duration formats.
   - Addiction AE reference: poisoned-coupling interaction, when to attach Poisoned via the AE vs. let the engine do it.
   - Withdrawal AE reference: vignette color authoring (AE Change row, mode 5 OVERRIDE), don't-duplicate-Poisoned guidance.
   - Tolerance reference: the three knobs, the bounds (per Item 5), when to leave tolerance off entirely.
   - Overdose reference: chancePercent semantics, description authoring, tolerance interaction (per Item 6).
5. Add a "common pitfalls" sidebar at the end of the manual covering: forgetting to set the save ability for mind-altering substances, leaving a withdrawal AE template empty, setting Tolerance knobs without thinking about cumulative bite, accidentally making consumption a pure-loss.

**Acceptance criteria:**

- A wiki page titled something like "Authoring Substances: Step-by-Step" exists.
- The page walks through a complete example substance build from blank item to finished.
- Every authoring subsystem has a reference sub-section.
- A "common pitfalls" sidebar exists.
- Screenshots of the Details-tab fields are present.

**Files and surfaces affected:**

- `wiki/Authoring-Substances.md` (new page).
- Possibly split into `wiki/Authoring-Substances-Tutorial.md` and `wiki/Authoring-Substances-Reference.md` if the page grows beyond ~3000 words.

**Dependencies:** Items 1, 4, 5, 6 inform the content of this manual. Worth landing this manual after at least Item 4 so the withdrawal-formula docs are stable.

---

### Item 8: Write a comprehensive paraphernalia-authoring manual

**Origin:** Author feedback C (the explicit "don't leave paraphernalia behind" note).

**Context:** Paraphernalia gets less documentation attention than substances because the substance is the primary mechanical surface. But paraphernalia is half the system: gating, save bypass, optional consumable-uses-driven readiness, the AE-flag bypass pattern. A GM authoring custom paraphernalia today has the same blind-flying problem as a GM authoring substances. This item is the paraphernalia equivalent of Item 7.

**Scope:**

- In scope: A new wiki page on paraphernalia authoring, same structure as Item 7: tutorial-then-reference. One worked example paraphernalia item built step-by-step (recommendation: a "Greyleaf Pipe" that pairs with the Greyleaf Tea from Item 7).
- Out of scope: Mechanical changes to the paraphernalia system; this is documentation only.

**Concrete actions:**

1. Build the example paraphernalia item from scratch in a documentation session:
   - Create a new equipment item (or consumable, if the example needs one-shot uses).
   - Toggle "Paraphernalia" in the Details tab.
   - Fill in Setting, Paraphernalia ID (subtype), `appliesTo` admin-type checkboxes.
   - If the example paraphernalia grants a save bypass: author the bypass-granting AE on the paraphernalia item, with the `modifier.kind: "bypass"` flag and the appropriate `type` field (auto-pass, advantage, +N, or reroll-on-fail).
   - Write the paraphernalia description text in 2024-compliant prose, with charges-and-recharge phrasing where applicable.
2. Reference sub-sections for:
   - Subtype model: the kebab-case open enum, the Paraphernalia Subtype Manager settings sub-menu for custom subtypes.
   - Admin-type matching: how `appliesTo` interacts with the dnd5e Poison subtype on substances.
   - Save bypass authoring: the four tiers (auto-pass > reroll-on-fail > advantage > +N), when to pick each, `usesPerDay` semantics, the resolution order in the modifier pipeline.
   - Readiness gating: paraphernalia that requires being equipped, paraphernalia that requires having uses remaining, paraphernalia that requires both.
3. Common pitfalls sidebar: forgetting to set `appliesTo`, authoring a bypass AE without `transfer: true` so it doesn't move to the actor, picking a save bypass tier higher than the substance design warrants.

**Acceptance criteria:**

- A wiki page titled something like "Authoring Paraphernalia: Step-by-Step" exists.
- The page walks through a complete example paraphernalia build.
- Every authoring subsystem (subtype, admin-type, save bypass, readiness) has a reference sub-section.
- Common pitfalls sidebar exists.
- Screenshots present.

**Files and surfaces affected:**

- `wiki/Authoring-Paraphernalia.md` (new page).

**Dependencies:** Item 2 (aeRole flag) affects how bypass AEs are authored. Worth landing after Item 2 so the manual reflects the final flag shape.

---

### Item 9: Add a worked example substance to the README and the in-world Journal pointer page

**Origin:** Author feedback C.

**Context:** The author has noted that an "example substance" in the README, wiki, and journal each would be useful, showing proper verbiage for each part of a substance's description and how to set those using the author surface. The wiki version of this example lives in Item 7's tutorial. The README and journal versions should be much shorter: a single substance's finished item card, with the canonical description text shown verbatim, so GMs evaluating whether to install the module can see at a glance what a finished substance looks like.

**Scope:**

- In scope: A short "What a substance looks like" section in the README, with the same example substance from Item 7 rendered as if it were a published consumable item card. The same content adapted for the in-world journal pointer page (with appropriate Foundry journal formatting).
- Out of scope: A full tutorial in the README. The README's job is to show, not to teach. Detailed tutorial stays on the wiki.

**Concrete actions:**

1. Render the Item 7 example substance ("Greyleaf Tea" or whichever final example is chosen) as a published-looking item card in Markdown. Include the canonical six-section description format from v0.2.
2. Add the rendered card to the README under a new section, "What a substance looks like."
3. Adapt the rendered card to Foundry journal-page HTML for the in-world journal pointer.
4. Cross-link from both places to the full tutorial on the wiki.

**Acceptance criteria:**

- README has a "What a substance looks like" section with a rendered example.
- The in-world journal pointer page has the same example.
- Both link to the full wiki tutorial.

**Files and surfaces affected:**

- `README.md`.
- `_source/fishut-journals/gm-guide.json`.

**Dependencies:** Item 7 (the tutorial determines what the example substance is).

---

### Item 10: Add a worked example paraphernalia item to the README and Journal pointer page

**Origin:** Author feedback C (paraphernalia parallel).

**Context:** Same as Item 9, but for paraphernalia. The example paraphernalia from Item 8 gets a rendered card in the README and the journal pointer page.

**Scope:**

- In scope: A "What a paraphernalia item looks like" section in the README and journal pointer, with the example paraphernalia rendered as a published-looking item card.
- Out of scope: Tutorial content; that stays in the wiki.

**Concrete actions:**

1. Render the Item 8 example paraphernalia as a Markdown item card.
2. Add to the README under "What a paraphernalia item looks like."
3. Adapt to the in-world journal HTML.
4. Cross-link to the full wiki tutorial.

**Acceptance criteria:**

- README has a "What a paraphernalia item looks like" section.
- Journal pointer page has the same.
- Both link to the wiki tutorial.

**Files and surfaces affected:**

- `README.md`.
- `_source/fishut-journals/gm-guide.json`.

**Dependencies:** Item 8.

---

### Item 11: Comprehensive 2024 language audit across all player-facing text

**Origin:** Review sections H, I, J on 2024 language compliance. Author note: "we're really far from where I want to be on language with regard to 2024 verbiage."

**Context:** The module currently renders text in chat cards, AE descriptions, substance descriptions, paraphernalia descriptions, and various dialogs and prompts. Much of this language likely uses pre-2024 phrasing ("once per day," "become invisible," etc.) instead of 2024-compliant phrasing ("regains all uses at dawn," "gains the Invisible condition," etc.). The author has acknowledged this and wants a full audit and rewrite pass.

**Scope:**

- In scope: Every string in `lang/en.json` that ends up in front of a player or GM. Every shipped compendium item's description text. Every shipped AE description. Every chat card template in `templates/`.
- Out of scope: Internal logging strings, console warnings, developer-facing strings.

**Concrete actions:**

1. Inventory all player-facing strings:
   - Parse `lang/en.json` and identify every string that ends up in chat cards, dialogs, AE descriptions, or tooltips.
   - Parse all `_source/*/*.json` for shipped item descriptions and AE descriptions.
   - Parse all `templates/*.hbs` for any inline text not coming from `lang/en.json`.
2. For each string, check against the 2024 phrasing reference:
   - Capitalized conditions: Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious.
   - "make a [Ability] saving throw," not "roll a [Ability] save."
   - "regain [X] hit points," not "restore" or "recover."
   - "expend a spell slot."
   - "until the end of your next turn" vs. "until the start of your next turn," used precisely.
   - Damage types lowercase. Ability scores capitalized. Rests capitalized.
   - "regains all expended charges at dawn" or "you can't use this feature again until you finish a Long Rest" replacing "once per day."
   - "gain the X condition" replacing "become X" for conditions.
3. Rewrite each non-compliant string. For shipped item and AE descriptions, this is a content edit that requires `npm run pack`.
4. Add a content invariant that flags suspicious legacy phrasing in shipped content. Specifically search for: "once per day," "become invisible," "become poisoned," "become frightened," "make a save," "roll a save," "X damage" without lowercase damage type, conditions in lowercase.
5. Cross-reference against the project's local copy of the SRD at `C:\Users\jorda\OneDrive\Documents\Claude\Projects\World of Rolara\SRD_CC_v5.2.1.pdf` (or a copy maintained in the module repo for this purpose) when in doubt.

**Acceptance criteria:**

- Every player-facing string in `lang/en.json` uses 2024 phrasing.
- Every shipped substance and paraphernalia description uses 2024 phrasing.
- Every shipped AE description uses 2024 phrasing.
- The content invariant flags no legacy phrasing in shipped content.
- A "Language Conventions" section is added to the Authoring wiki page so future authors (the GM's homebrew substances) get the same guidance.

**Files and surfaces affected:**

- `lang/en.json`.
- All `_source/**/*.json` content files (rebuild via `npm run pack`).
- `templates/*.hbs`.
- `tools/validate-content.mjs`.
- `wiki/Authoring.md`.

**Dependencies:** This is large enough to be its own release. Consider scheduling alongside the compendium rebuild in Item 12, so language and content land together.

---

## Category 3: Compendium content (deferred)

### Item 12: Rebuild the shipped compendium for v1.0

**Origin:** Author feedback E ("the substances in the compendium aren't likely to see the 1.0.0 release, they're just for testing").

**Context:** The author has acknowledged that the current shipped compendium content is testbed material and will not ship in v1.0 form. The compendium rebuild is the right vehicle for applying every documentation-driven authoring lesson learned in Items 7 through 11. The rebuild also benefits from the bounded Tolerance system (Item 5), the overdose-tolerance interaction (Item 6), and the per-category save ability defaults (Item 1).

**Scope:**

- In scope: Rewriting every shipped substance and paraphernalia item using 2024 phrasing, per-category save abilities, the bounded Tolerance system, the author's documented tier-DC scaling intent (per Item 13), and the full authoring conventions from the manuals.
- Out of scope: Expanding the matrix beyond the 3×3 setting × category. The matrix shape stays; only the content quality changes.

**Concrete actions:**

1. Schedule the rebuild as the content thesis for one release (recommended: v0.9 if v0.7 is mechanics-cleanup and v0.8 is the documentation manual landing).
2. For each cell in the 3×3 matrix, plan at least two substances that exercise different mechanical patterns:
   - One "core" substance per cell that exercises the standard Altered + Addiction + Withdrawal loop.
   - One "variant" substance per cell that exercises a different combination: maybe no addiction, just Tolerance-progressive Altered; or no Altered, just an overdose-risky Performance-Enhancing buff; or required paraphernalia that demonstrates a non-trivial gating example.
3. For each cell, plan at least one paraphernalia item that pairs thematically with the substances in that cell.
4. Author each substance and paraphernalia using the authoring manuals from Items 7 and 8.
5. Audit each finished item against the content invariants and against the language audit (Item 11).
6. Update the v1.0 release notes to call out the compendium rebuild as a fresh start, with re-import guidance for existing worlds.

**Acceptance criteria:**

- Every cell of the 3×3 matrix has at least 2 substances and 1 paraphernalia item.
- Every shipped item uses 2024 phrasing and the conventions from the authoring manuals.
- Every shipped item passes all content invariants.
- The release notes explain the rebuild and provide re-import guidance.

**Files and surfaces affected:**

- All of `_source/fishut-substances/` and `_source/fishut-paraphernalia/`.
- `CHANGELOG.md` for the rebuild entry.

**Dependencies:** Items 1, 2, 4, 5, 6, 7, 8, 11. This is the last big content lift before v1.0.

---

### Item 13: Document the DC-tier scaling design intent

**Origin:** Review section E.

**Context:** A DC 13 Constitution save is roughly a 55% pass at tier 1 and 85% pass at tier 3. Whether addiction is intended as a tier-1 narrative threat that characters grow out of, or a meaningful threat across all four tiers, is a design choice the module has not explicitly made. Authors need to know the intent to tune DCs sensibly. This item is documentation only, but it informs the Item 12 compendium rebuild and any author's homebrew tuning.

**Scope:**

- In scope: A written design statement on the wiki and in the GM Guide describing whether the module's shipped content treats addiction as tier-1, tier-2, tier-3, or all-tier, with suggested DC ranges per tier for authors who want to scale.
- Out of scope: Mechanically enforcing tier-DC scaling. The schema continues to accept any DC.

**Concrete actions:**

1. The author decides the design intent. Recommended position: shipped content is tier-1 to tier-2 in scaling (DCs 12 to 16), with explicit author guidance that DCs 17+ are reserved for tier-3-and-up substances. This matches the SRD's poison rules, which sit in the same DC band and are explicitly tier-1 threats.
2. Write the design statement on the Mechanics wiki page under a new "DC Scaling Across Tiers" sub-section, with a table of suggested DC ranges per tier.
3. Apply the design intent to the Item 12 compendium rebuild.
4. Add a hint string under the Save DC field in the Details tab: "Recommended DC ranges: 12-14 for tier 1 substances, 15-17 for tier 2, 18-20 for tier 3, 21+ for tier 4 setpiece substances."

**Acceptance criteria:**

- The Mechanics wiki page has a "DC Scaling Across Tiers" sub-section.
- The Details-tab Save DC field has the hint text.
- The compendium rebuild (Item 12) reflects the documented scaling.

**Files and surfaces affected:**

- `wiki/Mechanics.md`.
- `templates/details-tab/*.hbs`.
- `lang/en.json`.

**Dependencies:** Item 12 (compendium rebuild) consumes the design statement.

---

## Category 4: Architecture polish

### Item 14: Verify the CSS withdrawal vignette is scoped and not colliding with `#interface`

**Origin:** Review section M, author feedback I ("don't lose this one").

**Context:** The withdrawal vignette is mounted to Foundry's global `#interface` selector. If `styles/withdrawal-vignette.css` writes rules against `#interface` directly (rather than against a module-scoped descendant element appended to `#interface`), it risks collision with other modules and themes that touch the same selector. This is a small verification task with a potential small fix.

**Scope:**

- In scope: Reading `styles/withdrawal-vignette.css` and confirming the rules are scoped to a module-specific class or ID (e.g., `#fishut-withdrawal-vignette` or `.fishut-vignette`). If not, refactoring the CSS and the mounting code to use a scoped element.
- Out of scope: Refactoring the vignette mechanism itself.

**Concrete actions:**

1. Open `styles/withdrawal-vignette.css` and read every selector.
2. If any selector matches `#interface` or any other global Foundry element directly, refactor to a scoped child element.
3. Update the mounting code in whichever script mounts the vignette to inject a scoped child element under `#interface` and apply the styles to that child.
4. Test in a live world: load a theme module (e.g., Ernie's Modern Layout or any other UI mod) alongside this module, apply a withdrawal AE, confirm no collision.

**Acceptance criteria:**

- No selector in `styles/withdrawal-vignette.css` writes rules to a global Foundry element.
- Live-world test with a UI theme installed shows no collision.

**Files and surfaces affected:**

- `styles/withdrawal-vignette.css`.
- The script that mounts the vignette (likely `scripts/integrations/vignette.js` or similar).

**Dependencies:** None.

---

## Category 5: Pre-1.0 release hygiene

### Item 15: Declare a schema-freeze policy for v1.0 and forward

**Origin:** Review section P.

**Context:** Every minor version 0.2 through 0.6 has shipped breaking schema changes, which is normal for pre-1.0 modules but unsustainable post-1.0. The SPEC already declares the intended migration policy (sheet-level read-with-default, no document-rewriting). Codify the schema-freeze decision in a written policy document before v1.0 releases.

**Scope:**

- In scope: A written policy document covering: from v1.0, schema changes are additive-only. Removals or renames require a major version bump (v2.0). Sheet-level read-with-default is the migration path. The empty `MIGRATORS` skeleton in `scripts/migrations.js` stays for the edge case where a semantic-rewrite of an existing flag's meaning happens.
- Out of scope: Implementing the policy retroactively for pre-1.0 versions.

**Concrete actions:**

1. Write `docs/SCHEMA-POLICY.md` covering the rules above.
2. Link to it from `CONTRIBUTING.md`.
3. Reference it in the v1.0 release notes.

**Acceptance criteria:**

- `docs/SCHEMA-POLICY.md` exists.
- `CONTRIBUTING.md` links to it.
- v1.0 release notes reference it.

**Files and surfaces affected:**

- `docs/SCHEMA-POLICY.md` (new).
- `CONTRIBUTING.md`.

**Dependencies:** None.

---

### Item 16: Wire a CI check that requires a CHANGELOG entry for every tag

**Origin:** Review section Q.

**Context:** The v0.5.2 backfilled CHANGELOG entries for v0.4.0 and v0.5.0, which indicates the release process did not require a CHANGELOG entry at tag time. A simple CI check (fail the workflow if a tag is created without a matching `## [X.Y.Z]` section in the CHANGELOG) prevents recurrence.

**Scope:**

- In scope: A CI step in the existing release workflow that parses the tag name, grep for the matching CHANGELOG section, fails if not found.
- Out of scope: Auto-generating CHANGELOG entries.

**Concrete actions:**

1. Add a step to `.github/workflows/release.yml` (or wherever the tag-driven release workflow lives) that runs on tag creation, extracts the version from the tag, and greps the CHANGELOG for `## [<version>]`.
2. If not found, fail the workflow with a clear error message: "CHANGELOG entry missing for tag v<version>. Add a section to CHANGELOG.md before tagging."

**Acceptance criteria:**

- A tag created without a matching CHANGELOG entry fails CI.
- A tag created with a matching CHANGELOG entry passes CI.

**Files and surfaces affected:**

- `.github/workflows/release.yml` (or the equivalent file).

**Dependencies:** None.

---

### Item 17: Add a content-theme warning and safety tools recommendation to the README and GM Guide

**Origin:** Review section R.

**Context:** The module ships substances modeled on real-world illicit drugs, with names suggesting amphetamines, caffeine pills, and psychedelics. This is fine creatively and within the bounds of published 5e content, but the README and GM Guide should have a clear up-front "for groups where this content is welcome" note with a recommendation to use safety tools (Lines and Veils, X-Card, or equivalent) at the table. The Foundry package registry may also require age flagging at submission time depending on their content guidelines.

**Scope:**

- In scope: A short content-warning section at the top of the README and GM Guide. Safety-tools recommendation with one or two pointers to community resources (Script Change, X-Card, Lines and Veils). Pre-submission check of Foundry's package registry content guidelines for age flagging.
- Out of scope: Removing or softening any existing content. The module's content is intentionally adult-oriented.

**Concrete actions:**

1. Write a 3-to-4-sentence content-warning section for the top of the README. Sample wording: "This module models illicit substances, addiction, withdrawal, and overdose. The content is intended for adult tables and for groups where this material is welcome. Use safety tools (Lines and Veils, X-Card, Script Change) to confirm consent at the table before introducing substances into your campaign."
2. Adapt the same wording for the GM Guide journal pointer page.
3. At v1.0 submission time, read Foundry's package registry content guidelines (https://foundryvtt.com/packages/ documentation) and apply whatever age-flagging or content-tag is required.

**Acceptance criteria:**

- README has a content-warning section above the "What ships" section.
- GM Guide journal pointer has the equivalent.
- v1.0 submission complies with Foundry's content guidelines.

**Files and surfaces affected:**

- `README.md`.
- `_source/fishut-journals/gm-guide.json`.
- `module.json` (possibly, depending on what Foundry requires).

**Dependencies:** Item 12 (compendium rebuild) and v1.0 release. The submission check happens at v1.0, the warning text can ship in any earlier release.

---

## Category 6: Resolved and parked

These items came up in the review but the author has indicated they need no further action.

- **Compendium ownership check (review section J):** Handled. No further work.
- **Hard-requiring DAE, Midi-QoL, Token Magic FX (review section L, author feedback H):** Author has confirmed this is the intended posture. The hard requirement stays. The reasoning is that these three modules are common, popular, well-maintained, and load-bearing for the intended UX. No further action.

---

## Suggested release sequencing

This is a recommendation, not a binding plan. Each release should ship a single thesis (per the SPEC's "Path B principle"). Adjust as new priorities surface.

**v0.7: Mechanical correctness.**

Items 1 (save ability per category), 2 (aeRole flag), 3 (Voluntary Abstain fix). The mechanic correctness arc. Single thesis: "make the system do what it claims to do."

**v0.8: Authoring clarity.**

Items 4 (withdrawal formula preview), 5 (Tolerance bounds), 6 (Overdose-Tolerance interaction), 11 (language audit, partial: lang/en.json and template strings only, not yet content). Authoring-surface UX and engine-clarity. Single thesis: "make the system understandable to author against."

**v0.9: Documentation and content rebuild.**

Items 7 (substance authoring manual), 8 (paraphernalia authoring manual), 9 (README example substance), 10 (README example paraphernalia), 13 (DC scaling design intent), 12 (compendium rebuild), 11 (language audit, completion: shipped content). Single thesis: "produce the canonical reference and rebuild the content against it."

**v1.0: Release hygiene and submission.**

Items 14 (CSS scoping verification), 15 (schema policy), 16 (CHANGELOG CI), 17 (content warning, Foundry submission). Single thesis: "stabilize and submit."

---

## End of backlog

Generated 2026-05-12 in the World of Rolara workspace. Move this file to the substances-and-paraphernalia repo, ideally under `tasks/`, before sharing with contributors. Delete the copy from World of Rolara once moved.
