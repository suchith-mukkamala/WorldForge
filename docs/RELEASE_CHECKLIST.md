# v1.8 stability release checklist

## Automated release gates
- [ ] `npm run build` passes
- [ ] `npm test` passes all unit/regression tests
- [ ] `npm run test:release-smoke` passes multiple fixed seeds
- [ ] GitHub Pages deployment completes successfully
- [ ] Weekly or manual long-run stability workflow succeeds

## Manual browser acceptance checks
- [ ] Open a pre-v1.8 browser world and a previously exported JSON world
- [ ] Export a world, reload it, verify day/year, people, families, buildings, history
- [ ] Let high-speed playback run while zooming and panning; UI remains responsive
- [ ] Follow an agent into and away from a populated town; agent is trackable
- [ ] Inspect indoor workers: sprites may hide, but no simulated activity pauses
- [ ] Change terrain, apply a divine action, or import another world during playback; no late worker reply restores the old world
- [ ] Disable worker support in browser devtools and verify safe main-thread playback
- [ ] Repeatedly pause and resume; no unexplained double ticks or save corruption
- [ ] Keep the performance panel open while scrolling a crowded settlement
- [ ] Reload after an interrupted autosave and verify current or previous valid checkpoint is available
- [ ] Verify Pages loads from `/WorldForge/`, including the favicon and worker asset

## Future changes
Engine schema migrations and physics updates require separate PRs. Changes to building interiors, elevation/pathfinding, new races, traits, and realm simulation must extend the test fixtures without sacrificing camera-independent simulation. For broad redesigns, benchmark and validate a small vertical slice first.

**Status note:** A successful CI run confirms scripted checks, not manual browser checks, target FPS on all hardware, or an absence of future bugs.
