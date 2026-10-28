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

## Terrain and perspective contract (v2.0)

Elevation fields remain optional, validated v1.9 fields; older worlds use seeded lazy reconstruction. New worlds include `terrainPhysics:{version:1}` so height influences travel effort and NPC route choice, farming output and regeneration, and construction-site selection. Older saves without this optional flag retain **exactly neutral terrain modifiers**. Their owners can opt in, which materializes an existing deterministic heightfield without touching population, RNG, events or history. Never block existing routes merely because heights exist. Sea navigation remains bound to actual water biomes.

The **VIEW** control switches between `WorldCanvas.tsx` (overhead) and `DepthCanvas.tsx` (raised isometric). `depthProjection.ts` maps the same authoritative tile indices and heightfield to pixel coordinates and to a hidden exact-color picking canvas. Both renderers must stay read-only, with all painting and selection gestures forwarded through the same edit/inspect commands. Caching static terrain must not cache stale people or settlements. The current 2.5D scene is an isometric overview, not a separate playable 3D simulation.

**v1.9.3 hydrology contract, extended in v2.0:** `hydrology.ts` runs a seeded priority-flood on the authoritative (or lazily reconstructed) heights. Existing water tiles and world boundaries are outlets; flow pointers are acyclic and every cell has a receiving basin. Reverse flow accumulation classifies creeks/streams/rivers and identifies closed depressions that *might* pond. The derived typed arrays are cached by immutable topography identity and deliberately **not serialized**: exporting/importing a world reproduces them exactly without inflating old saves or consuming engine RNG. Painting terrain replaces topography, invalidating the cache. In v2.0 physical-terrain worlds, creek-bearing farm sites gain limited irrigation; old worlds are unaffected. No derived water overlay creates a new navigable `Biome='water'`, shipping connection, or flood obstruction.

**v1.9.4 scenic contract:** `terrainDetails.ts` hashes seed, world coordinates, biome, elevation and shoreline transition to choose decorative motifs. `WorldCanvas.tsx` paints a 6-pixel sprite; `SettlementView.tsx` renders a larger hand-pixelled version of that same motif. Neither renderer changes or persists world state. Visual trees and rocks must not be mistaken for `ResourceDeposit` objects; those remain the only real harvestable resources. Pages deployment must publish Vite's compiled `dist` directory with the `/WorldForge/` base, never the repository source or Jekyll output.

**v1.9.5 rendering contract:** The small world-map sprites in `terrainDetails.ts` are prepainted into a single 6px-high sprite sheet, with the original painter as a safe fallback when canvas creation fails. Atlas and settlement shadows are visual-only, not serialized. `sceneryZoomTier` invalidates the static terrain buffer only when the zoom crosses thresholds for deposits/roads or buildings; intermediate magnification keeps the same raster. Map-layer legends must distinguish actual resources and navigable water from decorative scenery and derived creeks. Terrain regression tests ensure identical atlas pixels and saved/legacy compatibility.

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
