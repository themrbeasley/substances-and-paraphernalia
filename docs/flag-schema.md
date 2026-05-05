# Flag Schema — authoring reference

This document is the canonical reference for the flags this module reads on
items. It is the source of truth for anyone authoring substances or
paraphernalia by hand at v0.1.

All flags live under the namespace `flags["substances-and-paraphernalia"]` on
each item.

## Common fields

| Key             | Type     | Required | Notes                                             |
| --------------- | -------- | -------- | ------------------------------------------------- |
| `kind`          | string   | yes      | `"substance"` or `"paraphernalia"`.               |
| `setting`       | string   | yes      | `"fantasy"`, `"sciFi"`, or `"modern"`.            |
| `tags`          | string[] | no       | Free-form tags for search/filter.                 |
| `schemaVersion` | number   | yes      | Always `1` at v0.1. Migrations bump this.         |

The legal values of `kind` and `setting` are mirrored in
`scripts/data/schema.json` so the same list drives the lang file, settings,
and any future builder.

## Substance (`kind: "substance"`)

Used on a `consumable` Item. Apply effects to the actor when consumed; gating
runs on the dnd5e Activity path (`dnd5e.preUseActivity`).

| Key                     | Type                       | Required | Notes                                          |
| ----------------------- | -------------------------- | -------- | ---------------------------------------------- |
| `category`              | string                     | yes      | `"stimulant"`, `"mindAltering"`, `"performanceEnhancing"`. |
| `requiredParaphernalia` | `{ anyOf: string[] }[]`    | no       | AND-of-OR. See below. Empty/missing = no gate. |

### `requiredParaphernalia` semantics

The outer array is **AND**: every entry must be satisfied.
Within an entry, `anyOf` is **OR**: any single referenced paraphernalia
satisfies the entry.

Each entry in `anyOf` is a **reference string**, resolved by
`actorHasParaphernalia` against the actor's inventory:

- A string starting with `"Compendium."` is treated as a Compendium UUID.
  Resolved against `_stats.compendiumSource` first (V12+), then a direct
  `uuid` match. Stable across slug renames; what shipped substances should
  use to point at shipped paraphernalia once they are in the user's world.
- Any other string is treated as a slug, matched against the
  `paraphernaliaId` flag on the actor's items. The author-friendly path for
  user-built content.

### Examples

Singleton requirement:

```json
"requiredParaphernalia": [
  { "anyOf": ["snuff-horn"] }
]
```

OR — actor needs either:

```json
"requiredParaphernalia": [
  { "anyOf": ["neural-diffuser", "vapor-mask"] }
]
```

AND — actor needs both:

```json
"requiredParaphernalia": [
  { "anyOf": ["tincture-dropper"] },
  { "anyOf": ["athletes-logbook"] }
]
```

AND-of-OR — actor needs one from each group:

```json
"requiredParaphernalia": [
  { "anyOf": ["pipe-fine", "pipe-rough"] },
  { "anyOf": ["match-tin", "tinderbox"] }
]
```

## Paraphernalia (`kind: "paraphernalia"`)

Used on `equipment` (durable, e.g. a pipe) or `consumable` (one-shot, e.g.
rolling papers). The Item's dnd5e type drives the readiness rules below; we
otherwise only check the flag.

| Key               | Type   | Required | Notes                                            |
| ----------------- | ------ | -------- | ------------------------------------------------ |
| `paraphernaliaId` | string | yes      | Stable slug. Substances reference this string.   |

Slugs should be kebab-case, lowercase, ASCII. They are a contract: once a
substance ships pointing at `snuff-horn`, that slug is permanent.

### Readiness rules

The gate checks more than inventory presence — paraphernalia must be ready
to use:

- **Equipment paraphernalia** (e.g. a pipe, a snuff horn) must have
  `system.equipped === true`.
- **Consumable paraphernalia** (e.g. a tincture dropper, rolling papers)
  must have `system.quantity > 0`. dnd5e consumables have no equipped
  slot, so quantity is the analogue.
- **Attunement-required paraphernalia** (`system.attunement === "required"`)
  must have `system.attuned === true` on the actor's copy. dnd5e tracks
  attunement state on the actor; the gate honours it.

When the gate fires, every user (GM or player) sees the same dialog naming
the substance and the missing groups, with reasons annotated — "(not
equipped)" or "(not attuned)" — when at least one candidate is on the
actor but unready. If no candidate is on the actor, the group is reported
as plain "missing". The dialog offers "Use anyway" and "Cancel"; this
mirrors how dnd5e surfaces missing-resource overrides (no spell slot, no
Lay on Hands points). Player override is intentional — abuse is a social
problem the GM handles at the table, not one the module enforces.

## Effect-level flags (`requiresDae`)

Some substances ship Active Effects that rely on DAE-only modes (e.g. custom
formulas, override scripts). Without DAE, those modes silently no-op — the
effect appears applied but the mechanical change never lands. To make the
failure mode visible, the module reads a per-effect flag.

Set the flag on the Active Effect itself (not the item):

```json
"effects": [
  {
    "name": "Coalshade Rush",
    "changes": [{ "...": "..." }],
    "flags": {
      "substances-and-paraphernalia": {
        "requiresDae": true
      }
    }
  }
]
```

When **any** effect on a substance has `requiresDae: true` and the DAE module
is not active, the gate's behaviour depends on the world setting
`strictDaeRequirement`:

- **Off** (default): the substance still consumes; a warning toast tells the
  user that DAE-mode effects may silently fail.
- **On**: consumption is blocked with a clear message.

The check fires only after the paraphernalia gate has passed, so missing
paraphernalia takes priority over DAE warnings.

## Optional integrations

The module knows about four optional Foundry modules: **dae**, **midi-qol**,
**times-up**, **tokenmagic**. None are required. At ready, the module logs a
single info notification listing any that are recommended-but-missing (the
notice can be hidden via the client setting `suppressIntegrationWarnings`).
Authoring substances does not require any of them; the only effect-level
integration today is the DAE flag above.

## Worked example — substance source JSON

```json
{
  "_id": "fhSubCoalshade01",
  "_key": "!items!fhSubCoalshade01",
  "name": "Coalshade Powder",
  "type": "consumable",
  "folder": "fhSubFantasy0001",
  "system": { "...": "..." },
  "flags": {
    "substances-and-paraphernalia": {
      "kind": "substance",
      "category": "stimulant",
      "setting": "fantasy",
      "tags": ["snuff", "alchemical"],
      "requiredParaphernalia": [
        { "anyOf": ["snuff-horn"] }
      ],
      "schemaVersion": 1
    }
  }
}
```

## Worked example — paraphernalia source JSON

```json
{
  "_id": "fhParaSnuffHorn1",
  "_key": "!items!fhParaSnuffHorn1",
  "name": "Snuff Horn",
  "type": "equipment",
  "folder": "fhParaFantasy001",
  "system": { "...": "..." },
  "flags": {
    "substances-and-paraphernalia": {
      "kind": "paraphernalia",
      "setting": "fantasy",
      "paraphernaliaId": "snuff-horn",
      "tags": ["snuff", "horn", "inhalation"],
      "schemaVersion": 1
    }
  }
}
```

## Source-file conventions

The `@foundryvtt/foundryvtt-cli` compiler skips any source JSON without a
`_key` field. Use:

- `"!folders!<id>"` for folder entries.
- `"!items!<id>"` for items (both substances and paraphernalia packs).

All document IDs (`_id`) are 16-character alphanumeric. Folders use a
parent-less structure (`"folder": null`); items reference their parent folder
by id (`"folder": "fhParaFantasy001"`).

## Runtime API

The same accessors used internally are exposed on the module API for macro
authors and integrators:

```js
const api = game.modules.get("substances-and-paraphernalia").api;

api.flagSchema.getKind(item);                      // "substance" | "paraphernalia" | null
api.flagSchema.getCategory(substance);             // "stimulant" | ...
api.flagSchema.getRequiredParaphernalia(substance); // [{ anyOf: [...] }, ...]

api.references.actorHasParaphernalia(actor, "snuff-horn");
api.references.inspectParaphernalia(actor, "snuff-horn");
// → { item, ready, reason }   reason ∈ "missing"|"unequipped"|"unattuned"|null

api.requirements.evaluateSubstance(substance, actor);
// → { ok: boolean, missing: [{ anyOf: [...], reason }, ...] }

api.integrations.isActive("dae");                  // boolean
api.integrations.listMissingIntegrations();        // [{ id, labelKey }, ...]
```

## Limitations of gating (read this before authoring)

The cancellation hook (`dnd5e.preUseActivity`, wired up in Phase 4) only
fires for the dnd5e Activity path. RP-style direct inventory edits, custom
macros that bypass Activities, or right-click → "Use" outside the Activity
flow will **bypass paraphernalia gating**. This is acceptable at v0.1 and
documented in the GM journal; it is not a bug.
