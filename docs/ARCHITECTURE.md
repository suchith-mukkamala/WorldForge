# WorldForge architecture contract (v1.8)

WorldForge is a deterministic single-player browser simulation. The saved `World` object is the authoritative source of simulation truth; React and canvases are views, not a second world.

## The non-negotiable contracts

1. **Camera-independent world:** Camera, tab, zoom, rendering budgets, sprite visibility, and display interpolation must never enter `advanceWorldDays`, `stepWorld` or rule-based NPC decision-making.
2. **No arbitrary population ceiling:** Population depends on ecology, resources, reproduction, terrain, and density. Renderer limits are not simulation limits.
3. **Determinism:** Identical initial snapshots, seeds, and commands produce identical worlds regardless of playback chunking or which area is rendered.
4. **World changes are ordered:** Player interventions, edits, imports and new worlds must invalidate any in-flight background simulation. Only one worker tick is in flight at any time. Slow devices can run at lower effective rates; the game must never queue unlimited world ticks.
5. **Simulation fallback:** If worker creation or messaging fails, continue using the exact same `advanceWorldDays` engine on the main thread. No alternate behavior and no silent recreation of worlds.
6. **Stable persistence:** Engine schema (`World.version=2`) and compact container format (`evo-packed-v3`) are distinct. Existing plain worlds, legacy v1, and packed v2 files must remain readable. Packed v3 has a checksum for corruption detection; every imported snapshot still passes `isWorld`. The previous valid IndexedDB checkpoint is retained.
7. **Migrations precede simulation:** Future terrain, traits, realms, and more species must add defaulted or migrated data without silently reinterpreting old worlds or changing established histories.

## System boundaries

- `engine.ts`, `calendar.ts`, `mindII.ts`, and specialized modules own laws and world state. Use the deterministic world RNG and defined calendar boundaries, never `Math.random` or wall-clock time for simulation outcomes.
- `simulation.worker.ts` computes automatic calendar steps. `simulationProtocol.ts` defines a guarded, revision-matched request-response contract; the React app discards stale responses. The worker receives an immutable world snapshot and cannot access or mutate UI state.
- `WorldCanvas.tsx`, `SettlementView.tsx` and `populationVisibility.ts` observe world state. Indoor display is currently an activity-based **visibility heuristic**, not actual path-to-interior simulation. Future true indoor occupancy must be modeled as explicit engine state before it affects behavior.
- `storage.ts` owns validation, compact encoding, snapshot migration, IndexedDB checkpoints and localStorage fallback. The current compact format has an integrity check; it is **not** a cryptographic signature.
- `WorldforgeApp.tsx` controls user actions, playback, display state, and diagnostics. Any external world-changing command must invalidate pending simulation results.

## Future terrain implementation

Elevation fields are optional, validated v1.9 fields in new world data; older worlds use seeded lazy reconstruction. Do not block routes in old saves merely because heights now exist. Use spatial IDs and coordinate transforms shared across world-map and future 2.5D renderers. Physical slopes, cliffs, water, and passability must eventually be engine-owned and tested at every valid route step. A 2.5D camera should render this data without running its own parallel simulation.

## Future trait and species implementation

Keep traits keyed by stable IDs rather than UI strings. Store rank separately from mastery; record origin events, inheritance, and evolution requirements explicitly. Extend `isWorld` validation and migrations before saving new schema fields. No future trait should rely on whether its owner is onscreen.

## Performance contracts

- The world canvas limits visible sprites, applies view bounds, and caches settled scenery when its visible signature is unchanged.
- Diagnostics are opt-in and show worker/fallback mode, tick duration, message time, frame draw duration, visible sprite count, population, and settlements.
- Worker cloning and full-world UI snapshots still have costs. For multi-planet scales, benchmark memory and transfer cost and consider region-based incremental snapshots rather than blindly expanding the current protocol.
- Rendering performance and simulation throughput are separate measurements. Do not mask slow simulation by making NPCs cease to think while offscreen.

## Validation

Every PR: `npm run build`, `npm test`, `npm run test:release-smoke`.
Weekly/manual stress: `npm run test:long-simulation`, `npm run test:population-sweep`, `npm run test:daily-life-sweep`.

The tests must cover deterministic seeds, save round trips and migrations, world invariants, age/calendar boundaries, population and ecology, and presentation independence.
