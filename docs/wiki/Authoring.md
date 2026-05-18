# Authoring

Substances and paraphernalia are dnd5e items with a `flags["substances-and-paraphernalia"]` block. The module surfaces the authoring surface as a dedicated **Details** tab on the dnd5e item sheet.

## Substance flag block

```js
flags["substances-and-paraphernalia"] = {
  kind: "substance",
  category: "stimulant" | "mindAltering" | "performanceEnhancing",
  setting: "fantasy" | "sciFi" | "modern",
  addiction: {
    save: { ability: "con", dc: 13 },
    withdrawalMod: 3,
    addictionEffectId: "<ae._id>"             // points to the addiction AE template
  },
  withdrawalEffectId: "<ae._id>",             // optional; defaults to v0.3 template
  overdose: {                                 // optional
    enabled: true,
    chancePercent: 5,
    description: "<chat-card body>"
  },
  schemaVersion: 3
};
```

`system.type.value` must be `"poison"` and `system.type.subtype` must be one of `contact`, `ingested`, `inhaled`, `injury` — that's the administration channel the gate and bypass logic key on. (The legacy per-substance `requiredSubtypes` callout was removed in v0.5; gating now keys on this admin type matched against a paraphernalia-side `appliesTo` admin list.)

`system.uses` should be `{ max: "1", autoDestroy: true }`; the activity should have a Consumption target of type *Item Uses* with value 1 so dnd5e auto-destroys the consumable on use.

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
> Constitution saves for mind-altering substances — that's the legacy
> baseline, not the design intent.

## Active Effect name contracts

The module prefers the `flags.substances-and-paraphernalia.aeRole` flag (see *AE Conventions* below); substring matching against the AE name is a warn-logged fallback for hand-authored AEs without the flag. Names are case-insensitive.

| AE role | Required substring | Notes |
|---|---|---|
| Addiction | `addict` | Pointed-to by `addiction.addictionEffectId`. |
| Benefit (altered) | (no contract) | Convention: `Altered by {Substance}`. |
| Withdrawal | `withdraw` | Pointed-to by `withdrawalEffectId`. Validator warns if it imposes disadvantage on attacks/checks (duplicates *poisoned*). |
| Tolerance | `tolerance` | Template lives on the substance with the `tolerance` modifier flag block. |
| Overdose marker | `overdose` | Applied when the d100 roll hits. |
| Bypass (paraphernalia) | (no contract) | Lives on the paraphernalia as a `transfer: true` AE with the `bypass` modifier flag block. |

## AE Conventions: the `aeRole` flag

Every module-created Active Effect carries a flag at
`flags.substances-and-paraphernalia.aeRole`. Values:

| `aeRole`     | Used for                                         |
|--------------|--------------------------------------------------|
| `addiction`  | The persistent addiction AE on an addicted actor |
| `withdrawal` | The withdrawal AE applied when an addiction expires |
| `altered`    | The benefit AE applied during the substance's altered state |
| `tolerance`  | Per-substance tolerance stacks                   |
| `overdose`   | Overdose marker AE                               |
| `bypass`     | Paraphernalia bypass AE                          |

**Why:** AE name strings vary by locale and author preference. Reading the
role from a flag is locale-independent. Substring matching against the AE
name (`addict`, `withdraw`, `altered`, `tolerance`, `overdose`, `bypass`)
remains as a **warn-logged fallback** so hand-authored AEs continue to
work — the console warns each time the fallback fires so a GM can add
the flag manually when authoring conventions are uncertain.

**For homebrew authors:** when you create an AE outside the module's
templates (e.g. directly in the AE editor), add the `aeRole` flag. The
Remove-X macros and the modifier pipeline both prefer the flag.

## Modifier flag block (on bypass / tolerance AEs)

```js
// Bypass (paraphernalia, transfer:true)
flags["substances-and-paraphernalia"].modifier = {
  kind: "bypass",
  type: "auto-pass" | "advantage" | "+N",
  bonus: 2,                                   // required when type === "+N"
  appliesTo: ["inhaled"],                     // administration ids the bypass covers
  usesPerDay: "@prof"                         // optional; rides on system.uses
};

// Tolerance (substance, template AE — module clones onto actor on save pass)
flags["substances-and-paraphernalia"].modifier = {
  kind: "tolerance",
  substanceId: "<itemId>",
  attenuateAltered: { durationFactor: 0.1, modifierFactor: 0.1, dropAdvantage: false },
  addictionDcBump: 1,
  withdrawalAmplify: { durationFactor: 0.1, modifierFactor: 0.1, addDisadvantage: false }
};
```

## Tuning Withdrawal Duration

Withdrawal duration is authored directly as a **value + unit** pair on the
Details tab. The Withdrawal Duration field (number) and unit selector
(`minutes | hours | days | weeks | months`) together compose the lifetime of
the Withdrawal AE that lands at long rest if the addicted actor fails their
Abstain → Withdrawal Save chain. The helper `durationToSeconds(value, unit)`
in `scripts/data/withdrawal-duration.js` is the canonical converter (months
are 30-day months — approximate by design). The seconds value rides on the
applied AE's `duration` and is enforced by **Times-Up** (bundled with DAE).

Because Times-Up owns expiry, withdrawal no longer ticks down per long rest
and no longer scales against Constitution — every addict on a given substance
suffers the same authored duration window. The actor's Con modifier still
gates onset via the Withdrawal Save DC; once the AE lands, only game time
removes it.

**Picking a value:** choose a unit that matches the narrative weight of the
substance and the table's expected pacing.

| Substance feel | Suggested duration |
|---|---|
| Casual recreational | 1–6 hours |
| Hard street drug | 1–3 days |
| Magical or alien narcotic | 1–2 weeks |
| Setpiece, plot-relevant addiction | 1–3 months |

Avoid mixing minutes with months on the same campaign — pick a unit family
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
data fields — e.g. `"subtype": "poisoned"` is a dnd5e keyword, not the
condition name, and is left alone.

The full rule set lives in `tools/validate-content-language.mjs`. Authors who
add a new shipped substance should run `npm run validate` and resolve any
warnings before committing.

## Details tab

Open any substance item; the dnd5e Details tab now shows:

- **Kind / Category / Setting** selectors.
- **Required subtypes** picker (built-ins + custom subtypes from the Manage Subtypes menu).
- **Addiction** block: ability, DC, withdrawal modifier, addiction-AE picker.
- **Withdrawal AE picker** + content-guidance hint (don't duplicate poisoned; escalate instead).
- **Overdose fieldset**: enabled toggle, chance percent (1-100), description.

For paraphernalia items, the Details tab shows the **Subtype** select (built-ins + custom). Bypass authoring lives on the Active Effects tab — add a `transfer: true` AE and write the modifier flag block.
