# Mechanics

This page covers the mechanical systems the module layers on top of dnd5e: the **consumption gate**, the **addiction loop**, **dosing someone else**, **withdrawal**, **tolerance**, and **overdose**.

## Consumption gate (`preUseActivity`)

Each substance carries a dnd5e Poison administration type at `system.type.subtype` (one of `contact` / `ingested` / `inhaled` / `injury`). When the substance is used, the gate checks that the actor possesses a *ready* paraphernalia whose `appliesTo` admin list contains that administration. Readiness:

- **Equipment**: must be equipped.
- **Consumable**: must have `quantity > 0` and, when it has a use pool (Rolling Papers), uses left.
- **Attunement-required**: must be attuned on the actor's copy.

If no paraphernalia matches the substance's administration, the user sees a *Missing paraphernalia* dialog with a **Use anyway** override. The dialog is visible to all users (player or GM); the override is intentional.

Two rules decide which activities the gate looks at:

- **The gear check is for doses you take yourself.** An activity that doses someone else (see *Dosing someone else*) needs no gear. Spiking a drink doesn't need a pipe.
- **The empty-drug block is for activities that spend the drug.** A substance at 0 doses can't be used by any activity that spends it. The module blocks it before the paraphernalia check, with no override. An activity that spends nothing (the gas cloud's ticks) isn't blocked, so a cloud keeps working after the last bomb is thrown. The drug stays in the inventory at 0 doses instead of being deleted.

**Single-use gear gets used up.** After a dose you take yourself passes the gear check, the module spends one use (or one item) of a ready consumable gear item, but only when no ready reusable gear applies to that administration. Smoking Triple-Burn with Rolling Papers uses one paper; with a Calibrated Inhaler ready too, no paper is spent. If several consumables are ready, the one with the lowest id goes first. Nothing is spent when the check is switched off or when you clicked **Use anyway** (nothing was ready). A dose taken at a Long Rest spends gear the same way.

The world setting **Enforce paraphernalia requirements** (default on) switches the paraphernalia check. With it off, only that check (and the gear spending that rides on it) is skipped: the 0-dose block and the addiction automation still run.

## One dose (`postUseActivity`)

Every dose you take yourself runs one pipeline, in this order (`runDosePipeline` in `scripts/hooks/addiction.js`):

1. **Relapse check.** If the character is in withdrawal from this substance, the withdrawal effects are deleted and chat says so. The addiction stays.
2. **Addiction save.** Skipped when the character already carries this substance's Addiction effect. Otherwise a paraphernalia bypass is spent if one applies (see *Save Bypass Tiers*), then the save rolls against `addiction.save.dc`. The shipped drugs use Wisdom for mind-altering substances and Constitution for stimulants and performance enhancers. Closing the roll window doesn't skip the save: the module rolls it without the window. On a fail, every template in `addiction.addictionEffectIds` is cloned onto the actor with `aeRole: "addiction"` and `sourceSubstanceId`.
3. **The high.** Every Altered effect the substance ships is applied (Stellar Mist has two), its numeric `add` and `subtract` Change values scaled by the attenuation curve at the current tolerance count. An earlier copy of the same high is replaced, so highs never stack (a high without the `aeRole` tag is recognised by its name, `altered`). The module applies the high itself, so don't list Altered effects on the substance's activity. If you do, the module stops Midi-QoL and the chat card from applying a second copy, but the activity shows an apply button that does nothing.
4. **Tolerance +1**, up to the substance's max count.
5. **Overdose check** (below).

Each step runs on its own: if one fails (an error from another module, say), the rest of the dose still happens and the console logs the failed step.

Before the high is replaced, the module notes whether this drug's high is still on the character: an Altered effect from this drug that is switched on and hasn't run out. That note feeds the overdose check.

A character is **addicted** to a substance exactly when they carry its Addiction effect, even one a GM has switched off. Using the substance again while addicted doesn't roll again and doesn't add a second Addiction effect.

## Dosing someone else

A rogue slips Whisperdust into the duke's wine, a smuggler blows Coalshade into a guard's face, a medic jabs a soldier with Combat Cocktail. Whoever is dosed gets the whole dose: the high, the addiction save, tolerance and the overdose check. The user isn't dosed.

Every drug has an activity for this. Each spends one dose.

| Administration | Activity | How it lands |
|---|---|---|
| ingested | Slip into food or drink | Action, 1 creature within 5 feet, no save. The GM decides whether the target eats or drinks it. |
| inhaled | Blow into a face | Action, 1 creature within 5 feet, Constitution saving throw against the drug's addiction DC. |
| injury | Jab with the needle | Action, melee attack (Dexterity), reach 5 feet. Combat Cocktail has "Fire a dart" instead, a ranged attack at 20/60 feet. |
| contact | Slap on a patch | Action, melee attack (Dexterity), reach 5 feet. |
| Stellar Mist only | Throw as a gas bomb | See *Gas bomb* below. |

How it works:

- **The dose marker.** Each drug carries one extra effect, the *dose marker*, with the role `dose`. It has no changes and no statuses, and it isn't transferred. A dose-others activity lists it as its effect. When anything puts the marker on a creature (Midi-QoL after a failed save, a hit, or a use with targets; DAE; dnd5e's Apply button on the chat card), the module cancels the marker and runs one dose on that creature instead. The module doesn't need to know how the dose landed, so saves, attacks and plain targeted uses all work.
- **Which drug.** The module reads it from the activity Midi records on the effect, else from the effect's origin. (When the thrower is concentrating, Midi sets the origin to the concentration effect, which is why the activity comes first.)
- **Where it runs.** On the client that creates the marker. For a creature the user doesn't own, DAE creates it on the GM's client, so the **GM's screen rolls the addiction save**. With no GM online, dosing a creature the user doesn't own does nothing.
- **The dosed creature's own copy.** Tolerance, withdrawal and the Long Rest all key on the creature's own copy of the drug. The dose runs against their copy: the same item by id, else a drug with the same name, else an empty copy the module adds (0 doses, same id when free). Once the creature is addicted, the Long Rest's Withdrawal Choices lists the drug for them, and at 0 doses it's a forced abstain.
- **No gear bonuses.** The dosed creature's own save-bypass gear doesn't apply to a forced dose. Bypass gear models careful use with your own kit.
- **Overdose counts the same.** A forced dose on a creature whose high is still on them risks an overdose like any other dose.
- **Chat:** "{target} is dosed with {drug}."

### Gas bomb (Stellar Mist)

Throw a Stellar Mist bomb and it bursts into a 20-foot cloud for 1 minute (range 30 feet). Everyone inside makes a DC 15 Constitution saving throw or is dosed. A creature that enters the cloud or starts its turn there saves again, once per turn.

- It's item data plus Midi-QoL's region behavior. The "Throw as a gas bomb" activity places the cloud. A second activity, "Breathe the cloud", spends nothing and is marked automation-only, so it doesn't show on the sheet as a second thing to click. Midi runs it on entry and at turn start.
- Midi removes the region when the timer effect on the thrower is deleted. House Automation deletes expired effects, so the cloud clears after 1 minute.
- The thrower isn't dosed, and the ticks keep working after the last bomb is spent (the empty-drug block only stops activities that spend the drug).
- "Once per turn" only works in combat, and for player tokens Midi can't record it, so walking out and back in can trigger again. Two bombs from one character share one timer.

### Midi's apply mode

Midi-QoL's "apply and leave the button" mode keeps dnd5e's Apply button on the chat card. Clicking it applies the dose marker again, so the targets are dosed a second time. Use one of Midi's other apply modes for effects.

## Long Rest (`dnd5e.preRestCompleted`)

A Long Rest opens the **Withdrawal Choices** dialog on the client that performs the rest (the player's for their own rest or an accepted group rest request, the GM's for a GM-run rest), listing every substance the character is addicted to. Each row shows the tolerance count and doses left; rows in withdrawal carry an *in withdrawal* tag. Unticked rows take a dose (the full pipeline above, using the drug's first activity that doses the user). Ticked rows abstain:

| Situation | What happens |
|---|---|
| Abstain, not in withdrawal | Wisdom check vs `withdrawal.abstain.dc`. Fail: the character gives in and takes a dose. Pass: tolerance decays and **withdrawal starts**; a Constitution save vs `withdrawal.dc` sets its length (below). |
| Abstain, in withdrawal | Wisdom check only. Fail: the character takes a dose, which ends the withdrawal (the addiction stays). Pass: tolerance decays and the withdrawal carries on. |
| No doses left, not in withdrawal | Ticked and locked. No Wisdom check: tolerance decays and withdrawal starts, with the Constitution save setting its length. |
| No doses left, in withdrawal | Ticked and locked. Tolerance decays and the withdrawal carries on. |

Closing a roll window doesn't skip the roll: the module rolls it without the window. A blank **Abstain DC** means there is no Wisdom check (abstaining goes straight to withdrawal); a blank **Withdrawal DC** means there is no save, so withdrawal lasts its full length. If the substance's withdrawal toggle is off, abstaining only fades tolerance.

A substance with no doses stays in the inventory at 0 instead of being deleted, so it keeps its row. It can't be used at 0; dropping more of the same substance from the compendium refills it.

## Withdrawal and recovery

**Abstaining always leads to withdrawal; the save decides how long.** After a passed Wisdom check (or at 0 doses), the character makes the Constitution save against the drug's Withdrawal DC:

- **Pass:** withdrawal for half the drug's length.
- **Fail:** the full length.
- **Either way, when withdrawal ends, the addiction ends.**

Thorin (Con +5) abstains from Moonleaf Tincture and passes his Wisdom check, then passes the Constitution save (DC 13): "Thorin grits through Moonleaf Tincture withdrawal (Save 18 ≥ 13): 60 hours." Had he failed, chat would say "Thorin falls hard into Moonleaf Tincture withdrawal (Save 9 < 13): 5 days." A permanent withdrawal (no length authored) stays permanent either way.

Recovery has to be reachable for everyone, so a character who always passes can still quit. Constitution decides how bad it gets, not whether it happens.

Withdrawal clones the substance's `withdrawal.effectIds` templates (or effects named `withdraw`, or a built-in default) with the resulting duration, converted by `durationToSeconds` (`withdrawal.duration.value` + `unit`: `minutes | hours | days | weeks | months`; months are 30 days). The actor record `flags["substances-and-paraphernalia"].withdrawal[<substanceItemId>] = { appliedAt, endsAt }` marks the character as in withdrawal.

Foundry V14 marks the effect expired when game time passes its end, and House Automation's "Delete expired effects" switch deletes it. Recovery by expiry needs that delete: without House Automation (or another module that deletes expired effects), an expired withdrawal stays on the character, so delete it by hand or run Remove Withdrawal. When the last withdrawal effect for a substance is deleted, `scripts/hooks/withdrawal-cleanup.js` clears the record and **ends the addiction**: the substance's Addiction effects are removed and chat says the character came through. That holds for expiry, the Remove Withdrawal macro, and a GM deleting the effect by hand. Only a relapse (taking a dose during withdrawal) removes withdrawal without ending the addiction.

Other ways out of an addiction: the Remove Addiction macro, deleting the Addiction effect, or (under the default *Poisoned coupling* setting) anything that cures the Poisoned condition.

### What withdrawal does

The shipped drugs give each category its own penalties, on top of the addiction (which stays during withdrawal):

| Category | While in withdrawal | In combat | Length (fail / pass) |
|---|---|---|---|
| Stimulant | -2 to ability checks and saving throws; disadvantage on initiative | nothing | 1 to 2 days / half |
| Mind-altering | disadvantage on Wisdom and Intelligence saving throws | 1d4 psychic damage at the start of each of their turns | 4 to 7 days / half |
| Performance enhancer | all speeds -10 feet; disadvantage on Strength and Constitution saving throws | 1d4 poison damage at the start of each of their turns | 3 to 4 days / half |

**Combat withdrawal.** In combat, a character in withdrawal from a mind-altering drug takes 1d4 psychic damage at the start of each of their turns; from a performance enhancer, 1d4 poison. Outside combat nothing ticks. It's a Midi-QoL OverTime row on the withdrawal effect (see *Authoring*), which Midi runs on the GM's client during combat. A creature immune to that damage type takes nothing: poison immunity turns the poison ticks (and poison overdose damage) into nothing. That's correct, not a bug.

Withdrawal templates: name them with `withdraw` and pick them in the Details tab. The validator warns if one imposes disadvantage on attacks or checks, or carries `poisoned`; those duplicate the Addiction effect. Escalate instead with disadvantage on saves, speed reduction, a stat penalty, or a damage tick. (No withdrawal gives Exhaustion: see *Authoring* for why.) The screen-edge vignette color comes from a Change row on the withdrawal template (`flags.substances-and-paraphernalia.vignetteColor`, type `"override"`); the default template uses `#a02020`.

## Tolerance

Tolerance is a per-substance **count** on the actor (`flags["substances-and-paraphernalia"].tolerance[<substanceItemId>].count`). It rises by 1 with every dose, up to a max count, and drops by the substance's `tolerance.decay` (default 1) at each Long Rest for a substance the character isn't addicted to, and whenever an addicted character abstains without relapsing.

The substance's **Withdrawal DC** sets its tier, and the tier sets the tolerance numbers:

| Withdrawal DC nearest | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|
| Max count | 8 | 6 | 5 | 4 | 3 | 2 |
| Points per count (rate) | 1 | 2 | 3 | 5 | 8 | 13 |
| Overdose threshold (points) | 8 | 12 | 15 | 20 | 24 | 26 |

So a Withdrawal DC of 12 caps at 6 doses, 13 to 15 at 5, and 18 at 4.

The count weakens the high: numeric `add` and `subtract` Change values on the Altered effects are multiplied by the attenuation curve and rounded down toward zero when whole (override and upgrade rows are never scaled), `[1, 0.5, 0.25, 0.125, 0]` by default (100% at count 0, 50% at 1, and so on; counts past the end use the last value). So a +2 bonus is +2, then +1, then 0. A substance can author its own curve in `tolerance.attenuationCurve`. Non-numeric values (a Token Magic preset name, a `true` override) are never scaled, and dice never shrink: Stellar Mist's +1d4 to saves stays a die.

**Advantage and disadvantage from a high hold until tolerance empties them.** Triple-Burn's advantage on initiative still applies on the second and third dose, and stops only when tolerance takes the high to nothing (the first 0 on the curve, count 4 on the default one). See *Authoring* for how those rows are written.

Tolerance shows on the character as a marker effect: the substance's tolerance template if it ships one (`tolerance.effectIds`), otherwise a plain effect named like "Tolerance to Coalshade Powder (2)". The plain marker has no Changes and no duration, so it changes nothing in play and shows no token icon. Its name follows the count on every dose and Long Rest fade, and it goes away when tolerance fades to 0. The Remove Tolerance macro resets the count.

## Overdose

Overdose is off unless the substance enables it; all 18 shipped drugs enable it. After each dose the module decides whether to roll, in either of two cases:

- **Tolerance is at its limit.** **Points** = count × rate. If the points reach the tier's overdose threshold (plus any `flags.substances-and-paraphernalia.overdose.thresholdModifier` on the actor), the roll opens. The threshold equals the tier's max count times its rate, so this is the cap.
- **The dose came while this drug's high was still on the character.** Taking a drug while its high is still on you opens the roll by itself, whatever the tolerance. Two hits of Black Lift inside 10 minutes: 10% chance. A forced dose counts the same way.

When the roll opens, the module rolls d100; at or under `overdose.chancePercent` (plus any `overdose.chanceModifier` flag on the actor, clamped to 0 to 100), the overdose effect is applied and chat announces it with the authored description.

**Damage.** An overdose can also deal damage: a formula and a damage type on the substance. A blank formula means no damage. The module rolls it and applies it through dnd5e, so resistance and immunity count and a concentrating caster has to save. Chat shows the result, such as "(9 poison damage)". A formula that isn't plain dice, or an unknown damage type, deals no damage and doesn't stop the overdose itself (the content checker rejects both in shipped content). A creature immune to the damage type takes none.

**The shipped overdoses**, by category:

| Category | Chance | Effect |
|---|---|---|
| Stimulant | 15% | 2d6 poison damage; Poisoned for 1 minute |
| Mind-altering | 10% | 2d6 psychic damage; Incapacitated for 1 round |
| Performance enhancer | 10% | 2d8 poison damage; Poisoned and Incapacitated for 1 minute |

AE name **must contain** `overdose`. Author it via the overdose fieldset on the Details tab: enable it, set the percent, set the damage formula and type, write a description, and pick the Overdose effect.

## DC Scaling Across Tiers

The module accepts any save DC, but shipped substances follow this tier-aligned convention:

| Character tier | Levels | Recommended DC range | Pass rate (vs +1 Con) | Pass rate (vs +5 Con) |
|---|---|---|---|---|
| 1 | 1 to 4 | 12 to 14 | ~50% | ~70% |
| 2 | 5 to 10 | 15 to 17 | ~35% | ~55% |
| 3 | 11 to 16 | 18 to 20 | ~20% | ~40% |
| 4 | 17 to 20 | 21+ | ~10% | ~25% |

The intent is **tier-1-to-tier-2 by default**: shipped addiction DCs sit at 12 to 15, so they remain a real but manageable narrative threat through most campaigns. A higher Withdrawal DC (18 for Black Lift and Reflex Injector) also makes tolerance build faster. DCs of 17+ on the addiction save are reserved for tier-3-plus setpiece substances (alchemical horrors, story-critical addictions, etc.) where the addiction itself is a deliberate antagonist.

This convention matches the 2024 SRD poison rules. Authors are free to override per-substance; the schema accepts any DC. The Save DC field in the Details tab shows a hint with the same ranges to keep the convention discoverable at the authoring surface.
