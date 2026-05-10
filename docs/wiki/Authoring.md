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
  schemaVersion: 2
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
  schemaVersion: 2
};
```

Per-day uses for bypass-granting paraphernalia ride on dnd5e's native `system.uses.recovery: [{ period: "day", type: "recoverAll" }]`. The validator requires this when an embedded bypass AE declares `usesPerDay`.

## Active Effect name contracts

The module matches AEs by substring. Names are case-insensitive.

| AE role | Required substring | Notes |
|---|---|---|
| Addiction | `addict` | Pointed-to by `addiction.addictionEffectId`. |
| Benefit (altered) | (no contract) | Convention: `Altered by {Substance}`. |
| Withdrawal | `withdraw` | Pointed-to by `withdrawalEffectId`. Validator warns if it imposes disadvantage on attacks/checks (duplicates *poisoned*). |
| Tolerance | `tolerance` | Template lives on the substance with the `tolerance` modifier flag block. |
| Overdose marker | `overdose` | Applied when the d100 roll hits. |
| Bypass (paraphernalia) | (no contract) | Lives on the paraphernalia as a `transfer: true` AE with the `bypass` modifier flag block. |

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

## Details tab

Open any substance item; the dnd5e Details tab now shows:

- **Kind / Category / Setting** selectors.
- **Required subtypes** picker (built-ins + custom subtypes from the Manage Subtypes menu).
- **Addiction** block: ability, DC, withdrawal modifier, addiction-AE picker.
- **Withdrawal AE picker** + content-guidance hint (don't duplicate poisoned; escalate instead).
- **Overdose fieldset**: enabled toggle, chance percent (1-100), description.

For paraphernalia items, the Details tab shows the **Subtype** select (built-ins + custom). Bypass authoring lives on the Active Effects tab — add a `transfer: true` AE and write the modifier flag block.
