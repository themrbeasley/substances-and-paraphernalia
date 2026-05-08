# v0.4 hand-test checklist

Walk through these in order. Each section is roughly self-contained; you can stop after any sub-section and pick up later. Anywhere it says "verify" — eyeball it; no automation, no assertions.

---

## 1. Authoring

### 1.1 Substance Details tab

Open any substance (e.g. the new **Triple Burn** or any v0.3 substance).

- [x] Details tab renders without console errors.
- [x] **Kind / Category / Setting** selectors show current values; each persists round-trip (change → close → reopen).
- [x] **Required subtypes** picker lists all 9 built-ins plus any custom subtypes you've added (test 1.3 first, then come back here).
- [x] **Addiction** block — ability, DC, withdrawal mod, addiction-AE picker — each persists.
- [x] **Withdrawal AE picker** appears and lists the substance's own AEs whose name contains `withdraw`. Hint text below it reads coherently and warns against duplicating *poisoned*.
- [x] **Overdose fieldset**: enabled toggle, chancePercent (1–100 number), description (textarea). Toggle off → other fields visually inert. ChancePercent clamps client-side at 1 and 100. All three persist.
- [x] Schema-version / writeback: change a field, hit Save, reopen — value still there.

### 1.2 Paraphernalia Details tab

Open **Calibrated Inhaler** (new, modern, inhaler).

- [x] **Subtype** select shows built-ins + custom; current value (`inhaler`) is selected.
- [x] No substance fields leak onto paraphernalia (no Required subtypes, no Addiction block, no Overdose fieldset).
- [x] Open the AE tab, open the **Calibrated Inhaler — Save Modifier** AE — verify the modifier flag block on the AE flags tab (`kind: bypass`, `type: +N`, `bonus: 2`, `appliesTo: ["inhaled"]`).
- [x] **Addiction Save Modifiers** section on the Details tab shows `Save Bonus: +2`.

### 1.3 Paraphernalia Subtype Manager

*Game Settings → Module Settings → Manage Paraphernalia Subtypes*.

- [x] Built-ins listed (pipe, snuff-horn, syringe, vial, papers, inhaler, rolling-papers, tincture-dropper, athletes-logbook); not deletable, not editable.
- [x] **Add row** → enter `ritual-incense` with label "Ritual Incense" — saves cleanly.
- [x] Try to add `pipe` (built-in collision) → form rejects with an error before save.
- [x] Try to add `Ritual_Incense` (non-kebab-case) → form rejects.
- [x] Add a second custom row with the same id as the first → form rejects (duplicate).
- [x] Reload the world. Open the manager again. Custom subtype still present.
- [x] Open a substance, look at Required subtypes — `ritual-incense` appears as an option.
- [x] Open a paraphernalia, the Subtype select offers `ritual-incense`.
- [x] Delete the custom row from the manager. It vanishes from both pickers (after sheet re-render).

### 1.4 Simulate dose

Open any substance item sheet → header **3-dot menu**.

- [x] **Simulate dose…** entry appears on substance items only.
- [x] On a paraphernalia (e.g. Calibrated Inhaler), the entry is absent.
- [x] Click it. Dialog opens with: Con-mod override, addiction state (none / addicted / withdrawing), per-required-subtype paraphernalia toggles.
- [x] Run with all defaults — chat output captured in the dialog summary, not posted to the live log.
- [x] Run with Con +5 — observable in the addiction-save line of the captured chat.
- [x] Run with paraphernalia OFF — gate fires, dialog summary shows the missing-paraphernalia message.
- [x] Run with paraphernalia ON — gate passes; addiction save rolls.
- [x] Close the dialog. Open the actor directory. **No `__fishut-test-*` actors remain.**
- [x] (If you can force one): leave a `__fishut-test-*` actor in the directory and reload the world. The active GM's `ready` hook should sweep it on next world load.

---

## 2. Mechanics

### 2.1 Consumption gate (`preUseActivity`)

Pick a substance with a `requiredSubtypes` list (e.g. **Triple Burn** requires `inhaler`).

- [x] Drop the substance on a PC who has **no inhaler equipped/ready**. Use it. Missing-paraphernalia dialog appears.
- [x] Dialog is visible to a logged-in **player** (not just GM).
- [x] Click **Use anyway** — activity proceeds; no further gate prompt for that activity ID.
- [x] Equip a Calibrated Inhaler on the PC, retry — gate passes silently, activity runs.
- [x] *Game Settings → Enforce paraphernalia requirements* off → gate skipped entirely; addiction logic still fires (verify by failing a save).

### 2.2 Addiction (`postUseActivity`)

- [x] Use a substance with a low DC (e.g. DC 5) and a high withdrawalMod — let the actor fail the save. Addiction AE applied, name contains `addict`. Console shows no errors.
- [ ] Actor flag `flags["substances-and-paraphernalia"].withdrawal[<itemId>]` populated with `{ restsRemaining, appliedAt }`.
- [x] Re-use the substance while still addicted. **Withdrawal extended** to `max(currentRests, newComputed)`; doesn't reroll, doesn't shorten.
- [x] Use a different substance whose save the actor passes — addiction AE NOT applied; tolerance AE IS applied (next section).

### 2.3 Withdrawal (`restCompleted`)

- [x] Long rest on an addicted actor. `restsRemaining` decrements by 1. AE survives until 0.
- [x] Long rest at `restsRemaining = 1` → AE removed; flag entry cleared.
- [x] Short rest does nothing.
- [x] **Multi-client**: with both a player and GM client connected, do a long rest. Withdrawal ticks **once**, not twice. (The active GM is the only client that decrements.)
- [x] Author a substance with `withdrawalEffectId` pointing at a custom withdrawal template AE. Trigger withdrawal on a PC. The **authored** template's AE is applied (not the v0.3 default).
- [x] Substance with `withdrawalEffectId` unset → v0.3 default behavior preserved.

### 2.4 Tolerance

Author a tolerance template AE on a substance (Active Effects tab → new AE → name *"Tolerance: {Substance}"* → flag block: `kind: tolerance`, `substanceId: <itemId>`, `addictionDcBump: 1`, `attenuateAltered: { durationFactor: 0.1 }`).

- [x] Pass the addiction save once. Tolerance AE applied to the actor with `flags.stacks: 1`. Name contains `tolerance`.
- [x] Pass the save again with the same substance. **Same AE**, stacks now 2.
- [x] Use a different substance, pass its save. **Separate** tolerance AE for that substance.
- [x] Three stacks of `addictionDcBump: 1` → effective DC for the next save is base + 3 (verify in the save chat card or via simulate-dose).
- [x] Three stacks of `attenuateAltered.durationFactor: 0.1` → Altered AE duration is base × 0.7 (verify via the next applied Altered AE's duration).

### 2.5 Overdose

Set a substance's overdose: `enabled: true, chancePercent: 100, description: "<some text>"`.

- [x] Use the substance. Marker AE **Overdosed on {Substance}** applied. Name contains `overdose`. Chat card posted with the description.
- [x] Set `chancePercent: 0` and use 5×. Marker never fires.
- [x] At `chancePercent: 100`, use a substance the actor passes the addiction save on — overdose **still fires**. (Overdose is independent of save outcome.)
- [x] Disable overdose. Marker doesn't fire. No chat card.

### 2.6 Voluntary abstain

Pre-condition: actor has at least one active withdrawal AE.

- [x] *Module Settings → Voluntary Abstain* on. Open the long-rest dialog. **Abstain this rest** button per active withdrawal substance.
- [x] Click it. Wis save rolled vs `8 + withdrawalMod`.
- [x] **Pass** → `restsRemaining -= 2`, clamped at 0; AE removed when at 0.
- [x] **Fail** → `restsRemaining -= 1`, no penalty (same as a normal rest).
- [x] Setting off → no Abstain button.
- [x] Two simultaneous withdrawals → two independent buttons, two independent saves.

### 2.7 Poisoned coupling

- [x] *Module Settings → Addiction ↔ Poisoned* set to **linked-cascade** (default). Apply addiction. Externally remove the *poisoned* status. Addiction AE removed too.
- [x] Set to **linked-isolated**. Apply a fresh addiction (existing AEs aren't retroactively rewritten). Externally remove *poisoned*. **Addiction AE survives.**
- [x] Set to **independent**. Apply a fresh addiction. AE has empty `statuses` (no poisoned coupling). Removing *poisoned* doesn't affect it.
- [x] Switch the setting back to linked-cascade. Existing AEs from the prior modes still behave per the mode they were applied under (no retroactive rewrite).

### 2.8 `+N` bypass

- [x] Equip Calibrated Inhaler on a PC. Use Triple Burn (inhaled). Save chat shows **+2** bonus, sources line cites the inhaler.
- [x] Equip a second `+N` paraphernalia (e.g. duplicate the inhaler with `bonus: 1`). Save shows **+3** (sum).
- [x] Equip an `advantage`-tier inhaler bypass alongside the `+N` inhaler. Save rolls with **advantage**, no `+N` bonus added.
- [x] Equip an `auto-pass` inhaler too. Save **auto-passes**; sources line cites the auto-pass source.

### 2.9 Drag-to-inventory dialog

GM or ASSISTANT drags a substance to a PC's inventory.

- [x] Dialog appears with the v0.3 buttons + the v0.4 ones.
- [x] **TOLERANT** → tolerance AE applied to the actor, `flags.stacks: 1`. No "Coming in v0.4" toast.
- [x] **OVERDOSED** → overdose marker AE applied. No toast.

---

## 3. Macros

Drag each from the `fishut-illicit-macros` compendium to the hotbar.

### 3.1 Remove Addiction (regression)

- [ ] Select an actor with an addiction AE. Run macro. Dialog lists the AE. Confirm. AE removed and the actor's withdrawal flag entry cleared.

### 3.2 Remove Tolerance

- [ ] Select an actor with two tolerance AEs (different substances). Run macro. Dialog lists both with checkboxes.
- [ ] Check one, confirm. Only that one removed; the other survives.
- [ ] Hand-apply a tolerance AE that **lacks** the `sourceSubstanceId` flag (just name it "Tolerance: Test"). Run macro. Regex fallback should still list it.

### 3.3 Remove Overdose

- [ ] Actor with an overdose marker AE. Run macro. Dialog lists it. Confirm. AE removed.
- [ ] Actor with no overdose markers → macro reports nothing to remove (or the dialog shows an empty list — verify the UX is reasonable, not a console error).

### 3.4 Remove Withdrawal

- [ ] Actor with a withdrawal AE. Run macro. Dialog lists it. Remove. AE goes; **actor flag remains** (this is the intentional difference vs Remove Addiction — note in the wiki Macros page).
- [ ] Compare with Remove Addiction: Addiction clears AE **and** flag; Withdrawal clears only the AE. Spot-check this is the desired semantic — if not, raise it as a tweak.

---

## 4. Content

### 4.1 Round-2 substances (8 new)

Open each substance item sheet and dose-test:

- [ ] **combat-cocktail** (modern, performanceEnhancing)
- [ ] **ironhour-caps** (modern, stimulant)
- [ ] **memorywire** (sciFi, mindAltering)
- [ ] **moonleaf-tincture** (fantasy, mindAltering)
- [ ] **plasma-snuff** (sciFi, stimulant)
- [ ] **triple-burn** (modern, mindAltering)
- [ ] **whisperdust** (fantasy, performanceEnhancing)
- [ ] **wyrmiron-salts** (fantasy, stimulant)

For each:

- [ ] Sheet renders cleanly (no missing-key strings, no console errors).
- [ ] Description prose reads naturally.
- [ ] AEs present and named per contract (`addict` for addiction, `withdraw` for withdrawal, `Altered by *` for the benefit).
- [ ] Drop on a PC, use it end-to-end. Gate (if any required subtypes) → save → AE application → chat card.
- [ ] DC and withdrawalMod feel proportional to the lore (raise as a tweak if any feels off).

### 4.2 Calibrated Inhaler (+N paraphernalia)

- [ ] Sheet renders cleanly.
- [ ] Equipped on a PC, the bypass AE (`transfer: true`) applies passively.
- [ ] Pair with **Triple Burn** (modern, inhaled, requires `inhaler`) — gate passes, save rolls with `+2`.
- [ ] Pair with a non-inhaled substance whose required subtype is `inhaler` (none ship currently) — bypass does NOT fire because `appliesTo: ["inhaled"]`. Verify by trying with a different administration.

---

## 5. Open observations to capture as you go

Use this section as a scratchpad for tweaks / minor improvements you spot. Each line gets a short fix description for the next session.

- [ ] _<observation 1>_
- [ ] _<observation 2>_
- [ ] _<observation 3>_

---

## After all sections pass

- Confirm with me which (if any) tweaks should land before tagging.
- Then push `main` and tag `v0.4.0` to fire the release workflow.
