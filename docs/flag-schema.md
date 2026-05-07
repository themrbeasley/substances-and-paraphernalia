# Flag Schema — authoring reference

Canonical reference for the flags this module reads on items at v0.2. The
schema is at version 2; v0.2 is a clean break from v0.1 (see
[CHANGELOG.md](../CHANGELOG.md)).

The recommended authoring path is the **Substances & Paraphernalia** section
on the dnd5e item sheet's Details tab. Hand-editing JSON is still supported
for shipped content; the in-sheet form is just faster.

All flags live under the namespace `flags["substances-and-paraphernalia"]` on
each item.

## Common fields

| Key             | Type     | Required | Notes                                             |
| --------------- | -------- | -------- | ------------------------------------------------- |
| `kind`          | string   | yes      | `"substance"` or `"paraphernalia"`.               |
| `setting`       | string   | yes      | `"fantasy"`, `"sciFi"`, or `"modern"`.            |
| `tags`          | string[] | no       | Free-form tags for search/filter.                 |
| `schemaVersion` | number   | yes      | Always `2` at v0.2. Migrations bump this.         |

The legal values of `kind` and `setting` are mirrored in
`scripts/data/schema.json` so the same list drives the lang file, settings,
and the item-settings form.

## Substance (`kind: "substance"`)

Used on a `consumable` Item. Apply effects to the actor when consumed; gating
runs on `dnd5e.preUseActivity`; addiction save runs on `dnd5e.postUseActivity`.

| Key                     | Type                       | Required | Notes                                          |
| ----------------------- | -------------------------- | -------- | ---------------------------------------------- |
| `category`              | string                     | yes      | `"stimulant"`, `"mindAltering"`, `"performanceEnhancing"`. |
| `administration`        | string                     | yes      | `"inhaled"` \| `"ingested"` \| `"injected"` \| `"sublingual"` \| `"topical"`. Drives bypass matching. |
| `addiction`             | object                     | yes      | See [Addiction block](#addiction-block) below. |
| `requiredParaphernalia` | `{ anyOf: string[] }[]`    | no       | AND-of-OR. See below. Empty/missing = no gate. |

### Addiction block

```js
addiction = {
  save: { ability: "con", dc: 13 },   // ability defaults to "con"
  withdrawalMod: 4,                   // positive integer
  addictionEffectId: "fhAECoalshAdc"  // _id of the {Substance} Addiction AE on this item
};
```

- `save.dc` is a finite number; `save.ability` is the dnd5e ability key
  (`"con"` by default; future content may use other abilities).
- `withdrawalMod` is the integer `Y` in
  `restsRemaining = max(Y − ConMod, ⌈Y/2⌉)`, minimum 1.
- `addictionEffectId` is the `_id` of an Active Effect on the same item. The
  effect's `name` must contain the substring `addict` (case-insensitive). It
  is the **template** AE — applied to the actor on a failed save.

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

Slugs and UUIDs may coexist in the same `anyOf` — the resolver tries each.

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

UUID into another compendium:

```json
"requiredParaphernalia": [
  { "anyOf": ["Compendium.substances-and-paraphernalia.fishut-illicit-paraphernalia.fhParaDubiousPip"] }
]
```

## Paraphernalia (`kind: "paraphernalia"`)

Used on `equipment` (durable, e.g. a pipe) or `consumable` (one-shot, e.g.
rolling papers). The Item's dnd5e type drives the readiness rules below; we
otherwise only check the flag.

| Key                    | Type   | Required | Notes                                             |
| ---------------------- | ------ | -------- | ------------------------------------------------- |
| `paraphernaliaId`      | string | yes      | Stable kebab-case slug. Substances reference this string. |
| `addictionSaveBypass`  | object | no       | See [Save bypass block](#save-bypass-block) below. |

Slugs should be kebab-case, lowercase, ASCII. They are a contract: once a
substance ships pointing at `snuff-horn`, that slug is permanent.

### Save bypass block

```js
addictionSaveBypass = {
  type: "auto-pass",        // v2 supports only "auto-pass"; "advantage" / "+N" reserved
  appliesTo: ["inhaled"],   // matches substance.administration; non-empty array
  usesPerDay: "@prof"       // numeric or formula; cosmetic — see below
};
```

When the substance's administration matches this paraphernalia's `appliesTo`
**and** the paraphernalia is one of the gate-satisfying items for that
substance (its slug or UUID appears in the substance's `requiredParaphernalia`),
the addiction save is auto-passed and the paraphernalia's
`system.uses.spent` increments by 1. Per-day refresh rides on dnd5e's
native item recovery — bypass-granting paraphernalia ship with
`system.uses.recovery: [{ period: "day", type: "recoverAll" }]` so a long
rest refreshes `spent` to 0. The module does **not** implement a custom
recovery hook for paraphernalia.

### Readiness rules

The gate checks more than inventory presence — paraphernalia must be ready
to use:

- **Equipment paraphernalia** (e.g. a pipe, a snuff horn) must have
  `system.equipped === true`.
- **Consumable paraphernalia** (e.g. a tincture dropper, rolling papers)
  must have `system.quantity > 0`. dnd5e consumables have no equipped
  slot, so quantity is the analogue.
- **Attunement-required paraphernalia** (`system.attunement === "required"`)
  must have `system.attuned === true` on the actor's copy.

When the gate fires, every user (GM or player) sees the same dialog naming
the substance and the missing groups, with reasons annotated — "(not
equipped)" or "(not attuned)" — when at least one candidate is on the
actor but unready. If no candidate is on the actor, the group is reported
as plain "missing". The dialog offers "Use anyway" and "Cancel"; this
mirrors how dnd5e surfaces missing-resource overrides. Player override is
intentional.

## Active Effect conventions

### Addiction template AE

Every substance ships a template Addiction AE on the item itself. On a
failed save the module clones it onto the actor. Conventions:

- Name format: `{Substance} Addiction` — e.g. *Coalshade Powder Addiction*.
- The substring `addict` must appear in the name (case-insensitive). The
  Remove Addiction macro and contract validators rely on this.
- The substance's `addiction.addictionEffectId` flag points to the
  template's `_id`.

### Applied AE on the actor

The cloned AE on the actor carries:

```js
effect.flags["substances-and-paraphernalia"].sourceSubstanceId = "<item._id>";
```

This lets the long-rest tick match an applied AE back to its actor-flag
withdrawal entry.

### Benefit AE

Auto-applied on use. Naming convention: `Altered by {Substance}`.
DAE-required variants append a parenthetical: e.g.
*Altered by Stellar Mist (Insight)*. Neutral phrasing, easy to spot in the
actor's effect list.

### `requiresDae` per-effect flag

Some substances ship Active Effects that rely on DAE-only modes. Without DAE,
those modes silently no-op. The module detects DAE-only modes implicitly;
authors can also set the flag explicitly:

```json
"effects": [
  {
    "name": "Altered by Stellar Mist (Insight)",
    "changes": [{ "...": "..." }],
    "flags": {
      "substances-and-paraphernalia": {
        "requiresDae": true
      }
    }
  }
]
```

When **any** effect on a substance is detected as DAE-required and DAE is not
active, behaviour depends on `strictDaeRequirement`:

- **Off** (default): a warning toast tells the user that DAE-mode effects may
  silently fail.
- **On**: consumption is blocked.

## Actor-side state (canonical)

Withdrawal state lives on the actor, keyed by substance `_id`:

```js
actor.flags["substances-and-paraphernalia"].withdrawal = {
  "fhSubCoalshade01": {
    restsRemaining: 4,
    appliedAt: "2026-05-05T12:00:00.000Z"
  }
};
```

The flag is the source of truth. The Active Effect on the actor is a UI
mirror; the long-rest tick uses the AE's `sourceSubstanceId` flag to match
back to the flag entry, decrements, and removes the AE when
`restsRemaining` reaches zero. The tick is GM-arbitrated (only the active
GM client decrements, to prevent double-ticks in a multi-client session).

## Worked example — substance source JSON

```json
{
  "_id": "fhSubCoalshade01",
  "_key": "!items!fhSubCoalshade01",
  "name": "Coalshade Powder",
  "type": "consumable",
  "folder": "fhSubFantasy0001",
  "system": { "...": "..." },
  "effects": [
    {
      "_id": "fhAECoalshadeAdc",
      "_key": "!items.effects!fhSubCoalshade01.fhAECoalshadeAdc",
      "name": "Coalshade Powder Addiction",
      "changes": [{ "...": "..." }]
    }
  ],
  "flags": {
    "substances-and-paraphernalia": {
      "kind": "substance",
      "category": "stimulant",
      "setting": "fantasy",
      "administration": "inhaled",
      "tags": ["snuff", "alchemical"],
      "requiredParaphernalia": [
        { "anyOf": ["snuff-horn"] }
      ],
      "addiction": {
        "save": { "ability": "con", "dc": 13 },
        "withdrawalMod": 4,
        "addictionEffectId": "fhAECoalshadeAdc"
      },
      "schemaVersion": 2
    }
  }
}
```

## Worked example — paraphernalia source JSON (with bypass)

```json
{
  "_id": "fhParaDubiousPip",
  "_key": "!items!fhParaDubiousPip",
  "name": "Shen Feng Wa's Dubious Pipe",
  "type": "equipment",
  "folder": "fhParaFantasy001",
  "system": {
    "rarity": "legendary",
    "attunement": "required",
    "uses": {
      "max": "@prof",
      "spent": 0,
      "recovery": [{ "period": "day", "type": "recoverAll" }]
    }
  },
  "flags": {
    "substances-and-paraphernalia": {
      "kind": "paraphernalia",
      "setting": "fantasy",
      "paraphernaliaId": "dubious-pipe",
      "tags": ["pipe", "dragon", "legendary"],
      "addictionSaveBypass": {
        "type": "auto-pass",
        "appliesTo": ["inhaled"],
        "usesPerDay": "@prof"
      },
      "schemaVersion": 2
    }
  }
}
```

## Source-file conventions

The `@foundryvtt/foundryvtt-cli` compiler skips any source JSON without a
`_key` field. Use:

- `"!folders!<id>"` for folder entries.
- `"!items!<id>"` for items (both substances and paraphernalia packs).
- `"!items.effects!<itemId>.<effectId>"` for embedded Active Effects.

All document IDs (`_id`) are 16-character alphanumeric. Folders use a
parent-less structure (`"folder": null`); items reference their parent folder
by id (`"folder": "fhParaFantasy001"`).

## Runtime API

The same accessors used internally are exposed on the module API for macro
authors and integrators:

```js
const api = game.modules.get("substances-and-paraphernalia").api;

// Flag accessors
api.flagSchema.getKind(item);                      // "substance" | "paraphernalia" | null
api.flagSchema.getCategory(substance);             // "stimulant" | ...
// Administration lives on the dnd5e Poison subtype:
//   substance.system.type.subtype  // "contact" | "ingested" | "inhaled" | "injury"
api.flagSchema.getAddiction(substance);            // { save, withdrawalMod, addictionEffectId }
api.flagSchema.getRequiredParaphernalia(substance); // [{ anyOf: [...] }, ...]
api.flagSchema.getAddictionSaveBypass(paraphernalia); // { type, appliesTo, usesPerDay } | null
api.flagSchema.getActorWithdrawalEntry(actor, substanceId); // { restsRemaining, appliedAt } | null
api.flagSchema.getSourceSubstanceId(effect);       // "<itemId>" | null

// References
api.references.actorHasParaphernalia(actor, "snuff-horn");
api.references.inspectParaphernalia(actor, "snuff-horn");
// → { item, ready, reason }   reason ∈ "missing"|"unequipped"|"unattuned"|null

// Requirements
api.requirements.evaluateSubstance(substance, actor);
// → { ok: boolean, missing: [{ anyOf: [...], reason }, ...] }

// Addiction
api.addiction.rollSaveAndApply(actor, substance);
api.addiction.applyOutcome(actor, substance, { saveResult: "fail", saveTotal: 7 });
//   alternative outcome shapes:
//   { alreadyAddicted: true }
//   { bypass: { bypassed: true, paraphernalia, type } }

// Save bypass
api.saveBypass.consumeBypassIfAvailable(actor, substance);
// → { bypassed: true, paraphernalia, type } | { bypassed: false }

// Integrations
api.integrations.isActive("dae");                  // boolean
api.integrations.listMissingIntegrations();        // [{ id, labelKey }, ...]
```

## Limitations of gating (read this before authoring)

The cancellation hook (`dnd5e.preUseActivity`) only fires for the dnd5e
Activity path. RP-style direct inventory edits, custom macros that bypass
Activities, or right-click → "Use" outside the Activity flow will **bypass
paraphernalia gating** and the addiction save. This is intentional — a
player who routes around the Activity flow has implicitly opted into "GM
handles this at the table".
