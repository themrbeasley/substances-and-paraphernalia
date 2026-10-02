# Simulate Dose

Authoring a substance is iterative: you tweak DCs, refine the high, the withdrawal or the overdose, and you want to see what a dose does _without_ touching a real character. The **Simulate dose…** entry on the substance item sheet's 3-dot menu runs one dose on a throwaway actor, captures the chat output, and cleans up.

## Where it lives

Open any substance item sheet. The header has a 3-dot context menu (next to the close button). On substance items, that menu has a **Simulate dose…** entry.

The entry is **substance-only**; paraphernalia items don't get it.

## The dialog

The dialog has two settings:

- **Constitution modifier**: defaults to +0; lets you simulate Con +3, Con -1, and so on without authoring a full character.
- **Current addiction state**: `none`, `addicted`, or `withdrawing`. `addicted` gives the test actor the substance's Addiction effect first; `withdrawing` adds its withdrawal effects too, halfway through their duration.

Click **Simulate** to run.

## What runs

Simulate creates a throwaway actor named `__fishut-test-<uuid>__<original-name>`, copies the substance onto it (with the copy's effect lists pointing at its own effects, so the drug's authored withdrawal and overdose effects are the ones used), sets up the addiction state, and runs the same dose pipeline a real use runs (see _Mechanics_, "One dose"):

1. Relapse check (a dose in withdrawal ends the withdrawal).
2. Addiction save, with any paraphernalia bypass on the actor (the test actor has none).
3. The high, scaled by tolerance.
4. Tolerance +1.
5. Overdose check.

It does not run the paraphernalia gate: the test actor carries no gear, and Simulate calls the pipeline directly instead of using the item. The result window shows the captured chat lines and the effects the actor ended with. If a step fails, the window says which one and why, and the rest of the steps still run.

## Cleanup

The temp actor is deleted on:

- Dialog close (normal exit).
- Errors during simulation (the actor doesn't survive a thrown exception).
- World load: a `ready` hook sweeps any orphan `__fishut-test-*` actors. The active GM runs the sweep.

You should never see a `__fishut-test-*` actor in the directory. If you do, reload the world; the next active-GM logon will clear it.

## Limitations

- The addiction save opens the normal roll window; closing it rolls the save anyway, as in play.
- The paraphernalia gate and bypasses aren't exercised; test those on a real (or copied) character.
- Tolerance starts at 0 on the test actor, so a single run always shows the full-strength high.
