# Macros

The module ships four GM macros for clearing module-applied AEs from selected actors. Each follows the same pattern: flag-based primary match, regex name fallback.

| Macro | Primary match | Regex fallback |
|---|---|---|
| **Remove Addiction** | `flags[MODULE_ID].sourceSubstanceId` | `/addict/i` |
| **Remove Tolerance** | `flags[MODULE_ID].sourceSubstanceId` on AE with `modifier.kind: "tolerance"` | `/tolerance/i` |
| **Remove Overdose** | (no source-substance flag; overdose markers don't carry one) | `/overdose/i` |
| **Remove Withdrawal** | `flags[MODULE_ID].sourceSubstanceId` on AE with `withdrawal` substring | `/withdraw/i` |

## How they work

Each macro:

1. Reads the GM-selected actor (or warns if none).
2. Scans the actor's AEs for matches via the primary flag, falling back to the regex name match.
3. Renders a dialog listing each match with a checkbox.
4. On confirm, deletes the checked AEs.

The flag-based match is the primary path because it's robust against name renames; the regex fallback exists for AEs that were applied before the source-flag wiring landed (or for hand-applied AEs that match the naming contract).

## When to use which

- **Remove Addiction**: Removes the chosen Addiction effects and nothing else. Use it when a character is cured mid-campaign.
- **Remove Tolerance**: Resets tolerance per substance: clears the tolerance count, and the tolerance marker effect when there is one.
- **Remove Overdose**: Clears the overdose marker. Cosmetic: the marker doesn't drive any active behavior, but tables that surface marker AEs in macros or dashboards may want to clean up after the fiction has resolved.
- **Remove Withdrawal**: Removes the withdrawal effect, which **also ends the addiction**, the same as withdrawal running its course. Use it for a magical detox (Greater Restoration and the like). It also clears leftover withdrawal records that have no effect.

## Permissions

All four are GM-only. They run on the selected token's actor.

## Where they live

Packed into the `fishut-illicit-macros` compendium. Drag the macro to your hotbar to use.

## What they don't do

- Remove status effects unrelated to this module.
- Touch the substance item itself (consumables auto-destroy on use via dnd5e's native handling).
- Roll any saves or fire any chat cards; these are pure cleanup macros.
