# Authoring

Substances and paraphernalia are dnd5e items with a `flags["substances-and-paraphernalia"]` block. The module surfaces the authoring surface as a dedicated **Details** tab on the dnd5e item sheet.

## Substance flag block

```js
flags["substances-and-paraphernalia"] = {
  kind: "substance",
  category: "stimulant" | "mindAltering" | "performanceEnhancing",
  setting: "fantasy" | "sciFi" | "modern",
  addiction: {
    enabled: true,
    save: { ability: "con", dc: 13 },         // rolled after each use, unless the character is already addicted
    addictionEffectIds: ["<ae._id>"]          // addiction AE templates on this item
  },
  withdrawal: {
    enabled: true,
    dc: 15,                                   // Constitution Withdrawal Save
    abstain: { ability: "wis", dc: 11 },      // Abstain Check at each Long Rest
    duration: { value: 3, unit: "days" },     // minutes | hours | days | weeks | months
    effectIds: ["<ae._id>"]                   // withdrawal AE templates on this item
  },
  tolerance: {                                // optional; defaults shown
    enabled: true,
    decay: 1,                                 // count lost at each Long Rest without a dose
    attenuationCurve: [1, 0.5, 0.25, 0.125, 0],
    effectIds: ["<ae._id>"]                   // optional tolerance marker template
  },
  overdose: {                                 // optional
    enabled: true,
    chancePercent: 10,
    description: "<description shown on the overdose effect>",
    effectIds: ["<ae._id>"]                   // overdose AE templates on this item
  },
  schemaVersion: 7
};
```

A blank DC means "no roll", never DC 0: a blank Abstain DC skips the Wisdom check, and a blank Withdrawal DC means there is no save, so withdrawal starts. A blank tolerance decay uses the default (1). `npm run validate` rejects blank DCs in shipped content.

`system.type.value` must be `"poison"` and `system.type.subtype` must be one of `contact`, `ingested`, `inhaled`, `injury`; that's the administration channel the gate and bypass logic key on. (The legacy per-substance `requiredSubtypes` callout was removed in v0.5; gating now keys on this admin type matched against a paraphernalia-side `appliesTo` admin list.)

`system.uses` should be `{ max: "1", autoDestroy: true }`; the activity should have a Consumption target of type *Item Uses* with value 1, so each use spends one dose from the quantity. When the last dose goes, the module keeps the substance at 0 instead of letting dnd5e delete it, so the Long Rest can still list it. Don't add Altered effects to the activity's effect list: the module applies them itself, scaled by tolerance, and blocks the copy Midi-QoL or the chat card would add, so listing them only leaves a dead apply button.

## Paraphernalia flag block

```js
flags["substances-and-paraphernalia"] = {
  kind: "paraphernalia",
  setting: "fantasy" | "sciFi" | "modern",
  subtype: "snuff-horn",                      // built-in or custom (see Subtype Manager)
  schemaVersion: 3
};
```

Per-day uses for bypass-granting paraphernalia ride on dnd5e's native `system.uses.recovery: [{ period: "day", type: "recoverAll" }]`. The validator requires this when an embedded bypass AE declares `usesPerDay`.

## Choosing a Save Ability

The Save Ability dropdown defaults to **Constitution** because most
homebrew substances are stimulants or performance-enhancers where
physical dependence is the right fit. The shipped compendium varies
by category:

- **Stimulants** and **Performance-Enhancers** call Constitution saves
  (resist physical dependence).
- **Mind-Altering** substances call Wisdom saves (resist psychic
  compulsion, in line with 2024 D&D's resist-charm-fear convention).

Override freely. The schema accepts any save ability; the UI default
and the shipped content are conventions, not rules.

> The shipped compendium content is being rewritten in v0.9 (Item 12 of
> the roadmap) to apply this convention consistently across every
> mind-altering substance. Until then, some existing content still uses
> Constitution saves for mind-altering substances; that's the legacy
> baseline, not the design intent.

## Active Effect name contracts

The module prefers the `flags.substances-and-paraphernalia.aeRole` flag (see *AE Conventions* below); substring matching against the AE name is a warn-logged fallback for hand-authored AEs without the flag. Names are case-insensitive.

| AE role | Required substring | Notes |
|---|---|---|
| Addiction | `addict` | Pointed-to by `addiction.addictionEffectIds`. |
| Benefit (altered) | `altered` | Convention: `Altered by {Substance}`. An untagged effect named this way is treated as the high. |
| Withdrawal | `withdraw` | Pointed-to by `withdrawal.effectIds`. Validator warns if it imposes disadvantage on attacks/checks (duplicates *poisoned*). |
| Tolerance | `tolerance` | Optional marker template on the substance (`tolerance.effectIds`); without one the module shows a plain "Tolerance to X (n)" marker. Tolerance itself is a count on the actor (see Mechanics). |
| Overdose | `overdose` | Pointed-to by `overdose.effectIds`; applied when the overdose roll hits. |
| Bypass (paraphernalia) | (no contract) | Lives on the paraphernalia as a `transfer: true` AE with the `bypass` modifier flag block. |

## AE Conventions: the `aeRole` flag

Every module-created Active Effect carries a flag at
`flags.substances-and-paraphernalia.aeRole`. Values:

| `aeRole`     | Used for                                         |
|--------------|--------------------------------------------------|
| `addiction`  | The persistent addiction AE on an addicted actor |
| `withdrawal` | The withdrawal AE, applied on a failed Constitution Withdrawal Save at a Long Rest; when it ends, so does the addiction |
| `altered`    | The benefit AEs (the high) applied by each dose  |
| `tolerance`  | Tolerance marker (the drug's template or a plain one); the count lives on the actor |
| `overdose`   | Overdose marker AE                               |
| `bypass`     | Paraphernalia bypass AE                          |

**Why:** AE name strings vary by locale and author preference. Reading the
role from a flag is locale-independent. Substring matching against the AE
name (`addict`, `withdraw`, `altered`, `tolerance`, `overdose`, `bypass`)
remains as a **warn-logged fallback** so hand-authored AEs continue to
work; the console warns each time the fallback fires so a GM can add
the flag manually when authoring conventions are uncertain.

**For homebrew authors:** when you create an AE outside the module's
templates (e.g. directly in the AE editor), add the `aeRole` flag. The
Remove-X macros and the modifier pipeline both prefer the flag.

## Modifier flag block (on bypass AEs)

```js
// Bypass (paraphernalia, transfer:true)
flags["substances-and-paraphernalia"].modifier = {
  kind: "bypass",
  type: "auto-pass" | "advantage" | "+N",
  bonus: 2,                                   // required when type === "+N"
  appliesTo: ["inhaled"],                     // administration ids the bypass covers
  usesPerDay: "@prof"                         // optional; rides on system.uses
};
```

Tolerance does not use a modifier block: it is a count on the actor, tuned per substance by `tolerance.decay` and optionally `tolerance.attenuationCurve` (see Mechanics).

## Tuning Withdrawal Duration

Withdrawal duration is authored directly as a **value + unit** pair on the
Details tab. The Withdrawal Duration field (number) and unit selector
(`minutes | hours | days | weeks | months`) together compose the lifetime of
the Withdrawal AE that lands at long rest if the addicted actor fails their
Abstain → Withdrawal Save chain. The helper `durationToSeconds(value, unit)`
in `scripts/data/withdrawal-duration.js` is the canonical converter (months
are 30-day months, approximate by design). The seconds value rides on the
applied AE's V14 duration (`value` + `units: "seconds"`); Foundry core
expires it when world time passes.

Because game time owns expiry, withdrawal no longer ticks down per long rest
and no longer scales against Constitution: every addict on a given substance
suffers the same authored duration window. The actor's Con modifier still
gates onset via the Withdrawal Save DC. Withdrawal ends when its time runs
out, when a GM or the Remove Withdrawal macro removes it (both end the
addiction too), or when the character takes a dose during it (a relapse, which
keeps the addiction).

**Picking a value:** choose a unit that matches the narrative weight of the
substance and the table's expected pacing.

| Substance feel | Suggested duration |
|---|---|
| Casual recreational | 1–6 hours |
| Hard street drug | 1–3 days |
| Magical or alien narcotic | 1–2 weeks |
| Setpiece, plot-relevant addiction | 1–3 months |

Avoid mixing minutes with months on the same campaign: pick a unit family
that fits the table's clock so players can plan around it. If a substance
should leave a permanent mark, prefer authoring an additional non-expiring
"former addict" AE separately rather than inflating the withdrawal window
past the campaign's natural arc.

## Language Conventions

User-facing content (item descriptions, AE names, lang/en.json strings,
template prose) follows 2024 D&D 5e PHB phrasing. `npm run validate` warns
on the most common drifts; in v0.8 these warnings are advisory, in v0.9 they
flip to errors.

| Anti-pattern | Use instead |
|---|---|
| "becomes poisoned" | "gains the Poisoned condition" |
| "roll a Constitution save" | "make a Constitution saving throw" |
| "make a Con save" (bare) | "make a Constitution saving throw" |
| "restores 1d4 hit points" | "regains 1d4 hit points" |
| "recovers 5 hit points" | "regains 5 hit points" |
| "once per day" | "regains all expended uses at dawn" *or* "can't use this again until you finish a Long Rest" |
| "long rest" / "short rest" (lower) | "Long Rest" / "Short Rest" |
| "poisoned" as a condition reference | "Poisoned" (capitalize condition names) |
| "Fire damage" / "Cold damage" in prose | "fire damage" / "cold damage" (lowercase damage types in prose) |

The validator only flags damage types and condition names as drift in **prose
context** (lang/en.json strings, .hbs templates). It does not flag them in
data fields. For example, `"subtype": "poisoned"` is a dnd5e keyword, not the
condition name, and is left alone.

The full rule set lives in `tools/validate-content-language.mjs`. Authors who
add a new shipped substance should run `npm run validate` and resolve any
warnings before committing.

## Details tab

Open any substance item; the dnd5e Details tab shows a **Substance Properties** section:

- **Category** selector.
- **Addiction**: enabled toggle, save ability, save DC (with the recommended-range hint), and the Addiction effect picker.
- **Withdrawal**: enabled toggle, Withdrawal DC (with a preview of its tier), Abstain ability and DC, duration (value and unit), and the withdrawal effect picker.
- **Overdose**: enabled toggle, chance percent (1 to 100), description, and the Overdose effect picker.
- **Tolerance**: enabled toggle, decay per Long Rest, and the optional tolerance effect picker.

Each effect picker can create a blank template with the right name; the module tags its role when it applies the effect. The administration type is the dnd5e Poison subtype on the item's own Details fields.

For paraphernalia items, the Details tab shows **Paraphernalia Properties**: the **Subtype** select (built-ins + custom), the administration types it applies to (`appliesTo` checkboxes), and the **Save bypass** section (type, bonus, uses per day, and a button that adds the bypass effect).
