# Save Bypass Tiers

Paraphernalia can grant the user help against a substance's addiction save. The module resolves multiple competing bypasses by **tier**: `auto-pass` > `reroll-on-fail` > `advantage` > `+N`. Within a tier, the rule depends on the tier.

## Tier order

| Tier | Effect | Within-tier rule |
|---|---|---|
| `auto-pass` | The save automatically succeeds; no roll. | First match wins (deterministic by ascending AE id). |
| `reroll-on-fail` | Roll once; if the roll fails the DC, roll a second time and use that result. No advantage / no bonus is layered. | First match wins. |
| `advantage` | The save is rolled with advantage. | First match wins. |
| `+N` | A flat numeric bonus is added to the save. | All matching `+N` bonuses **sum**. |

If any `auto-pass` is available, it takes priority over all other tiers. Otherwise, if any `reroll-on-fail` is available, it wins. Otherwise, if any `advantage` is available, it wins. Otherwise, all `+N` bonuses across all matching paraphernalia AEs are summed and added to the roll.

For a flat d20 vs a flat DC, `reroll-on-fail` and `advantage` are statistically identical — both yield `P(pass) = 1 − q²` where `q` is the single-roll fail probability. The two tiers diverge once dnd5e's per-roll features (Halfling Lucky, Bardic Inspiration, per-roll Cha-based bonuses) come into play, which is why `reroll-on-fail` is treated as the stronger tier.

## Worked examples

### Single `+N` paraphernalia

The actor wears a *Calibrated Inhaler* (`type: "+N"`, `bonus: 2`, `appliesTo: ["inhaled"]`) and uses an inhaled substance. The save is rolled with `+2`.

### Two stacking `+N`s

The actor has two `+N` bypass paraphernalia, both equipped, both `appliesTo: ["inhaled"]`, with bonuses `+2` and `+1`. The save is rolled with `+3`.

### Mixed tiers — strongest wins

The actor has both a `+N: 2` inhaler and an `advantage` bypass paraphernalia for inhaled. The `advantage` candidate wins; the `+N: 2` is **not** added on top.

### Reroll-on-fail in action

The actor has a `reroll-on-fail` paraphernalia (`appliesTo: ["ingested"]`) and ingests a poison. The first save is rolled. If the roll meets or beats the DC, that's the canonical result. If it fails, a second save is rolled with the same clean configuration (no advantage, no bonus) and *that* result is canonical. A reroll-on-fail paraphernalia with `usesPerDay: 1` consumes its single daily use whether the first roll succeeded or failed — both dice ride on the same charge.

### `auto-pass` trumps everything

If any `auto-pass` paraphernalia is in scope, the save auto-succeeds. The user still sees the bypass-resolution chat card naming the source.

## Authoring `+N`

On the paraphernalia's Active Effects tab, add a `transfer: true` AE with the modifier flag block:

```js
flags["substances-and-paraphernalia"].modifier = {
  kind: "bypass",
  type: "+N",
  bonus: 2,                       // required, non-zero
  appliesTo: ["inhaled"],         // administration ids the bypass covers
  usesPerDay: "@prof"             // optional; rides on system.uses
};
```

The validator requires `bonus` to be a non-zero number when `type === "+N"`. If `usesPerDay` is set, the paraphernalia's `system.uses.recovery` must include `{ period: "day", type: "recoverAll" }` so dnd5e refills it on long rest.

## Authoring `reroll-on-fail`

Same shape as the other bypass tiers — no `bonus` field. Example:

```js
flags["substances-and-paraphernalia"].modifier = {
  kind: "bypass",
  type: "reroll-on-fail",
  appliesTo: ["ingested"],
  usesPerDay: "1"                 // optional; rides on system.uses
};
```

The reroll fires once per consumption attempt. The use is consumed when the bypass wins resolution, *before* either die is rolled — so the second die does not double-decrement.

## Bypass paraphernalia must satisfy the gate

A bypass-granting paraphernalia is **not a free aura**. Its top-level `appliesTo` admin list (added in v0.5) must include the substance's administration so the same paraphernalia is the one satisfying the gate. A reroll-on-fail vial only fires its bypass when the substance is `ingested`.