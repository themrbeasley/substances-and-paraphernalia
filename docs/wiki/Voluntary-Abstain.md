# Voluntary Abstain

When a character has an active **withdrawal** AE, the long-rest dialog
offers a per-substance button: **"Resist the urge to use {item}"**.

## The Wisdom save

The character makes a Wisdom save against DC = 8 + the substance's
`withdrawalMod`. The Wisdom save represents the character using
willpower to resist the craving the body is producing during a long
rest, when withdrawal symptoms peak.

## Pass

> "{actor} resisted the urge to use {item} (DC {dc} Wisdom save).
> Withdrawal eases by 2 rests."

The withdrawal counter advances by 2 (instead of the standard 1) and
the long rest completes normally.

## Fail (with substance in inventory)

The character gives in: the substance is **consumed automatically** at
the long rest, via its real activity (paraphernalia gate bypassed
exactly once). The full post-use chain runs:

1. Constitution save against the substance's addiction DC.
2. On addiction-save fail, the addiction AE applies (and a tolerance
   stack accrues).
3. The overdose roll fires (per-substance `chancePercent`, modulated
   by tolerance per §"Overdose × Tolerance").

> "{actor} failed to resist the craving for {item} (DC {dc} Wisdom
> save). The substance is consumed."

## Fail (with no substance in inventory)

Soft-fails to the standard pace — no consumption, withdrawal continues
on the normal -1 tick.

> "{actor} reached for {item} but found none. The withdrawal continues
> at the standard pace."

## Design rationale

The Wis save represents *willpower vs. craving*, not "Will save to
escape this effect". The teeth of the failed save are not a flat
penalty — they are the realistic narrative consequence: the addicted
character goes and gets a hit. From there, the substance's own
mechanics (addiction, tolerance, overdose) determine what that hit
costs.

DC tuning is held until post-v0.7 playtest (the spec acknowledges the
formula may need to escalate with consumption count). See the v0.7
spec §3.5 for the held-item rationale.
