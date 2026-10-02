# Roadmap

Where **Substances and Paraphernalia** is, what comes next, and what it won't
do. The [CHANGELOG](CHANGELOG.md) has the full story for each version.

## Where we are

- **0.2**: the addiction loop, paraphernalia-granted save bypass, content checks, CI and the tag-driven release.
- **0.3**: authoring moves onto the dnd5e Details tab; auto-pass and advantage bypasses; drag-to-inventory dialog; one drug per cell of the 3x3 matrix.
- **0.4**: tolerance, overdose, the abstain choice at a Long Rest, the +N bypass, the Paraphernalia Subtype Manager; the GM Guide moves to the wiki.
- **0.5**: Token Magic FX visuals on highs, the administration-type gear gate, the withdrawal vignette, setting-flavored gear.
- **0.6**: the reroll-on-fail bypass.
- **0.7**: every effect carries a role; tolerance caps; a failed abstain check makes the character take the dose.
- **0.8**: authoring clarity: DC guidance, wording rules, Details-tab sections that collapse, sheet-lock fixes.
- **0.9**: Foundry V14 only; the addiction cycle works end to end (finishing withdrawal ends the addiction, tolerance weakens the high).
- **0.10.0**: dose other creatures (spiked drinks, darts, gas clouds), overdose damage, withdrawal that bites in combat, abstaining always leads to withdrawal, a content pass over all 18 drugs and their gear, a content warning, GitHub-only install.

## Next

- **v1.0.** Two or three real table sessions on 0.10.0 with no surprises, then the same code is stamped 1.0 with no code changes.
- **After v1.0**, in no fixed order:
  - Coating a weapon with a drug (dnd5e enchant activities).
  - Letting a player roll the addiction save when someone else doses their character.
  - Per-drug icons and visual effects.
  - Authoring tutorials.

## Out of scope

- **The Foundry package registry. Never.** The content is adult, and the module
  is hosted on GitHub. Installs come from the manifest URL in the README.
- **A custom "Addicted" condition.** Active Effects and the existing Poisoned
  condition cover this; adding a bespoke condition record is a hat on a hat.
- **A schema migration framework.** Sheet-level rendering with
  default-on-missing flag reads is the right "migration" path for this module:
  when we change how items render, the new code reads whatever's there and
  falls back to defaults. Documents aren't touched. World items GMs have edited
  stay edited. GM-from-scratch items are unaffected. Module-shipped compendium
  items get replaced wholesale by Foundry's normal update flow. The only case
  where a framework would matter is a semantic rewrite of an existing flag
  meaning, and even there, handling it at the read site is cheaper than a
  framework. The empty `MIGRATORS` skeleton in `scripts/migrations.js` stays
  as-is in case that case ever arises.
