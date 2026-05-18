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

## Addiction — Phase 1 (`postUseActivity`)

After a substance is used, the module rolls a save against the substance's authored DC and ability (Con by default). On a failed save, **every** addiction Active Effect template listed in `flags[…].addiction.addictionEffectIds` is cloned onto the actor.

- Each applied AE is keyed back to the substance via `flags["substances-and-paraphernalia"].sourceSubstanceId` so the Remove Addiction macro can match by source. The macro falls back to a name regex (`/addict/i`) when the source flag is missing on a legacy AE.
- Phase 1 **does not** apply a Withdrawal AE or write to the actor's withdrawal flag map. Withdrawal onset is a long-rest event (Phase 2, below).
- Re-using a substance you're already addicted to runs the save again, which can stack additional addiction AEs or trigger overdose, but does not retro-apply withdrawal.

## Withdrawal — Phase 2 (`dnd5e.preRestCompleted`, long rest only)

On the GM client only (`game.users.activeGM === game.user`), the long-rest hook walks every substance the actor is currently addicted to and opens the **Abstain dialog** (`scripts/ui/abstain-dialog.js`). Each row offers one of three actions:

- **Use** — force-consumes one dose through the normal `activity.use()` chain with the paraphernalia gate bypassed for this single use. Goes through full Phase 1 again.
- **Abstain** — rolls a Wisdom *Abstain Check* against the substance's `withdrawal.abstain.dc`. On pass, tolerance decays one tier; on fail, a Constitution *Withdrawal Save* against `withdrawal.dc` is rolled, and on that failure the Withdrawal AE applies.
- **Forced abstain** — automatic when the actor has no doses left of an addictive substance. Skips the Wis check, rolls the Con Withdrawal Save directly, and decays tolerance regardless of outcome.

When the Withdrawal AE applies, its duration is computed from the authored `withdrawal.duration.value` + `withdrawal.duration.unit` (one of `minutes | hours | days | weeks | months`, where months are 30-day months) via `durationToSeconds` in `scripts/data/withdrawal-duration.js`. The actor flag `flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { appliedAt, endsAt }` records the lifecycle window. **Times-Up** (bundled with DAE — both are required modules) removes the AE when game time passes `endsAt`; `scripts/hooks/withdrawal-cleanup.js` listens for `deleteActiveEffect` and clears the matching flag entry. The module ships no rest-decrement counter — Times-Up owns expiry.

The withdrawal AE templates are selected per substance via the `withdrawal.effectIds` flag. Author them on the substance's Active Effects tab, give each a name containing `withdraw`, and pick them in the Details tab. The validator warns if any AE imposes disadvantage on attacks or checks, or carries the `poisoned` status — those duplicate the addiction AE. Escalate instead with exhaustion, disadvantage on saves, speed reduction, or a stat penalty. The per-owner CSS vignette color is set by a Change row on the withdrawal AE itself (`flags.substances-and-paraphernalia.vignetteColor`, mode OVERRIDE); the default authored template ships `#a02020`.

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

## Voluntary Abstain

See [Voluntary-Abstain.md](Voluntary-Abstain.md) for the willpower/craving mechanic and the failure-path consumption flow.

## DC Scaling Across Tiers

The module accepts any save DC, but shipped substances follow this tier-aligned convention:

| Character tier | Levels | Recommended DC range | Pass rate (vs +1 Con) | Pass rate (vs +5 Con) |
|---|---|---|---|---|
| 1 | 1–4 | 12–14 | ~50% | ~70% |
| 2 | 5–10 | 15–17 | ~35% | ~55% |
| 3 | 11–16 | 18–20 | ~20% | ~40% |
| 4 | 17–20 | 21+ | ~10% | ~25% |

The intent is **tier-1-to-tier-2 by default** — most shipped substances sit at DC 12–16 so they remain a real but manageable narrative threat through most campaigns. DCs of 17+ are reserved for tier-3-plus setpiece substances (alchemical horrors, story-critical addictions, etc.) where the addiction itself is a deliberate antagonist.

This convention matches the 2024 SRD poison rules and gives the v0.9 compendium rebuild a known target. Authors are free to override per-substance — the schema accepts any DC. The Save DC field in the Details tab shows a hint with the same ranges to keep the convention discoverable at the authoring surface.
