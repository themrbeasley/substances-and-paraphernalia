# Substances and Paraphernalia

A FoundryVTT module for D&D 5e that adds illicit substances and the paraphernalia
required to consume them. Three settings (Fantasy, Sci-Fi, Modern), three
categories (Stimulant, Mind-Altering, Performance-Enhancing), and an Activity-flow
gate that blocks consumption when the right gear isn't ready.

> Status: pre-1.0, work in progress. Compatibility target is FoundryVTT V13 and
> dnd5e 4.0+. Not yet on the Foundry package registry.

## What ships

- Compendium of substances (consumables) with required-paraphernalia flags.
- Compendium of paraphernalia (equipment and one-shot consumables).
- A GM Guide journal explaining the gating rules and authoring schema.
- A `Toggle Paraphernalia Enforcement` macro for the hotbar.
- A `dnd5e.preUseActivity` hook that blocks substance use when required
  paraphernalia is missing or unready, with a `Use anyway` override.

Optional modules — Dynamic Active Effects, Midi-QoL, Times Up, Token Magic FX —
are detected at ready and warned about if missing. None are required.

## Authoring

Flag schema and worked examples live in [docs/flag-schema.md](docs/flag-schema.md).
The short version:

```js
flags["substances-and-paraphernalia"] = {
  kind: "substance" | "paraphernalia",
  setting: "fantasy" | "sciFi" | "modern",
  category: "stimulant" | "mindAltering" | "performanceEnhancing", // substance
  paraphernaliaId: "kebab-case-slug",                              // paraphernalia
  requiredParaphernalia: [{ anyOf: ["slug-or-Compendium.UUID"] }], // substance
  schemaVersion: 1
};
```

## Development

```sh
npm install
npm run lint        # eslint
npm run validate    # module.json schema check
npm run pack        # _source/*.json → packs/*.leveldb
npm run unpack      # packs/*.leveldb → _source/*.json
```

`packs/` and `node_modules/` are gitignored. The source of truth for compendium
content lives in `_source/`.

## License

Code is MIT — see [LICENSE](LICENSE). Lore and journal text intended to ship
under CC-BY-4.0 once the lore corpus is large enough to be worth attributing.
