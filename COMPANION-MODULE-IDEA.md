# Companion module ideas (separate repos, depend on substances-and-paraphernalia)

These were captured during the v0.3 → v1.0 spec session. They are explicitly OUT OF SCOPE for this repo. Move this file to wherever you track future-module ideas.

## Module A — Content & Narrative companion (premium)

Premium content companion that adds story-shaped material on top of the base mechanics.

- Scenarios / one-shot adventures built around substance use.
- Encounter tables (e.g. dealers, raids, withdrawal-as-narrative-beat).
- Dealer NPCs with stat blocks and inventory hooks.
- Smuggling / criminal mechanics — risk tables, contact lists, heat tracking.
- Recovery arcs — multi-session NPCs (sponsors, rehab) with narrative beats.
- Narrative-beat triggers — chat hooks that fire when addiction state changes (e.g. "On first dose, surface a flavor line"). Optional add-on.

## Module B — Expansion + Crafting Integration (premium)

Premium content + integration companion.

- Additional substances and paraphernalia beyond the base 3×3 matrix.
- **Recipe journals — two flavors**:
  - Shattered Codex *The Cauldron*-compatible recipes.
  - Ripper93 *Mastercrafted*-compatible recipes.
  - GMs running either crafting module get pre-made interactions/hybrids out of the box.
- **Mixed-substance interactions** — stimulant + mind-altering combo outcomes, contraindications, synergies. Lives here because it needs the wider content surface.

Both modules declare a hard dependency on `substances-and-paraphernalia`.

## Module C — Living Vessel actor type

A separate actor type for substance-affected *vessels* — ships, vehicles, magical conveyances — that consume, metabolize, and react to substances the way a creature does, with vital stats analogous to a PC's (a Constitution-equivalent score, save abilities, addiction susceptibility).

**Why a companion module, not core:** dnd5e's existing `vehicle` actor is built around HP, speeds, and crew, not around metabolism or saving throws. Treating a vehicle as an addiction-capable creature requires bespoke schema; it would bloat the core module's surface and confuse the (PC, NPC) → substance loop that the base ships. Living Vessel is a niche genre play (think: alchemical airships, fey-bound coaches, biomechanical tanks) that earns its own actor type and its own consumers' opt-in.

**Likely scope:**
- New actor type `living-vessel` with a Con-equivalent stat block.
- Reuses the modifier pipeline and addiction loop from the base module, gated by an actor-type check that v0.3+ already supports (drag-to-inventory dialog only opens for `character`/`npc` — Living Vessels would extend that allow-list).
- Optional integration with vehicle-crewing modules so the vessel's stat changes propagate to crew checks.

Hard dependency on `substances-and-paraphernalia`.
