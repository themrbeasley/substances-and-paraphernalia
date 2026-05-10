# Paraphernalia Subtype Manager

Authors pick paraphernalia subtypes from a list when filling in the Details tab. The shipped list of built-ins (pipe, snuff-horn, syringe, vial, papers, inhaler, rolling-papers, tincture-dropper, athletes-logbook) is rarely enough — every setting wants its own gear taxonomy. The **Manage Paraphernalia Subtypes** sub-menu is the GM's editor for adding custom subtypes.

## Opening the manager

*Game Settings → Module Settings → Manage Paraphernalia Subtypes* (`registerMenu` entry).

## What the form does

A simple ApplicationV2 form:

- **List rows.** Each row is `{ id, label }`. Built-ins are listed first (read-only — name and id can't be edited or deleted).
- **Add row.** Inserts a new editable row. Pick an `id` (kebab-case) and a label.
- **Edit / Delete.** Custom rows are editable and deletable. Built-ins are not.
- **Save.** Persists the custom list to the world setting `customParaphernaliaSubtypes`.

## Validation

- `id` must be kebab-case (lowercase letters, digits, hyphens). Same convention as built-ins.
- `id` collisions with built-ins or other custom entries are rejected with an error before save.
- `label` is free-text.

## How authors see custom entries

The Details-tab subtype select on **paraphernalia** items composes built-ins + custom entries via the pure helper `getEffectiveParaphernaliaSubtypes()`. The same composed list is used by:

- The substance Details-tab **Required subtypes** picker.
- The content validator (custom subtypes are valid `subtype` values; the validator rejects unknown ids regardless of source).

## Storage

- `customParaphernaliaSubtypes` is a hidden world data setting (no settings-panel UI; written exclusively by the manager).
- Default is the empty array.
- Built-in subtypes live in `scripts/data/schema.json` and never move into the setting — they're authoritative defaults.

## Removing a custom subtype

If you delete a custom subtype that's already referenced by an authored paraphernalia's `subtype`, the validator will surface that as an error on the next `npm run validate:content`. Update the affected items first or restore the subtype.
