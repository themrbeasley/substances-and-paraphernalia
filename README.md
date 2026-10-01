# Substances and Paraphernalia

A FoundryVTT module for D&D 5e that adds illicit substances and the paraphernalia
required to consume them. Three settings (Fantasy, Sci-Fi, Modern), three
categories (Stimulant, Mind-Altering, Performance-Enhancing), an Activity-flow
gate that blocks consumption when the right gear isn't ready, and a save-on-use
addiction loop with paraphernalia-granted bypasses.

> **Status:** pre-1.0, work in progress.
> Compatibility target: **FoundryVTT V14** (build 368+) and **dnd5e 5.3.x**.
> Not yet on the Foundry package registry.

## Requirements

| Module | Role | Required? |
|--------|------|-----------|
| [Dynamic Active Effects (DAE)](https://foundryvtt.com/packages/dae) | Powers AE Changes that use DAE-only change types (e.g. `macro.tokenMagic`) | **Yes** |
| [Midi-QoL](https://foundryvtt.com/packages/midi-qol) | Intercepts the addiction save dialog and drives the save workflow | **Yes** |
| [Token Magic FX](https://foundryvtt.com/packages/tokenmagic) | Visual overlays on substance benefit AEs (`Altered by *`) | **Yes** |

Foundry refuses to activate the module without DAE, Midi-QoL, and Token Magic FX
installed and active.

## What ships

### Compendium packs (under "Illicit Compendia")

- **Illicit Substances**: 18 consumables across the 3x3 setting x category
  matrix, each with addiction tuning and benefit (Altered), addiction, and
  withdrawal AE templates; the six performance enhancers also carry an
  overdose AE.
- **Illicit Paraphernalia**: 12 equipment and consumable items with subtype,
  administration-type matching (`appliesTo`), and optional save-bypass AEs.
- **Illicit Macros**: Remove Addiction, Remove Altered, Remove Overdose,
  Remove Tolerance, Remove Withdrawal, and Toggle Paraphernalia Enforcement.
- **GM Guide**: single-page journal pointing to the
  [GitHub wiki](https://github.com/themrbeasley/substances-and-paraphernalia/wiki)
  for full documentation.

### Automation hooks

- **`dnd5e.preUseActivity` gate**: blocks substance use when matching
  paraphernalia is missing or unready. The gate keys off the dnd5e Poison
  subtype on the substance (`system.type.subtype`) and matches against
  paraphernalia `appliesTo`. "Use anyway" override available to all users.
- **`dnd5e.postUseActivity` dose pipeline**: a dose during withdrawal ends
  the withdrawal (relapse); the addiction save, with save bypasses from
  paraphernalia (`auto-pass > advantage > +N`), applies the Addiction AE on a
  fail; the high is applied, scaled by tolerance; tolerance rises; overdose is
  checked.
- **`dnd5e.preRestCompleted` Long Rest**: runs on the client that rests.
  Tolerance fades for drugs the character isn't addicted to; the Withdrawal
  Choices dialog lets an addicted character abstain (Wisdom check: fail is a
  relapse) and face the Withdrawal Save (fail: withdrawal for the authored game
  time). When withdrawal ends, so does the addiction.

### Additional mechanics

- **Tolerance**: rises with every dose, weakens the high, fades at Long Rests,
  and shows on the character as a "Tolerance to X (n)" marker.
- **Overdose**: once tolerance to a drug is at its cap, each dose rolls d100
  against the drug's chance; on for the six performance enhancers.
- **Poisoned coupling**: three modes (`linked-cascade`, `linked-isolated`,
  `independent`) controlling how the Poisoned condition interacts with addiction.
- **Withdrawal Choices**: at a Long Rest an addicted character picks, per drug, to abstain or take a dose.
- **Withdrawal vignette**: per-owner CSS overlay with per-substance colors
  authored on the withdrawal AE template.
- **Simulate-dose**: 3-dot menu dry-run on substance items.
- **Paraphernalia Subtype Manager**: settings menu for adding custom subtypes
  beyond the built-in list.
- **Drag-to-inventory dialog**: state-injection when substances are dropped
  onto actors (GM/ASSISTANT).
- **TMFX visual overlays**: DAE-driven `macro.tokenMagic` Change rows on
  `Altered by *` benefit AEs, with nine setting x category preset filters.

## Authoring

Substances and paraphernalia are authored on the dnd5e item sheet's
**Details tab**. The wiki has the full authoring guide:

- **[Authoring](https://github.com/themrbeasley/substances-and-paraphernalia/wiki/Authoring)**:
  Details-tab fields, flag shapes, AE conventions, worked examples.
- **[Save Bypass Tiers](https://github.com/themrbeasley/substances-and-paraphernalia/wiki/Save-Bypass-Tiers)**:
  `auto-pass > advantage > +N` pipeline.
- **[Mechanics](https://github.com/themrbeasley/substances-and-paraphernalia/wiki/Mechanics)**:
  full mechanics reference.

Active Effect naming is a contract: addiction AEs contain `addict`,
withdrawal AEs contain `withdraw`, overdose AEs contain `overdose`,
tolerance AEs contain `tolerance`, benefit AEs follow
`Altered by {Substance}` (all case-insensitive).

## Development

```sh
npm install
npm run lint        # eslint
npm run validate    # module.json + content invariants
npm run test:unit   # node --test (pure-function tests)
npm run pack        # _source/*.json → packs/*.leveldb
npm run unpack      # packs/*.leveldb → _source/*.json
```

A Quench-based integration test suite registers automatically when the
[Quench](https://foundryvtt.com/packages/quench) module is active in the
test world.

CI runs lint, validate, unit tests, and pack on every push and pull request
(see [.github/workflows/ci.yml](.github/workflows/ci.yml)).

`packs/` and `node_modules/` are gitignored. The source of truth for compendium
content lives in `_source/`.

## License

Code is MIT; see [LICENSE](LICENSE). Lore and journal text intended to ship
under CC-BY-4.0 once the lore corpus is large enough to be worth attributing.
