# Voluntary Abstain

A character in withdrawal can **try harder** during a long rest to push past it faster — at the cost of a save that, if failed, gives them a normal night's progress and nothing more.

## How it works

When the world setting **Voluntary Abstain** is enabled and the actor has at least one active withdrawal AE, the long-rest dialog shows an **Abstain this rest** button per active withdrawal.

Clicking it rolls a Wisdom save:

- **DC** = `8 + withdrawalMod` (withdrawalMod is authored on the substance).
- **Pass:** `restsRemaining -= 2` (clamped at 0; AE removed when it hits 0).
- **Fail:** `restsRemaining -= 1` — same as a normal long rest. **No additional penalty.**

In other words: abstaining is a free shot at progressing twice as fast. The downside of a failed save is just "you got the normal rest progress you would have gotten anyway."

## Why no penalty on a failed abstain

The plan's design rationale: this is the addict trying to white-knuckle through a rest. Either it works, or it doesn't and the night was just the night. We don't pile on extra fiction just because the save flopped.

If you want a penalty (extra exhaustion, vivid dreams, intrusive cravings), narrate it at the table — the mechanic doesn't enforce one.

## Setting

The setting is **on by default**. Toggle it via *Game Settings → Module Settings → Voluntary Abstain*. With the setting off, no abstain button appears regardless of state.

## Implementation notes

- DC computation lives in `scripts/data/abstain.js` `defaultAbstainDc(withdrawalMod)`.
- Outcome math lives in `applyAbstainOutcome(passed, currentRests)` — pure helper, unit-tested.
- The hook is `scripts/hooks/long-rest-abstain.js`. The button only appears for the actor's owner; the save is rolled on the actor.
- Multiple active withdrawals each get their own button (one save per substance, independent rolls).
