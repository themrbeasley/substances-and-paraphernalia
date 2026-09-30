# Mechanics

This page covers the mechanical systems the module layers on top of dnd5e: the **consumption gate**, the **addiction loop**, **withdrawal**, **tolerance**, and **overdose**.

## Consumption gate (`preUseActivity`)

Each substance carries a dnd5e Poison administration type at `system.type.subtype` (one of `contact` / `ingested` / `inhaled` / `injury`). When the substance is used, the gate checks that the actor possesses a *ready* paraphernalia whose `appliesTo` admin list contains that administration. Readiness:

- **Equipment**: must be equipped.
- **Consumable**: must have `quantity > 0`.
- **Attunement-required**: must be attuned on the actor's copy.

If no paraphernalia matches the substance's administration, the user sees a *Missing paraphernalia* dialog with a **Use anyway** override. The dialog is visible to all users (player or GM); the override is intentional.

A substance at 0 doses can't be used at all. The module blocks it before the paraphernalia check, with no override.

The world setting **Enforce paraphernalia requirements** (default on) is the master switch. With it off, gating is bypassed but addiction automation continues to fire.

## One dose (`postUseActivity`)

Every use of a substance runs one pipeline, in this order (`runDosePipeline` in `scripts/hooks/addiction.js`):

1. **Relapse check.** If the character is in withdrawal from this substance, the withdrawal effects are deleted and chat says so. The addiction stays.
2. **Addiction save.** Skipped when the character already carries this substance's Addiction effect. Otherwise a paraphernalia bypass is spent if one applies (see *Save Bypass Tiers*), then the save rolls against `addiction.save.dc` (Con by default). On a fail, every template in `addiction.addictionEffectIds` is cloned onto the actor with `aeRole: "addiction"` and `sourceSubstanceId`.
3. **The high.** Every Altered effect the substance ships is applied (Stellar Mist has two), its numeric Change values scaled by the attenuation curve at the current tolerance count. An earlier copy of the same high is replaced, so highs never stack. The module applies the high itself: don't list Altered effects on the substance's activity, or Midi-QoL and the chat card add a second, full-strength copy.
4. **Tolerance +1**, up to the substance's max count.
5. **Overdose check** (below).

A character is **addicted** to a substance exactly when they carry its Addiction effect. Using the substance again while addicted doesn't roll again and doesn't add a second Addiction effect.

## Long Rest (`dnd5e.preRestCompleted`)

A Long Rest opens the **Withdrawal Choices** dialog on the client that performs the rest (the player's for their own rest or an accepted group rest request, the GM's for a GM-run rest), listing every substance the character is addicted to. Each row shows the tolerance count and doses left; rows in withdrawal carry an *in withdrawal* tag. Unticked rows take a dose (the full pipeline above). Ticked rows abstain:

| Situation | What happens |
|---|---|
| Abstain, not in withdrawal | Wisdom check vs `withdrawal.abstain.dc`. Fail: the character gives in and takes a dose. Pass: tolerance decays, then a Constitution save vs `withdrawal.dc`; on a fail, withdrawal starts. |
| Abstain, in withdrawal | Wisdom check only. Fail: the character takes a dose, which ends the withdrawal (the addiction stays). Pass: tolerance decays and the withdrawal carries on. |
| No doses left, not in withdrawal | Ticked and locked. No Wisdom check: tolerance decays and the Constitution save rolls. |
| No doses left, in withdrawal | Ticked and locked. Tolerance decays and the withdrawal carries on. |

A substance with no doses stays in the inventory at 0 instead of being deleted, so it keeps its row. It can't be used at 0; dropping more of the same substance from the compendium refills it.

## Withdrawal and recovery

Withdrawal clones the substance's `withdrawal.effectIds` templates (or effects named `withdraw`, or a built-in default) with the authored duration: `withdrawal.duration.value` + `unit` (`minutes | hours | days | weeks | months`; months are 30 days), converted by `durationToSeconds`. The actor record `flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { appliedAt, endsAt }` marks the character as in withdrawal.

Foundry V14 marks the effect expired when game time passes its end, and House Automation's "Delete expired effects" switch deletes it. Recovery by expiry needs that delete: without House Automation (or another module that deletes expired effects), an expired withdrawal stays on the character, so delete it by hand or run Remove Withdrawal. When the last withdrawal effect for a substance is deleted, `scripts/hooks/withdrawal-cleanup.js` clears the record and **ends the addiction**: the substance's Addiction effects are removed and chat says the character came through. That holds for expiry, the Remove Withdrawal macro, and a GM deleting the effect by hand. Only a relapse (taking a dose during withdrawal) removes withdrawal without ending the addiction.

Other ways out of an addiction: the Remove Addiction macro, deleting the Addiction effect, or (under the default *Poisoned coupling* setting) anything that cures the Poisoned condition.

Withdrawal templates: name them with `withdraw` and pick them in the Details tab. The validator warns if one imposes disadvantage on attacks or checks, or carries `poisoned`; those duplicate the Addiction effect. Escalate instead with exhaustion, disadvantage on saves, speed reduction, or a stat penalty. The screen-edge vignette color comes from a Change row on the withdrawal template (`flags.substances-and-paraphernalia.vignetteColor`, type `"override"`); the default template uses `#a02020`.

## Tolerance

Tolerance is a per-substance **count** on the actor (`flags["substances-and-paraphernalia"].tolerance[<substanceItemId>].count`). It rises by 1 with every dose, up to a max count, and drops by the substance's `tolerance.decay` (default 1) at each Long Rest for a substance the character isn't addicted to, and whenever an addicted character abstains without relapsing.

The substance's **Withdrawal DC** sets its tier, and the tier sets the tolerance numbers:

| Withdrawal DC nearest | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|
| Max count | 8 | 6 | 5 | 4 | 3 | 2 |
| Points per count (rate) | 1 | 2 | 3 | 5 | 8 | 13 |
| Overdose threshold (points) | 8 | 12 | 15 | 20 | 24 | 26 |

The count weakens the high: numeric `add` Change values on the Altered effects are multiplied by the attenuation curve and rounded down toward zero when whole (override and upgrade rows are never scaled), `[1, 0.5, 0.25, 0.125, 0]` by default (100% at count 0, 50% at 1, and so on; counts past the end use the last value). A substance can author its own curve in `tolerance.attenuationCurve`. Non-numeric values (a Token Magic preset name, a `true` override) are never scaled.

If a substance ships a tolerance template (`tolerance.effectIds`), the module applies it as a marker and keeps its `count` flag current. None of the shipped substances do, so players see tolerance only in the Long Rest dialog. The Remove Tolerance macro resets the count.

## Overdose

Overdose is off unless the substance enables it. After each dose, **points** = count × rate. If the points reach the tier's overdose threshold (plus any `flags.substances-and-paraphernalia.overdose.thresholdModifier` on the actor), the module rolls d100; at or under `overdose.chancePercent` (plus any `overdose.chanceModifier`, clamped to 0 to 100), the overdose effect is applied, carrying the authored description. AE name **must contain** `overdose`.

Author it via the overdose fieldset on the Details tab: enable it, set the percent, write a description.

## DC Scaling Across Tiers

The module accepts any save DC, but shipped substances follow this tier-aligned convention:

| Character tier | Levels | Recommended DC range | Pass rate (vs +1 Con) | Pass rate (vs +5 Con) |
|---|---|---|---|---|
| 1 | 1–4 | 12–14 | ~50% | ~70% |
| 2 | 5–10 | 15–17 | ~35% | ~55% |
| 3 | 11–16 | 18–20 | ~20% | ~40% |
| 4 | 17–20 | 21+ | ~10% | ~25% |

The intent is **tier-1-to-tier-2 by default**: most shipped substances sit at DC 12–16 so they remain a real but manageable narrative threat through most campaigns. DCs of 17+ are reserved for tier-3-plus setpiece substances (alchemical horrors, story-critical addictions, etc.) where the addiction itself is a deliberate antagonist.

This convention matches the 2024 SRD poison rules and gives the v0.9 compendium rebuild a known target. Authors are free to override per-substance; the schema accepts any DC. The Save DC field in the Details tab shows a hint with the same ranges to keep the convention discoverable at the authoring surface.
