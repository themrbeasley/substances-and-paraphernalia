# Integration license audit

This module is MIT-licensed (see [LICENSE](../LICENSE)) and integrates with optional FoundryVTT modules at **runtime only** — we never bundle, redistribute, or fork their code. Each integration is gated behind `game.modules.get(<id>)?.active === true`. Removing the integration module from a world reduces our behavior to a no-op; nothing of the integration ships in our zip.

This document tracks each integration's license, its compatibility with our distribution model (free MIT module + author Patreon), and our posture: **RECOMMEND** (listed in `relationships.recommends` and integrated), **DROP** (not integrated), or **REQUIRE-USER-INSTALLED** (integrated but not listed as recommended).

When adding a new integration to `scripts/integrations/index.js` `KNOWN_INTEGRATIONS`, **add a row to this doc** and run the same compatibility check.

## Audit summary

| Module | Foundry id | License | SPDX | Posture | Maintained as of |
|---|---|---|---|---|---|
| Dynamic Active Effects (DAE) | `dae` | MIT | `MIT` | RECOMMEND | 2026-05-08 |
| Midi-QoL | `midi-qol` | MIT | `MIT` | RECOMMEND | 2026-05-08 |
| Times-Up | `times-up` | MIT | `MIT` | RECOMMEND | 2026-05-08 |
| Token Magic FX | `tokenmagic` | GPL-3.0 | `GPL-3.0-or-later` | RECOMMEND (runtime-API boundary, see below) | 2026-05-08 |
| JB2A — Free | `JB2A_DnD5e` (free pack) | CC-BY-NC-SA 4.0 | `CC-BY-NC-SA-4.0` | DROP | 2026-05-08 |

## DAE — RECOMMEND

- **License:** MIT.
- **Source:** https://gitlab.com/tposney/dae
- **What we use:** Detection-only via `aeRequiresDae(effect)` in `scripts/integrations/dae.js`. We scan AE `changes` for DAE-only modes to surface a warning when DAE is missing.
- **Compatibility:** No friction. MIT is permissive and compatible with our MIT module + Patreon model. No attribution or share-alike obligations apply because we don't redistribute DAE code.
- **Maintained as of:** 2026-05-08.

## Midi-QoL — RECOMMEND

- **License:** MIT.
- **Source:** https://gitlab.com/tposney/midi-qol
- **What we use:** Future hook target (v0.6 roadmap). v0.5 ships no Midi-QoL code paths; the integration toggle exists for forward compatibility.
- **Compatibility:** No friction.
- **Maintained as of:** 2026-05-08.

## Times-Up — RECOMMEND

- **License:** MIT.
- **Source:** https://gitlab.com/tposney/times-up
- **What we use:** No direct API calls; we rely on Times-Up being present so AEs with duration `seconds`/`turns` expire reliably.
- **Compatibility:** No friction.
- **Maintained as of:** 2026-05-08.

## Token Magic FX — RECOMMEND (with boundary note)

- **License:** GPL-3.0-or-later.
- **Source:** https://github.com/Feu-Secret/Tokenmagic
- **What we use:** Runtime API only — `TokenMagic.addUpdateFiltersOnToken(token, [...])` and `TokenMagic.deleteFiltersOnToken(token, filterId)` from `scripts/integrations/tmfx.js` and from author-supplied macros in the `fishut-illicit-macros` compendium. Calls are conditional on `game.modules.get("tokenmagic")?.active`.
- **GPL-3.0 boundary:** GPL's copyleft applies to **derivative works of GPL code**. We do not include, vendor, fork, link, or redistribute any TokenMagic source. We make late-bound calls into a separate FoundryVTT module that the user installs independently. Under Foundry's plugin model this is the standard "runtime API consumer" posture — the equivalent of one MIT npm package calling another GPL npm package's public API at runtime without bundling. Our MIT license stands.
- **What this rules out:** copying TokenMagic source into this repo, vendoring its filters JSON, importing its files via path/URL, or producing a build artifact that contains TokenMagic code. None of those are happening.
- **Attribution:** Not required for runtime API use, but we credit TokenMagic in `module.json` `relationships.recommends` and in the README's optional-modules section.
- **Maintained as of:** 2026-05-08.

## JB2A (Free pack) — DROP

- **License:** CC-BY-NC-SA 4.0 (declared in JB2A's own `module.json`).
- **Source:** https://github.com/Jules-Bens-Aa/JB2A_DnD5e
- **What we considered:** A `scripts/integrations/jb2a.js` overlay that mounts JB2A video/image assets to `#interface` during withdrawal AEs as a preferred path above the CSS vignette.
- **Why DROP:**
  - **NonCommercial clause** — CC's NonCommercial guidance defines NC use as "not primarily intended for or directed towards commercial advantage or monetary compensation." This module is free and MIT-licensed, but we operate an active author Patreon (`https://www.patreon.com/themrbeasley`) declared in `module.json`. Whether shipping a JB2A-aware code path counts as "primarily intended for commercial advantage" is genuinely ambiguous, not clearly cleared.
  - **ShareAlike clause** — SA would require any work that adapts JB2A assets to be released under the same CC-BY-NC-SA-4.0 license. Our code does not adapt JB2A assets (we'd reference them by path), so SA is unlikely to bind on its own. NC is the binding concern.
  - **Conservative posture** — without a written, archived permission from the JB2A authors clearing our specific distribution model, the safe default is to not integrate.
- **What we do instead:** The TMFX Details-tab selector (Phase 3 of v0.5) supports a `macro` mode that takes any Foundry macro UUID. Users who own JB2A and want JB2A-driven visuals can author their own world-local macro that calls JB2A/Sequencer and reference it from a substance's `tmfx.macroUuid`. This keeps the JB2A code path in the user's world (where their personal CC-BY-NC use is unambiguous) and out of our shipped artifact.
- **Revisit if:** JB2A authors grant explicit written permission for our distribution model, or JB2A relicenses, or we drop the author Patreon. Until any of those, this stays DROP.
- **Maintained as of:** 2026-05-08.

## When to refresh this doc

- Adding a new integration to `KNOWN_INTEGRATIONS` → add a row + per-module section.
- Bumping a module's `verified` version in `module.json` `relationships.recommends` → spot-check the LICENSE file hasn't changed and update the maintained-as-of date.
- Annual sweep — Q1 each year: re-fetch each integration's LICENSE, confirm SPDX unchanged, bump dates.
- Any change to our own distribution model (e.g. dropping the Patreon, adding paid tiers, moving to a non-MIT license) → re-evaluate JB2A and any other NC-licensed asset packs.
