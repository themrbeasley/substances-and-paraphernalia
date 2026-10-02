# Poisoned Coupling

Addiction Active Effects can ride on dnd5e's _poisoned_ status in three different ways. The world setting **Addiction ↔ Poisoned coupling** picks the mode.

| Mode                         | `statuses` array | What removing _poisoned_ does                                                                        |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `linked-cascade` _(default)_ | `["poisoned"]`   | Foundry's native cascade removes the addiction AE alongside _poisoned_.                              |
| `linked-isolated`            | `["poisoned"]`   | A `preDeleteActiveEffect` guard prevents external _poisoned_ removal from clearing the addiction AE. |
| `independent`                | `[]`             | Addiction AE is unrelated to _poisoned_ status.                                                      |

The setting is read **at AE-apply time**. Existing addiction AEs are not retroactively rewritten when the setting changes; only new applications pick up the new mode.

## When to use each

- **`linked-cascade`**: Default, simplest. Lesser Restoration, Protection from Poison, etc. clear the addiction AE for free. Mechanically the loosest; some tables prefer this.
- **`linked-isolated`**: Addiction AE _displays_ as poisoned (so token markers, condition immunities, and roll modifiers honor it) but _clearing poisoned doesn't clear addiction_. Closest to the spirit of the addiction loop without losing the _poisoned_ visual.
- **`independent`**: Addiction is its own status. Doesn't grant _poisoned_ effects (no disadvantage on attacks/checks from the _poisoned_ condition itself); doesn't react to remove-poisoned spells. Cleanest for tables that want addiction completely separate from the existing condition.

## DAE note

`linked-isolated` mode uses a `preDeleteActiveEffect` guard implemented natively. If at execution time this is found to require [DAE](https://foundryvtt.com/packages/dae) for reliability, the world setting will surface a notification when set to `linked-isolated` without DAE active.

## Authoring impact

If you use `independent` mode and **also** want the addiction AE to impose _poisoned_-style penalties (disadvantage on attacks/checks), the AE itself must encode those changes; Foundry won't apply them via the status link. The withdrawal AE is the more interesting place to encode penalties; see the wiki _Authoring_ page.
