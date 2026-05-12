# Mechanics

This page covers the four mechanical systems the module layers on top of dnd5e: the **consumption gate**, the **addiction loop**, **withdrawal**, **tolerance**, and **overdose**.

## Consumption gate (`preUseActivity`)

Each substance carries a dnd5e Poison administration type at `system.type.subtype` (one of `contact` / `ingested` / `inhaled` / `injury`). When the substance is used, the gate checks that the actor possesses a *ready* paraphernalia whose `appliesTo` admin list contains that administration. Readiness:

- **Equipment** — must be equipped.
- **Consumable** — must have `quantity > 0`.
- **Attunement-required** — must be attuned on the actor's copy.

If no paraphernalia matches the substance's administration, the user sees a *Missing paraphernalia* dialog with a **Use anyway** override. The dialog is visible to all users (player or GM); the override is intentional.

The world setting **Enforce paraphernalia requirements** (default on) is the master switch. With it off, gating is bypassed but addiction automation continues to fire.

> **v0.5 note.** The earlier per-substance `requiredSubtypes` callout (a flat list of subtype ids) was removed in v0.5; gating now keys on the dnd5e administration type instead. Phase 4 of the v0.5 dig-out lands the live admin-type gate; until then the gate stub allows substances through unconditionally (DAE-strict guard intact).

## Addiction (`postUseActivity`)

After a substance is used, the module rolls a Constitution save (DC and ability are authored on the substance). On a failed save, the addiction Active Effect template on the substance is cloned onto the actor.

- The applied AE is keyed back to the substance via `flags["substances-and-paraphernalia"].sourceSubstanceId`.
- The actor flag `flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { restsRemaining, appliedAt }` is the canonical state — the AE is a UI mirror.
- AE name **must contain** the substring `addict` (case-insensitive). The Remove Addiction macro uses `*addict*` as a fallback when source-flag matching misses.

Re-using a substance you're already addicted to does not reroll. It extends withdrawal to `max(currentRestsRemaining, newComputed)` — bingeing while addicted prolongs withdrawal but never shortens it.

## Withdrawal (`restCompleted`)

`restsRemaining = max(withdrawalMod − ConMod, ⌈withdrawalMod/2⌉)`, minimum 1. The `⌈Y/2⌉` term is the **floor clamp** — a high-Constitution character can never wave off withdrawal entirely.

The long-rest tick is fired by `dnd5e.restCompleted` with `longRest: true`. To prevent multi-client double-ticks, only the active GM (`game.users.activeGM === game.user`) decrements. Each entry's `restsRemaining` drops by 1; on reaching zero the matching AE is removed and the flag entry cleared. Short rests do nothing.

The withdrawal AE itself is selected per substance via the `withdrawalEffectId` flag. Author it on the substance's Active Effects tab, give it a name containing `withdraw`, and pick it in the Details tab. The validator warns if the AE imposes disadvantage on attacks or checks — that duplicates *poisoned*. Escalate instead with exhaustion, disadvantage on saves, speed reduction, or a stat penalty.

## Tolerance

Each successful addiction save applies (or stacks) a tolerance Active Effect on the actor. Tolerance is authored on the substance as a template AE with the modifier flag block:

```js
flags["substances-and-paraphernalia"].modifier = {
  kind: "tolerance",
  substanceId: "<itemId>",
  attenuateAltered: { durationFactor: 0.1, modifierFactor: 0.1, dropAdvantage: false },
  addictionDcBump: 1,
  withdrawalAmplify: { durationFactor: 0.1, modifierFactor: 0.1, addDisadvantage: false }
};
```

A single AE per (actor, substance) tracks stacks via `flags.stacks`. Per-stack effects sum on the result — three stacks of `addictionDcBump: 1` become +3 DC; three stacks of `durationFactor: 0.1` become 70% of the base duration. AE name **must contain** `tolerance`.

## Tolerance: Bounds and Authoring Guidance

The Tolerance system has three knobs (`attenuateAltered`,
`addictionDcBump`, `withdrawalAmplify`) that all make the next
consumption worse. To prevent runaway states where consumption is a
pure mathematical loss, the engine applies these soft caps by default:

| Cap                             | Default | Effect                              |
|---------------------------------|---------|-------------------------------------|
| `maxStacks`                     | 5       | Max tolerance stacks per substance  |
| `modifierFactorFloor`           | 0.25    | Buff modifier cannot drop below ¼   |
| `addictionDcBumpCap`            | 5       | Cumulative DC bump caps at +5       |
| `withdrawalDurationFactorCap`   | 2.0     | Withdrawal cannot stack past 2× duration |

Authors may override any subset per substance by writing a `caps` block
under the substance's `tolerance` flag:

```json
{
  "flags": {
    "substances-and-paraphernalia": {
      "tolerance": {
        "caps": { "maxStacks": 10 }
      }
    }
  }
}
```

The validator warns (not errors) when an override loosens a cap beyond
the engine default. The design intent: tolerance should produce
**diminishing returns**, never a state where consumption is a pure
loss. Overrides exist so authors who want true escalation can opt in
explicitly.

## Overdose

Each consumption rolls d100 against the substance's `chancePercent`. On a hit, a marker AE *Overdosed on {Substance}* is applied and the authored description is posted to chat. Overdose runs alongside the addiction save — both can fire on the same dose. AE name **must contain** `overdose`.

Author it via the overdose fieldset on the Details tab: enable, set the percent, write a description.

## Overdose × Tolerance Interaction

The `overdose.toleranceInteraction` field on each substance chooses
how the d100 overdose chance modulates with the actor's current
tolerance-stack count:

- **None (default):** Tolerance and overdose are mechanically unrelated.
  d100 rolls against the raw `chancePercent` always.
- **Mitigate:** The body adapts. Each tolerance stack reduces overdose
  chance by `toleranceInteractionMagnitude` percentage points.
- **Compound:** Users escalate doses to chase the diminishing buff.
  Each tolerance stack raises overdose chance by
  `toleranceInteractionMagnitude` percentage points.

The adjusted chance is clamped to `[0, 100]`. Stacks are read at the
moment the d100 fires (not at AE apply time) — see the v0.7 spec
§2.4 for why.

The maximum modulation envelope is bounded by `tolerance.caps.maxStacks`
(default 5). Combined with the default magnitude of 0 in the schema,
existing pre-v0.7 substances keep their pre-v0.7 behavior.
