# MVP Push Todo — v0.2

Slice checklist mirroring [plan.md](plan.md). Full rev-5 plan lives at
`~/.claude/plans/i-want-you-to-frolicking-pike.md`.

## Phase A — framework gaps

- [x] **A.0** Read-only audit (bypassOnce lifecycle, DAE detection, post-activity hook, 3-dot header-controls API, settings drift). Findings appended to the plan.
- [x] **A.1** Schema cleanup (schemaVersion → 2, drop 4 stub settings), breaking CHANGELOG, lang strings.
- [x] **A.2** Flag accessors — substance addiction, administration, paraphernalia bypass, actor withdrawal flag, AE `sourceSubstanceId`.
- [x] **A.3** Item-settings 3-dot menu form (ApplicationV2) for substance + paraphernalia authoring.
- [x] **A.4** Implicit DAE-required AE detection in `scripts/integrations/dae.js`.

## Phase B — automation

- [x] **B.1** `dnd5e.postUseActivity` save-on-use hook — calls B.4 first; on no bypass, rolls Con save through standard 5e dialog; on fail clones template AE + sets actor flag.
- [x] **B.2** `dnd5e.restCompleted` long-rest tick (GM-arbitrated). Decrements `restsRemaining`, removes AE at zero.
- [x] **B.3** Remove Addiction macro — GM-only, name/flag/withdrawal-flag candidate match, per-AE checkbox preview, JSON whisper before delete.
- [x] **B.4** `consumeBypassIfAvailable(actor, substance)` — filters gate-satisfying paraphernalia by `appliesTo` + uses-remaining, decrements `system.uses.spent`.

## Phase C — content

- [x] **C.1** Sign-off (numbers + format + AE naming + reference picks locked).
- [x] **C.2** Coalshade Powder rewrite (administration `inhaled`, addiction template AE).
- [x] **C.3** Black Lift rewrite (administration `sublingual`).
- [x] **C.4** Stellar Mist rewrite (administration `inhaled`) + DAE-required Insight variant.
- [x] **C.5** Bogwitch's Prank — free substance, empty `requiredParaphernalia`.
- [x] **C.6** Rolling Papers (consumable, 50-count) + smokable substance that consumes them.
- [x] **C.7** Shen Feng Wa's Dubious Pipe — legendary attuned, PB/day auto-pass for inhaled.
- [x] **C.8** Wa's Reserve — substance whose `requiredParaphernalia` names the pipe by full Compendium UUID.

## Phase D — tests, CI, docs

- [x] **D.1** Pure-function unit tests (`node --test`): withdrawal formula, slug parsing, requirements eval, bypass match.
- [x] **D.2** Quench integration suite — substance/paraphernalia contracts, references readiness, addiction outcomes, long-rest tick, save bypass.
- [x] **D.3** `tools/validate-content.mjs` content invariants validator.
- [x] **D.4** GitHub Actions CI workflow (Node 20: install, lint, validate, test:unit, pack).
- [x] **D.5** GM Guide — Addiction & Withdrawal + Save Bypass & Administration sections.
- [x] **D.6** [docs/flag-schema.md](../docs/flag-schema.md) + [README.md](../README.md) v2 updates.
- [x] **D.7** This file + [plan.md](plan.md).

## Out of scope (post-MVP)

3×3 matrix completion, multi-page GM Guide split, registry submission, deeper midi-qol chaining,
Token Magic FX integration, world compendium for user-content, custom Addicted condition,
schema migration framework, bypass types beyond `auto-pass`.
