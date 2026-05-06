# Substances and Paraphernalia

A FoundryVTT module for D&D 5e that adds illicit substances and the paraphernalia
required to consume them. Three settings (Fantasy, Sci-Fi, Modern), three
categories (Stimulant, Mind-Altering, Performance-Enhancing), an Activity-flow
gate that blocks consumption when the right gear isn't ready, and a save-on-use
addiction loop with paraphernalia-granted bypasses.

> Status: pre-1.0, work in progress. Compatibility target is FoundryVTT V13 and
> dnd5e 4.0+. v0.2 is a clean break from v0.1 — see [CHANGELOG.md](CHANGELOG.md).
> Not yet on the Foundry package registry.

## What ships

- Compendium of substances (consumables) with addiction tuning, administration
  modes, and required-paraphernalia flags.
- Compendium of paraphernalia (equipment and one-shot consumables), including
  legendary items that grant addiction-save bypasses.
- A GM Guide journal explaining the gating rules, addiction mechanics, save
  bypass rules, and authoring schema.
- A `Toggle Paraphernalia Enforcement` macro and a GM-only `Remove Addiction`
  macro for the hotbar.
- A `dnd5e.preUseActivity` hook that blocks substance use when required
  paraphernalia is missing or unready, with a `Use anyway` override.
- A `dnd5e.postUseActivity` hook that rolls a Constitution save against the
  substance's DC, applies an Addicted Active Effect on a failed save, and
  consults equipped paraphernalia for matching auto-pass bypasses first.
- A `dnd5e.restCompleted` long-rest tick (GM-arbitrated) that decrements
  withdrawal and removes the AE when the count reaches zero.
- An item-sheet **Substance/Paraphernalia** entry in the 3-dot context menu
  for authoring substances and paraphernalia without hand-editing JSON.

Optional modules — Dynamic Active Effects, Midi-QoL, Times Up, Token Magic FX —
are detected at ready and warned about if missing. None are required.

## Authoring

The recommended path is the **Substance/Paraphernalia** entry in the item
sheet's 3-dot context menu. It opens a form rooted at the item that writes
every flag the module reads, including the addiction block, administration
mode, required paraphernalia (AND-of-OR groups), and the optional
addiction-save bypass on paraphernalia.

Full schema and worked examples live in
[docs/flag-schema.md](docs/flag-schema.md). The short version:

```js
flags["substances-and-paraphernalia"] = {
  kind: "substance" | "paraphernalia",
  setting: "fantasy" | "sciFi" | "modern",
  // substance:
  category: "stimulant" | "mindAltering" | "performanceEnhancing",
  administration: "inhaled" | "ingested" | "injected" | "sublingual" | "topical",
  addiction: {
    save: { ability: "con", dc: 13 },
    withdrawalMod: 4,
    addictionEffectId: "<aeId on this item>"
  },
  requiredParaphernalia: [{ anyOf: ["slug-or-Compendium.UUID"] }],
  // paraphernalia:
  paraphernaliaId: "kebab-case-slug",
  addictionSaveBypass: { type: "auto-pass", appliesTo: ["inhaled"], usesPerDay: "@prof" },
  schemaVersion: 2
};
```

Active Effect naming is a contract: substance addictions are named
`{Substance} Addiction` (the substring `addict` must appear,
case-insensitive); benefit AEs are named `Altered by {Substance}`.

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
