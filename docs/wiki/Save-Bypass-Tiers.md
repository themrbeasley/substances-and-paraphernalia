# Save Bypass Tiers

Paraphernalia can grant the user help against a substance's addiction save. The module resolves multiple competing bypasses by **tier**: `auto-pass` > `advantage` > `+N`. Within a tier, the rule depends on the tier.

## Tier order

| Tier | Effect | Within-tier rule |
|---|---|---|
| `auto-pass` | The save automatically succeeds; no roll. | First match wins (deterministic). |
| `advantage` | The save is rolled with advantage. | First match wins. |
| `+N` | A flat numeric bonus is added to the save. | All matching `+N` bonuses **sum**. |

If any `auto-pass` is available, it takes priority over all `advantage` and `+N` candidates. If no `auto-pass` but any `advantage`, advantage wins. Otherwise, all `+N` bonuses across all matching paraphernalia AEs are summed and added to the roll.

## Worked examples

### Single `+N` paraphernalia

The actor wears a *Calibrated Inhaler* (`type: "+N"`, `bonus: 2`, `appliesTo: ["inhaled"]`) and uses an inhaled substance. The save is rolled with `+2`.

### Two stacking `+N`s

The actor has two `+N` bypass paraphernalia, both equipped, both `appliesTo: ["inhaled"]`, with bonuses `+2` and `+1`. The save is rolled with `+3`.

### Mixed tiers — strongest wins

The actor has both a `+N: 2` inhaler and an `advantage` bypass paraphernalia for inhaled. The `advantage` candidate wins; the `+N: 2` is **not** added on top.

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

## Bypass paraphernalia must satisfy the gate

A bypass-granting paraphernalia is **not a free aura**. It must be one of the substance's `requiredSubtypes` (gate-satisfying). The +N inhaler only fires its bypass when the substance also requires an `inhaler` paraphernalia.
