# Macros

The module ships four GM macros for clearing module-applied AEs from selected actors. Each follows the same pattern — flag-based primary match, regex name fallback.

| Macro | Primary match | Regex fallback |
|---|---|---|
| **Remove Addiction** | `flags[MODULE_ID].sourceSubstanceId` | `/addict/i` |
| **Remove Tolerance** | `flags[MODULE_ID].sourceSubstanceId` on AE with `modifier.kind: "tolerance"` | `/tolerance/i` |
| **Remove Overdose** | (no source-substance flag — overdose markers don't carry one) | `/overdose/i` |
| **Remove Withdrawal** | `flags[MODULE_ID].sourceSubstanceId` on AE with `withdrawal` substring | `/withdraw/i` |

## How they work

Each macro:

1. Reads the GM-selected actor (or warns if none).
2. Scans the actor's AEs for matches via the primary flag, falling back to the regex name match.
3. Renders a dialog listing each match with a checkbox.
4. On confirm, deletes the checked AEs.

The flag-based match is the primary path because it's robust against name renames; the regex fallback exists for AEs that were applied before the source-flag wiring landed (or for hand-applied AEs that match the naming contract).

## When to use which

- **Remove Addiction** — Clears the addiction AE *and* the actor flag entry that drives the long-rest withdrawal countdown. This is the macro to use when you want to "you're cured" a character mid-campaign.
- **Remove Tolerance** — Clears tolerance stacks on a per-substance basis (the dialog lets you pick which substance's tolerance AE to remove).
- **Remove Overdose** — Clears the overdose marker. Cosmetic — the marker doesn't drive any active behavior, but tables that surface marker AEs in macros / dashboards may want to clean up after the fiction has resolved.
- **Remove Withdrawal** — Removes the withdrawal AE without touching the actor flag. Use when a player gets a magical detox (Greater Restoration, etc.). For *full* cleanup including the long-rest tracker, use Remove Addiction.

## Permissions

All four are GM-only. They run on the selected token's actor.

## Where they live

Packed into the `fishut-illicit-macros` compendium. Drag the macro to your hotbar to use.

## What they don't do

- Remove status effects unrelated to this module.
- Touch the substance item itself (consumables auto-destroy on use via dnd5e's native handling).
- Roll any saves or fire any chat cards — these are pure cleanup macros.
