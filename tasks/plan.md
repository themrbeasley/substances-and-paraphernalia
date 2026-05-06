# MVP Push Plan — Substances and Paraphernalia v0.2

Condensed in-repo plan for the v0.2 push. The full rev-5 plan lives outside
the repo at `~/.claude/plans/i-want-you-to-frolicking-pike.md`.

## Goal

Functionally complete v0.2 — addiction-save loop, paraphernalia-granted
save bypass, item-sheet authoring form, content invariants, CI, and
documentation. **Not** a registry submission; the matrix fill and
multi-page journal split stay deferred.

## Schema break

`schemaVersion` is bumped to 2. v0.1 content does not auto-migrate; world
copies from v0.1 must be re-imported from compendium. See [CHANGELOG.md](../CHANGELOG.md).

## Flag schema (v2)

Substance flags:

```js
flags["substances-and-paraphernalia"] = {
  kind: "substance",
  setting, category, tags, requiredParaphernalia, requiresDae,
  administration: "inhaled" | "ingested" | "injected" | "sublingual" | "topical",
  addiction: {
    save: { ability: "con", dc: 13 },
    withdrawalMod: 4,
    addictionEffectId: "<aeId on this item>"
  },
  schemaVersion: 2
};
```

Paraphernalia flags:

```js
flags["substances-and-paraphernalia"] = {
  kind: "paraphernalia",
  setting, paraphernaliaId,
  // optional, only on bypass-granting paraphernalia:
  addictionSaveBypass: {
    type: "auto-pass",
    appliesTo: ["inhaled"],
    usesPerDay: "@prof"
  },
  schemaVersion: 2
};
```

Actor flag (canonical withdrawal state):

```js
actor.flags["substances-and-paraphernalia"].withdrawal = {
  [substanceId]: { restsRemaining, appliedAt }
};
```

Applied AE flag (UI mirror):

```js
effect.flags["substances-and-paraphernalia"].sourceSubstanceId = "<itemId>";
```

## Phases (vertical slices, each verifiable)

### Phase A — framework gaps

- **A.0** Read-only audit of `bypassOnce` lifecycle, DAE detection, post-activity
  hook signature, 3-dot header-controls API, settings drift. Findings appended
  to the plan; live-world signature checks deferred to implementing slices.
- **A.1** Schema cleanup, breaking CHANGELOG, lang strings.
- **A.2** Flag accessors for substance addiction, administration, paraphernalia
  bypass, actor withdrawal flag, AE `sourceSubstanceId`.
- **A.3** Item-settings 3-dot menu form (ApplicationV2) for substance and
  paraphernalia authoring.
- **A.4** Implicit DAE-required AE detection (`scripts/integrations/dae.js`).

### Phase B — automation

- **B.4** `consumeBypassIfAvailable(actor, substance)` helper. Filters gate-satisfying
  paraphernalia by `appliesTo` + uses-remaining, decrements `system.uses.spent`.
- **B.1** Save-on-use post-activity hook (`dnd5e.postUseActivity`). Calls B.4
  first; on no bypass, rolls a Constitution save through the standard 5e
  dialog; on fail clones the addiction template AE onto the actor and sets
  the actor flag.
- **B.2** Long-rest withdrawal tick (`dnd5e.restCompleted`, GM-arbitrated).
  Decrements `restsRemaining`, removes AE at zero.
- **B.3** Remove Addiction macro — GM-only, name/flag/withdrawal-flag candidate
  match, per-AE checkbox preview, JSON whisper before delete.

### Phase C — content

- **C.2–C.4** Coalshade Powder, Black Lift, Stellar Mist rewrites with v2
  flags + canonical description format. Stellar Mist ships a DAE-required
  Insight variant.
- **C.5** Bogwitch's Prank — free substance, no paraphernalia. Exercises
  empty-`requiredParaphernalia` path.
- **C.6** Rolling Papers (consumable, 50-count) + a modern smokable that
  consumes them. Exercises consumable-quantity readiness.
- **C.7** Shen Feng Wa's Dubious Pipe — legendary, attuned, PB/day auto-pass
  bypass for inhaled substances.
- **C.8** Wa's Reserve — substance whose `requiredParaphernalia` names the
  pipe by full Compendium UUID. Exercises UUID resolution + the
  end-to-end bypass path.

### Phase D — tests, CI, docs

- **D.1** Pure-function unit tests (Node `node --test`): withdrawal formula,
  slug parsing, requirements eval, bypass match.
- **D.2** Quench integration suite: substance/paraphernalia contracts,
  references readiness, addiction outcomes, long-rest tick, save bypass.
- **D.3** `tools/validate-content.mjs` content invariants validator.
- **D.4** GitHub Actions CI workflow (Node 20: install, lint, validate,
  test:unit, pack).
- **D.5** GM Guide Addiction & Withdrawal + Save Bypass & Administration
  sections.
- **D.6** [docs/flag-schema.md](../docs/flag-schema.md) + [README.md](../README.md) v2 updates.
- **D.7** This file + [tasks/todo.md](todo.md).

## Out of scope (post-MVP)

3×3 matrix completion, multi-page GM Guide split, registry submission, deeper
midi-qol chaining, Token Magic FX integration, world compendium for
user-content, custom Addicted condition, schema migration framework, bypass
types beyond `auto-pass`.
