# Substances and Paraphernalia

A FoundryVTT module for D&D 5e that adds illicit substances and the paraphernalia
required to consume them. Three settings (Fantasy, Sci-Fi, Modern), three
categories (Stimulant, Mind-Altering, Performance-Enhancing), an Activity-flow
gate that blocks consumption when the right gear isn't ready, and a save-on-use
addiction loop with paraphernalia-granted bypasses.

> **Status:** pre-1.0, work in progress.
> Compatibility target: **FoundryVTT V13** and **dnd5e 5.2.5**.
> Not yet on the Foundry package registry.

## Requirements

| Module | Role | Required? |
|--------|------|-----------|
| [Dynamic Active Effects (DAE)](https://foundryvtt.com/packages/dae) | Powers AE Changes that use DAE-only modes (e.g. `macro.tokenMagic`) | **Yes** |
| [Midi-QoL](https://foundryvtt.com/packages/midi-qol) | Intercepts the addiction save dialog and drives the save workflow | **Yes** |
| [Token Magic FX](https://foundryvtt.com/packages/tokenmagic) | Visual overlays on substance benefit AEs (`Altered by *`) | **Yes** |
| [Times Up](https://foundryvtt.com/packages/times-up) | Automatic AE duration expiry | No (recommended) |

Foundry refuses to activate the module without DAE, Midi-QoL, and Token Magic FX
installed and active.

## What ships

### Compendium packs (under "Illicit Compendia")

- **Illicit Substances** — 19+ consumables across the 3x3 setting x category
  matrix, each with addiction tuning, benefit AE, addiction AE, and withdrawal
  AE templates.
- **Illicit Paraphernalia** — 11+ equipment and consumable items with subtype,
  administration-type matching (`appliesTo`), and optional save-bypass AEs.
- **Illicit Macros** — Remove Addiction, Remove Altered, Remove Overdose,
  Remove Tolerance, Remove Withdrawal, and Toggle Paraphernalia Enforcement.
- **GM Guide** — single-page journal pointing to the
  [GitHub wiki](https://github.com/themrbeasley/substances-and-paraphernalia/wiki)
  for full documentation.

### Automation hooks

- **`dnd5e.preUseActivity` gate** — blocks substance use when matching
  paraphernalia is missing or unready. The gate keys off the dnd5e Poison
  subtype on the substance (`system.type.subtype`) and matches against
  paraphernalia `appliesTo`. "Use anyway" override available to all users.
- **`dnd5e.postUseActivity` addiction loop** — rolls a Constitution save
  against the substance's DC, consults the modifier pipeline for save bypasses
  (`auto-pass > advantage > +N`), and applies the Addiction AE on failure.
- **`dnd5e.restCompleted` long-rest tick** — GM-arbitrated: decrements
  withdrawal counters, removes addiction/withdrawal AEs when the count reaches
  zero, and prompts voluntary abstain.

### Additional mechanics

- **Tolerance** — auto-stacks on a passed addiction save.
- **Overdose** — d100 roll per consumption with a marker AE.
- **Poisoned coupling** — three modes (`linked-cascade`, `linked-isolated`,
  `independent`) controlling how the Poisoned condition interacts with addiction.
- **Voluntary abstain** — long-rest dialog button to voluntarily skip a substance.
- **Withdrawal vignette** — per-owner CSS overlay with per-substance colors
  authored on the withdrawal AE template.
- **Simulate-dose** — 3-dot menu dry-run on substance items.
- **Paraphernalia Subtype Manager** — settings menu for adding custom subtypes
  beyond the built-in list.
- **Drag-to-inventory dialog** — state-injection when substances are dropped
  onto actors (GM/ASSISTANT).
- **TMFX visual overlays** — DAE-driven `macro.tokenMagic` Change rows on
  `Altered by *` benefit AEs, with nine setting x category preset filters.

## Authoring

Substances and paraphernalia are authored on the dnd5e item sheet's
**Details tab**. The wiki has the full authoring guide:

- **[Authoring](https://github.com/themrbeasley/substances-and-paraphernalia/wiki/Authoring)** —
  Details-tab fields, flag shapes, AE conventions, worked examples.
- **[Save Bypass Tiers](https://github.com/themrbeasley/substances-and-paraphernalia/wiki/Save-Bypass-Tiers)** —
  `auto-pass > advantage > +N` pipeline.
- **[Mechanics](https://github.com/themrbeasley/substances-and-paraphernalia/wiki/Mechanics)** —
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

Code is MIT — see [LICENSE](LICENSE). Lore and journal text intended to ship
under CC-BY-4.0 once the lore corpus is large enough to be worth attributing.
