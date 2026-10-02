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
    dc: 15,                                   // Constitution save: pass = half the length, fail = full length
    abstain: { ability: "wis", dc: 11 },      // Abstain Check at each Long Rest
    duration: { value: 3, unit: "days" },     // the full length; minutes | hours | days | weeks | months
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
    damage: { formula: "2d8", type: "poison" }, // optional; a blank formula means no damage
    description: "<description shown on the overdose effect>",
    effectIds: ["<ae._id>"]                   // overdose AE templates on this item
  },
  schemaVersion: 7
};
```

A blank DC means "no roll", never DC 0: a blank Abstain DC skips the Wisdom check, and a blank Withdrawal DC means there is no save, so withdrawal lasts its full length. A blank tolerance decay uses the default (1). `npm run validate` rejects blank DCs in shipped content.

**Overdose damage.** `overdose.damage` holds a dice formula and a damage type. The formula must be plain dice (`2d6`, `1d6 + 2`, `5`), and the type one of dnd5e's damage types (`poison`, `psychic`, and so on). A blank formula means no damage. The module rolls the formula and applies it through dnd5e, so resistance, immunity and concentration saves all count. `npm run validate` rejects a malformed formula or an unknown type in shipped content; at runtime a bad value just deals no damage and the overdose still applies.

`system.type.value` must be `"poison"` and `system.type.subtype` must be one of `contact`, `ingested`, `inhaled`, `injury`; that's the administration channel the gate and bypass logic key on. (The legacy per-substance `requiredSubtypes` callout was removed in v0.5; gating now keys on this admin type matched against a paraphernalia-side `appliesTo` admin list.)

`system.uses` should be `{ max: "1", autoDestroy: true }`; the activity should have a Consumption target of type *Item Uses* with value 1, so each use spends one dose from the quantity. When the last dose goes, the module keeps the substance at 0 instead of letting dnd5e delete it, so the Long Rest can still list it. Don't add Altered effects to the activity's effect list: the module applies them itself, scaled by tolerance, and blocks the copy Midi-QoL or the chat card would add, so listing them only leaves a dead apply button.

## The dose marker and dose-others activities

Every shipped drug can be forced on another creature. Two pieces make that work.

**The dose marker** is one extra effect on the drug:

- a name like "Dosed with Voltbeans" and `flags.substances-and-paraphernalia.aeRole: "dose"` (the validator requires the role on any effect whose name has the word "dose" or "dosed");
- `transfer: false`, no Change rows, no statuses, and no `sourceSubstanceId`.

Whatever puts the marker on a creature (Midi-QoL after a failed save, a hit or a use with targets; DAE; the dnd5e Apply button) makes the module cancel the marker and run one dose on that creature instead. The marker carries nothing else on purpose: it never stays on the creature.

**A dose-others activity** lists the marker as its effect. Rules:

- It spends one dose (Consumption target *Item Uses*, value 1), like the drug's own "Use".
- It targets creatures, not the user. An activity that lists the marker doses its targets and **not its user**: the module skips the user's own dose for it. The gear check doesn't apply to it either, but the empty-drug block does (it spends the drug).
- A save activity (inhaled drugs: "Blow into a face") lists the marker with `onSave: false`, so the dose lands on a failed save.
- An attack activity (injury and contact drugs: "Jab with the needle", "Slap on a patch", "Fire a dart") **must set `otherActivityId: "none"`**. Midi-QoL pairs an attack whose `otherActivityId` is unset with the drug's own "Use" activity, and a hit would then dose the thrower too. `npm run validate` errors without it.
- An activity that spends nothing (consumption targets empty) isn't blocked at 0 doses. Stellar Mist's "Breathe the cloud" uses this so the cloud keeps working after the last bomb.
- Keep at least one activity that doses the user: the Long Rest relapse uses the first one. The validator errors when every activity doses others.

**The gas bomb** is item data on top of that: a "Throw as a gas bomb" save activity (30 feet, 20-foot sphere, 1 minute, Constitution save, the dose marker) with Midi's region behavior (`regionBehavior`: on `entry` and `turnStart`, use the activity whose Midi `identifier` is `cloud-breath`, `oncePerTurn: true`), plus a second save activity with `midiProperties: { identifier: "cloud-breath", automationOnly: true }` and no consumption.

## Withdrawal effects that hurt (OverTime rows)

A withdrawal effect can deal damage in combat with a Midi-QoL `flags.midi-qol.OverTime` Change row. The shipped rows are damage only, with no save:

| key | type | value |
|---|---|---|
| `flags.midi-qol.OverTime` | `custom` | `turn=start,damageRoll=1d4,damageType=psychic,label=Withdrawal` |

Midi runs it on the GM's client at the start of the character's turn, in combat only.

**Deleting the last withdrawal effect ends the addiction**, so nothing on a withdrawal effect may delete it early. `npm run validate` errors on a withdrawal effect that could remove itself:

- an OverTime row that carries a save (`saveDC` or `saveAbility`) without a `saveCount` or `failCount`, or with a count ending in `-`: a passed save would delete the effect;
- an OverTime row with `removeCondition`, `actionSave` or `itemName`;
- a DAE special duration;
- DAE stacking set to `none` (or `noneName`).

If you really want a save on a withdrawal tick, set `saveCount` (or `failCount`) to a very large number such as `9999`. The checker accepts any count, but a small one such as `saveCount=3` still ends the withdrawal (and with it the addiction) after that many saves. Damage-only rows have no such risk, which is why the shipped content uses them.

## Highs, penalties and tolerance

The rows the shipped drugs use, all with `priority: 20` and string values:

| Meaning | key | type | value |
|---|---|---|---|
| Advantage (disadvantage) on a skill | `system.skills.<id>.roll.mode` | `add` | `1` (`-1`) |
| Advantage on an ability's saves | `system.abilities.<abl>.save.roll.mode` | `add` | `1` (`-1`) |
| +2 to a skill | `system.skills.<id>.bonuses.check` | `add` | `+2` |
| +2 passive Perception | `system.skills.prc.bonuses.passive` | `add` | `+2` |
| Advantage on saves against being frightened | `flags.midi-qol.advantage.save.all` | `override` | `riderStatuses.frightened` |

dnd5e reads a roll mode of `1` or `-1` and ignores any other value. Tolerance rules for each kind of row:

- **Advantage and disadvantage hold.** A roll-mode row (key ending `.roll.mode`) stays at full strength until the attenuation curve reaches 0, then drops to `0`. Halving `1` would round to 0 on the second dose, so the module leaves these rows alone instead. Triple-Burn's advantage on initiative holds on the second and third dose.
- **Numeric bonuses shrink** with the curve (+2, then +1, then 0), because whole numbers round toward zero. Author a bonus of +1 and it is already gone on the second dose, so ship +2.
- **Dice never shrink.** A `+1d4` row stays a die.
- **Override and upgrade rows are never scaled.** Midi flag rows are authored as `override`, so tolerance never touches them.

The "advantage on saves against being frightened" row is a rider-status row: it applies to a save against anything that would make you Frightened (a Midi-QoL save activity that applies the condition, for example), the same pattern as Dwarven Resilience. A save made straight from the sheet doesn't know what it's against, so it rolls normally.

## Why no Exhaustion

A Change row can't add a level of Exhaustion: it does nothing (true in every dnd5e since 3.0.0). DAE's status row can add the condition, but it wipes every level when the effect ends. Adding a real level would need new code for little gain, so no withdrawal gives Exhaustion; stimulant withdrawal uses plain penalties (-2 to checks and saves, disadvantage on initiative). If you want an Exhaustion-style penalty on your own drug, write the penalty itself as Change rows.

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
and the shipped content are conventions, not rules. As of v0.10.0 every
shipped mind-altering substance follows the convention.

## Active Effect name contracts

The module prefers the `flags.substances-and-paraphernalia.aeRole` flag (see *AE Conventions* below); substring matching against the AE name is a warn-logged fallback for hand-authored AEs without the flag. Names are case-insensitive.

| AE role | Required substring | Notes |
|---|---|---|
| Addiction | `addict` | Pointed-to by `addiction.addictionEffectIds`. |
| Benefit (altered) | `altered` | Convention: `Altered by {Substance}`. An untagged effect named this way is treated as the high. |
| Withdrawal | `withdraw` | Pointed-to by `withdrawal.effectIds`. Validator warns if it imposes disadvantage on attacks/checks (duplicates *poisoned*), and errors if it could remove itself (see *Withdrawal effects that hurt*). |
| Tolerance | `tolerance` | Optional marker template on the substance (`tolerance.effectIds`); without one the module shows a plain "Tolerance to X (n)" marker. Tolerance itself is a count on the actor (see Mechanics). |
| Overdose | `overdose` | Pointed-to by `overdose.effectIds`; applied when the overdose roll hits. |
| Dose marker | `dose` (as a word) | The empty effect a dose-others activity lists; see *The dose marker and dose-others activities*. |
| Bypass (paraphernalia) | (no contract) | Lives on the paraphernalia as a `transfer: true` AE with the `bypass` modifier flag block. |

## AE Conventions: the `aeRole` flag

Every module-created Active Effect carries a flag at
`flags.substances-and-paraphernalia.aeRole`. Values:

| `aeRole`     | Used for                                         |
|--------------|--------------------------------------------------|
| `addiction`  | The persistent addiction AE on an addicted actor |
| `withdrawal` | The withdrawal AE, applied when a character abstains at a Long Rest (the Constitution save sets its length); when it ends, so does the addiction |
| `altered`    | The benefit AEs (the high) applied by each dose  |
| `tolerance`  | Tolerance marker (the drug's template or a plain one); the count lives on the actor |
| `overdose`   | Overdose marker AE                               |
| `dose`       | The dose marker; the module cancels it and doses the creature instead |
| `bypass`     | Paraphernalia bypass AE                          |

**Why:** AE name strings vary by locale and author preference. Reading the
role from a flag is locale-independent. Substring matching against the AE
name (`addict`, `withdraw`, `altered`, `tolerance`, `overdose`, `dose`, `bypass`)
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
  type: "auto-pass" | "reroll-on-fail" | "advantage" | "+N",
  bonus: 2,                                   // required when type === "+N"
  appliesTo: ["inhaled"],                     // administration ids the bypass covers
  usesPerDay: "@prof"                         // optional; rides on system.uses
};
```

Tolerance does not use a modifier block: it is a count on the actor, tuned per substance by `tolerance.decay` and optionally `tolerance.attenuationCurve` (see Mechanics).

## Tuning Withdrawal Duration

Withdrawal duration is authored directly as a **value + unit** pair on the
Details tab. The Withdrawal Duration field (number) and unit selector
(`minutes | hours | days | weeks | months`) set the **full length** of the
Withdrawal AE that lands at a Long Rest when an addicted character abstains.
The helper `durationToSeconds(value, unit)` in
`scripts/data/withdrawal-duration.js` is the canonical converter (months are
30-day months, approximate by design), and `withdrawalSeconds` applies the
save result. The seconds value rides on the applied AE's V14 duration
(`value` + `units: "seconds"`); Foundry core expires it when world time passes.

Abstaining always leads to withdrawal; the Constitution save against the
Withdrawal DC decides how long. A failed save takes the full authored length,
a passed save takes half of it. A blank or zero duration is permanent and
stays permanent either way, and a blank Withdrawal DC means full length with
no save. Withdrawal no longer ticks down per long rest and no longer scales
against Constitution: the Con modifier only decides which of the two lengths a
character gets. Withdrawal ends when its time runs out, when a GM or the
Remove Withdrawal macro removes it (both end the addiction too), or when the
character takes a dose during it (a relapse, which keeps the addiction). Author
the length for the full, failed-save case; shipped drugs run 1 to 2 days for
stimulants, 4 to 7 for mind-altering drugs and 3 to 4 for performance
enhancers.

**Picking a value:** choose a unit that matches the narrative weight of the
substance and the table's expected pacing.

| Substance feel | Suggested duration |
|---|---|
| Casual recreational | 1 to 6 hours |
| Hard street drug | 1 to 3 days |
| Magical or alien narcotic | 1 to 2 weeks |
| Setpiece, plot-relevant addiction | 1 to 3 months |

Avoid mixing minutes with months on the same campaign: pick a unit family
that fits the table's clock so players can plan around it. If a substance
should leave a permanent mark, prefer authoring an additional non-expiring
"former addict" AE separately rather than inflating the withdrawal window
past the campaign's natural arc.

## Language Conventions

User-facing content (item descriptions, AE names, lang/en.json strings,
template prose) follows 2024 D&D 5e PHB phrasing. `npm run validate` checks
the most common drifts. It scans the lang strings and templates, and as of
v0.10.0 also the shipped text: drug and gear descriptions, effect descriptions
and the guide page. Every rule blocks a release except `lowercase-condition`,
which stays a warning ("poisoned" and "frightened" are also everyday words).

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
context** (lang/en.json strings, .hbs templates, and the shipped descriptions).
It does not flag them in data fields. For example, `"subtype": "poisoned"` is a dnd5e keyword, not the
condition name, and is left alone.

The full rule set lives in `tools/validate-content-language.mjs`. Authors who
add a new shipped substance should run `npm run validate` and resolve
everything it reports before committing.

## Details tab

Open any substance item; the dnd5e Details tab shows a **Substance Properties** section:

- **Category** selector.
- **Addiction**: enabled toggle, save ability, save DC (with the recommended-range hint), and the Addiction effect picker.
- **Withdrawal**: enabled toggle, Withdrawal DC (with a preview of its tier), Abstain ability and DC, duration (value and unit), and the withdrawal effect picker.
- **Overdose**: enabled toggle, chance percent (1 to 100), damage (a dice formula and a damage type; blank means no damage), description, and the Overdose effect picker.
- **Tolerance**: enabled toggle, decay per Long Rest, and the optional tolerance effect picker.

Each effect picker can create a blank template with the right name; the module tags its role when it applies the effect. The administration type is the dnd5e Poison subtype on the item's own Details fields.

For paraphernalia items, the Details tab shows **Paraphernalia Properties**: the **Subtype** select (built-ins + custom), the administration types it applies to (`appliesTo` checkboxes), and the **Save bypass** section (type, bonus, uses per day, and a button that adds the bypass effect).
