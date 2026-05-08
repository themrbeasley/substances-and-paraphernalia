# Simulate Dose

Authoring a substance is iterative — you tweak DCs, swap paraphernalia gates, refine overdose chances, and you want to know what happens *without* applying state to a real PC. The **Simulate dose…** entry on the substance item sheet's 3-dot menu runs the activity end-to-end on an ephemeral throwaway actor, captures the chat output, and cleans up.

## Where it lives

Open any substance item sheet. The header has a 3-dot context menu (next to the close button). On substance items, that menu has a **Simulate dose…** entry.

The entry is **substance-only** — paraphernalia items don't get it.

## The dialog

The dialog exposes three knobs:

- **Constitution modifier override** — defaults to +0; lets you simulate Con +3, Con −1, etc. without authoring a full character.
- **Current addiction state** — `none`, `addicted`, or `withdrawing`. Affects how the dose interacts with the addiction loop.
- **Paraphernalia ready** — toggle list of the substance's required paraphernalia. Toggle on/off to test gate behavior and bypass paths.

Click **Simulate** to run.

## What runs

Simulate creates an ephemeral actor named `__fishut-test-<uuid>__<original-name>` and:

1. Equips the configured paraphernalia (ready or not).
2. Sets up the addiction state.
3. Adds the substance and runs `activity.use()` end-to-end.
4. The full pipeline fires: gate → save → AEs → tolerance → overdose.
5. Chat output is captured and rendered as a summary in the dialog.

## Cleanup

The temp actor is deleted on:

- Dialog close (normal exit).
- Errors during simulation (the actor doesn't survive a thrown exception).
- World load — a `ready` hook sweeps any orphan `__fishut-test-*` actors. The sweep is GM-arbitrated (`game.users.activeGM === game.user`).

You should never see a `__fishut-test-*` actor in the directory. If you do, reload the world; the next active-GM logon will clear it.

## Limitations

- Simulate doesn't run a real player roll — saves are rolled with the override Con mod and no luck/inspiration features.
- Bypass paraphernalia decrement their `usesPerDay` on the temp actor only; the temp actor's deletion takes those decrements with it.
- Tolerance stacking *during* a single simulation run shows post-pass behavior; tolerance state on the live actor is unaffected.
