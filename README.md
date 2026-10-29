# WorldForge

**An autonomous fantasy-world simulator.** Watch societies emerge from the decisions of their inhabitants. Influence them as a god today; eventually, step into the world as a person, explore it, and make your own choices.

Worldforge began as Evolution Lab (Lab 04) in [CircuitBuilder](https://github.com/suchith-mukkamala/CircuitBuilder) and became an independent project at the v0.7.1 milestone. It is now developed as a standalone application—not an electronics laboratory.

## What you can do

- Generate deterministic fantasy worlds with humans, elves, dwarves and demons.
- See **Natural Awakenings (v2.1.3)**: an innate gift may awaken at a real annual life milestone, with human, elf, dwarf, demon and mixed-ancestry windows scaled to biological maturity and effective lifespan. Roughly one in five individuals has no scheduled natural awakening, regardless of potential rank. Awakening is recorded in the personal chronology and lineage archive and preserved through resurrection. The People directory can filter dormant and awakened lives, sort by awakening date, and visualize progress through an age window. Portraits gain domain-colored glows, while 2D and raised 2.5D sprites gain tiny pixel motes at close zoom. These visual effects change no terrain, ecology or simulation behavior; trait power bonuses still wait for v2.1.5.
- Meet **48 Innate Gifts (v2.1.2)** across eight families: Body, Senses, Mind, Nature, Craft, Social, Spirit and Survival. Every founder and newborn has exactly one stable gift from birth, preserved in the family archive and through resurrection. The People directory shows each gift and can search by gift name or filter by family. Genetics gently influence possible families without forbidding a gift to any species. Older worlds gain deterministic gifts when loaded. Their names and affinities are visible; natural awakening was added in v2.1.3, while active magical/stat effects are still planned for v2.1.5.
- Discover **Innate Potential Ranks (v2.1.1)** in the People directory, individual inspector and family records. Each birth receives a stable rank from F through SSS, including S+ and SS+, with rare high-ranked potential. Filter the roster by minimum potential rank to discover exceptional people. A separate training grade reports what an individual has actually practiced so far. F-rank ability is not worthless; high potential is not automatic mastery. Existing worlds receive a deterministic compatible fallback without rerolling simulation randomness. Age-based awakening and active effects are upcoming patches.
- Switch instantly between the original **top-down 2D** map and a raised **pixel-art 2.5D** landscape. Hills, cliffs, towns and people share the same heightfield and stay selectable in either view, with no graphics-card-heavy 3D engine.
- Use the **Orbit Camera (v2.07)** in the raised view: turn through all 360° in 15° steps (or use the quick 45° buttons), tilt toward the horizon at 18°, use classic 30° or look down from 55°, and reset instantly. All land tiles, real cliffs, trees, people, structures, rivers, outlines and click-to-inspect geometry rotate as one scene. Height and orbit settings stay purely visual, with no impact on physics or saves.
- See **Relief & Scale (v2.06)** in the raised view: adjust **HEIGHT** between natural, dramatic (default) and monumental elevation exaggeration. Layered rock faces, a visible landmass edge, stronger sunlit slopes, ridge contours and irregular vegetation make peaks and valleys read as *height*, not just differently colored texture. People are now one pixel wide and four pixels tall in the raised landscape; overhead-map figures are also much smaller, dwarfed by trees and growing homes. Relief changes only the picture—not the world, physics, saves, or pathfinding.
- Watch **Human-Scale Worlds (v2.05)**: individual mortals move through continuous sub-tile visual positions instead of a few crowded marker slots; a person has roughly one visual footprint unit, a tree two and a building four. The raised map shows *each real building*, not just a generic settlement icon. As settlements grow, builders can spend real wood, clay, stone and effort to evolve stick huts into timber huts, stone dwellings and developed homes. Older saves continue to load with their buildings and histories intact.
- Experience **Physical Geography (v2.0)**: uphill travel takes more effort and influences route choice, rugged sites discourage building, and elevation, slopes and creeks affect farm yields. Previously saved worlds keep their original rules unless you explicitly enable the new terrain physics in the map panel. Waterway shipping still requires actual water tiles.
- Watch intelligent agents prioritize survival, relationships, careers, travel and settlement development, with distinct personalities and memories.
- Follow childhood experiences, households, ancestry, friendships, apprenticeships and long-running family records.
- Observe villages construct actual buildings, draw on renewable wood and regenerating mineral deposits, and gradually develop infrastructure.
- Follow workers as they choose farming, forestry, mining, construction, crafting and trading. Farm labor generates stored food, workshops turn ore and wood into tools, and supply shortages affect job and building priorities.
- Watch caravans carry goods between land-connected settlements. Goods leave the origin when a merchant departs and reach the destination only when the merchant arrives; inventories, prices and community funds respond to shortages.
- Watch communities invest their own wood, stone, labor and treasury in paved roads or bridges over narrow water channels. Well-maintained road segments let merchants move faster without teleporting their cargo.
- Follow settlements specializing in agriculture, forestry, mining, industry or commerce based on resources, existing buildings and local work. Warehouses expand food storage and marketplaces attract traders.
- Observe trade relations forming through delivered shipments: successful exchanges develop trusted partnerships and favorable prices; failed journeys erode trust and can temporarily interrupt trade.
- See coastal communities build boats from real supplies and sail connected waterways. Captains carry provisions, physically cross water, and deliver goods only after disembarking.
- Follow voluntary worker guilds that elect leaders, train members, maintain treasuries, and advocate for local construction.
- Watch communities negotiate trade accords and mutual-aid pacts from past cooperation and residents' social preferences, or impose embargoes after disputes. Emergency food aid still travels as real shipments.
- Zoom into the pixel-art landscape to see individualized mortal sprites: species silhouettes, apparent age, outfits, work gear and inherited visual accents. The same appearance is shown in the person inspector, family archive, People directory and town close-ups.
- Watch animated walkers face north, south, east or west and alternate their stride between actual changes in position. Choose a person and press **FOLLOW** to track their travels with a camera that moves with them; **TRACKING** turns it off.
- Set the world clock to days, weeks, months, seasons or years. The calendar records real dates; daily planners carry out personal actions and real tile-by-tile movement (v1.7), weekly boundaries renew routines and conversations (v1.6), and unplanned travelers can still follow annual goals on month boundaries. Aging, births, bulk work output and economic accounting remain annual.
- Explore the **Age of Knowledge (v1.3)**: agriculture, herbalism, stonecraft, navigation, irrigation, metallurgy, engineering, medicine and writing are specific discoveries, not a global technology tree. People experiment based on their occupations and surroundings, teach nearby friends and family, and may preserve discoveries in communal written archives. Acquired knowledge is tracked on individual profiles and retained in their life records after death; newborns do not inherit it automatically.
- Discover procedurally placed temples, libraries, crypts, vaults and ancient ruins. Curious people independently weigh risk and potential knowledge, pack provisions, follow a chosen site, survive traps or mortal injuries, and sometimes recover a unique artifact that improves their capabilities. Every voyage and outcome is recorded in the **Expeditions & Knowledge** journal; a surviving traveler brings their ideas back to ordinary teaching and settlement archives. Real fallen settlements become named archaeological sites with their historic culture and any knowledge archived before collapse.
- Identify each site by its distinct pixel-art silhouette, spot equipped explorers and artifact holders, and navigate a streamlined WorldForge with a focused journal and secondary pages organized under **More Pages**.
- Follow **Beliefs & Government (v1.5)**: people may found religions from their own life experiences, teach beliefs through actual contact and shared language, question or leave a tradition, or choose no faith at all. Religions have founders, priorities and varying tolerance; no species is assigned a predetermined faith.
- Watch residents establish assemblies, councils, circles of elders or local chiefdoms based on their values. They elect leaders, disagree, and periodically reform their leadership and policies. Community funds and provisions support mutual aid, public learning, traditions or personal autonomy. Inspect legitimacy, dissent, active faiths, government decisions and historical records in the new **Beliefs & Government** archive or in individual settlement and person views.
- Follow **Living Days & Social Choices (v1.6)**: every week, individuals weigh fatigue, hunger, curiosity, companionship, family duties and their chosen jobs before resting, studying, caring, traveling, crafting, working, foraging or reflecting. Nearby people may actually meet, share lessons, become friends or disagree; willingness and language matter. Inspect each person's current routine, morale, fatigue, social needs and a bounded encounter journal in **People**. Time speed never changes the resulting choices, and weekly shifts do not duplicate annual economic production.
- Explore **Settlement Terrain Relief (v1.9.2)**: the existing settlement close-up now shares the world elevation field, with lightweight lighting for steep slopes, high-altitude snow patches, and per-tile height tooltips. This is a graphical refinement, not a new simulation rule.
- Explore **Rivers & Drainage (v1.9.3)**: the existing heightfield drives deterministic runoff paths, connected catchments, creeks and tributaries that flow toward existing water bodies or the edge of the world. The **Watersheds & rivers** map layer colors drainage basins, highlights potential low-lying ponding and traces waterways; select a tile to inspect its catchment and outlet. Small waterways appear on the biome map and settlement close-ups. The v1.9.3 data was originally visual-only; starting with v2.0 physical terrain, creek-bearing farmland gains an irrigation bonus. Streams never turn tiles into navigable water.
- Explore **Living Terrain Details (v1.9.4)**: hand-pixelled oak groves, highland pines, ferns, wildflowers, reeds, boulders, scree, snow-covered crags, crystals, basalt and shoreline ripples now vary by location, biome and altitude. The overworld and settlement close-ups share deterministic motif choices, with greater sprite detail at neighborhood scale. These are decorative textures, **not** new harvestable deposits, roads, obstacles or ecological rules. Existing worlds and save files remain unchanged.
- Explore **Terrain Polish & Performance (v1.9.5)**: every detailed overworld motif is now painted from a tiny reusable atlas with exactly the same pixels, instead of repeating many drawing calls on every scenery refresh. Zoom steps reuse the existing terrain background until deposits or buildings actually need a different render. Clear, compact legends explain biome textures, food, deposits, elevation contours and drainage; settlement scenery gains subtle grounding shadows. No saved data, terrain physics or autonomous decisions change.
- Explore **Terrain Foundations (v1.9.1)**: every new world stores seeded elevation independently of the simulation RNG. Existing worlds retain save compatibility and acquire deterministic heights. See relief shading, snowcaps, shoreline accents, an elevation-and-contours map layer, and altitude readouts; terrain brush edits refresh geography. The elevation model now also powers v2.0 movement, farming, construction and the new perspective.
- Explore **Stability & Performance (v1.8)**: background Web Worker playback with single-flight ordering and safe synchronous fallback, opt-in performance diagnostics, camera-based crowd rendering, approximate indoor visibility, more efficient scenery caching, checksummed versioned saves, backup recovery and stronger release tests. Simulation continues independently of the camera. See [architecture contracts](docs/ARCHITECTURE.md) and the [release acceptance checklist](docs/RELEASE_CHECKLIST.md).\n- Explore **Mind Engine II & Daily Life (v1.7)**: people may hold multiple future plans with several dependent steps, or prefer having no agenda. Real hunger, exhaustion, lost relationships, changed priorities and blocked routes can interrupt plans without erasing their history. Daily actions practice skills, care for dependents, forage from actual tile supplies and travel through safe adjacent cells. The **Life Viewer** in People reveals emotions, plans, motives, progress, interruptions, alternatives considered and remembered outcomes. Conversations now distinguish comfort, debate, shared ambitions, mentorship and reconciliation, with consequences for trust and familiarity. Animated sprites have four walking poses and situation-aware idle/work/study/conversation poses, and the map can trace traveled footprints and planned routes.
- See much stronger and faster **demons**: their inherited physical strength and speed improve actual resource extraction, construction, artisan production, physical recovery and travel frequency. Mixed-ancestry descendants inherit proportional physical abilities. This is a species trait buff; the v1.3 update does not change biome fertility or regrowth.
- Observe natural crowding in settlements: neighborhoods can host bounded groups of inhabitants while wilderness remains more sparsely occupied. More spacious maps support more settlements without the former fixed 54-town limit. Physical crowding is independent of housing quality and household shelter needs.
- Explore textured forests, mountains, waterways, ore deposits and roads, with distinctive building sprites that reveal construction progress, completed homes, docks and ruins.
- Inspect world history, species populations, settlements and individuals as the simulation advances independently of camera zoom.
- Intervene with blessings, curses, divine whispers, direct changes and other godlike abilities while people retain agency over suggestions.
- Save automatically in the browser, or export and import a world as JSON.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Verify

```bash
npm run build
npm test
npm run test:release-smoke
npm run test:long-simulation
npm run test:population-sweep
npm run test:daily-life-sweep -- 40
# Longer optional demographic survey (12 seeds × 250 years):
npm run test:population-sweep -- 250
npm run test:expedition-benchmark -- 31 240
```

The long-run simulation is intentionally more expensive than unit tests. The simulation has no artificial population ceiling, but your hardware and available world tiles still bound what can run efficiently.

## Design principles

1. **World first.** Creatures and civilizations act even when you are not looking at them. Zoom changes presentation, not simulation results.
2. **Mortal agency.** Every person can weigh needs, experiences and social context. Divine whispers may be resisted; direct interventions change reality.
3. **Emergent construction.** Inhabitants decide which buildings to erect and where. The player influences people and conditions, not every building placement.
4. **Consequences over scripts.** Memories, relationships, resources and environmental conditions shape future events without determining anyone's fate in advance.
5. **More than one perspective.** The first interface is a godlike observer and influencer. Future play may include inhabiting a mortal and participating in the same persistent world.

## Project roadmap

- **Current:** v2.1.3 — Age-Based Awakening and Character Polish. One birth gift per person, eleven potential ranks, species-scaled natural awakening windows, persistent life milestones, awakening filters and new subtle sprite/portrait effects. Existing saves and v2.07 orbitable maps remain compatible; waking a gift still grants no active power. GitHub Pages publishes compiled Vite output under `/WorldForge/`.
- **Next:** v2.1.4 inherited affinities and compatibility, then v2.1.5 trait effects integrated into the Mind Engine. After that, v2.2 lifetime training and v2.3 legendary awakenings.
- **Future visual direction:** Continue developing the Pokémon Black & White–inspired pixel-art perspective into a richer layered environment with camera movement and animated exploration. Later, optional mortal descent, procedurally generated planets, separate realms and interplanetary travel. The current 2.5D view is a lightweight isometric renderer, **not** free-camera 3D or mortal-play mode.

## Architecture

- `src/evolution/engine.ts`: deterministic world simulation and yearly progression.
- `src/evolution/mind.ts` and `development.ts`: goals, reasoning and life experiences.
- `src/evolution/mindII.ts` and `LifeViewer.tsx`: inspectable reasons and competing priorities, optional multi-step personal agendas, interrupted plans, emotional needs, physically traversed routes, daily activity and a close-up personal viewer.
- `src/evolution/construction.ts` and `resources.ts`: settlement construction, materials and renewable deposits.
- `src/evolution/economy.ts`: annual job allocation, staffed production, markets, shortages and physical merchant shipments.
- `src/evolution/transport.ts`: settlement-funded roads and bridges, route planning, physical travel advantages and upkeep.
- `src/evolution/shipping.ts`: connected-water shipping routes, embarkation, landings and sailor rescue.
- `src/evolution/institutions.ts`: voluntary guild formation, worker training, treasury decisions and diplomatic accords.
- `src/evolution/culture.ts` and `CultureCodex.tsx`: life-influenced religious foundations, personal faith choices, local transmission, elected governments, civic policies, dissent and cultural chronology.
- `src/evolution/pixelArt.ts` and `PixelPortrait.tsx`: deterministic 16×22 character designs, landscape and structure art, and matching full-size portraits. Zoom never mutates the simulation.
- `src/evolution/motion.ts`: visual-only directional movement, timed interpolation and camera centering. These animations and view positions are not saved into the world or used for agent decisions.
- `src/evolution/calendar.ts` and `dailyLife.ts`: canonical day/week/month/year stepping; daily plan execution, bounded weekly schedules and voluntary contextual conversations, monthly movement for non-planners, annual biology and economic production. Playback increments cross the same ordered boundaries.
- `src/evolution/knowledge.ts` and `KnowledgeCodex.tsx`: seeded sites, inherited ruins, individual knowledge and lineage histories, perilous expeditions, artifacts, expedition logs, interpersonal teaching and written archives. `mind.ts` handles independent expedition choices and preparation.
- `src/evolution/density.ts`: deterministic physical capacity for settlement neighborhoods and resident indexes; population scales with developed habitat instead of requiring every person to have a separate tile.
- `src/evolution/divine.ts`: divine actions and their consequences.
- `src/evolution/storage.ts`: versioned checksummed browser snapshots, recovery and older-world compatibility.
- `src/evolution/topography.ts`: deterministic, validated heightfields stored in new worlds and regenerated lazily for older saves; the same data drives both map views and opt-in terrain physics.
- `src/evolution/terrainPhysics.ts`: versioned terrain rules, elevation-weighted travel costs, farming yields and building-site suitability; older saves start with legacy rules and offer explicit opt-in.
- `src/evolution/DepthCanvas.tsx` and `depthProjection.ts`: selectable 2.5D isometric pixel rendering with true elevation offsets, cliff faces and hidden color-coded tile picking; the underlying world is unchanged.
- `src/evolution/spatialDetails.ts` and `depthSprites.ts`: reproducible fractional visual positions and unequal object footprints shared with 2D/2.5D drawing. `construction.ts` owns four persistent building tiers, real upgrades and their material costs; views cannot create upgrades by themselves.
- `src/evolution/simulation.worker.ts` and `simulationProtocol.ts`: one-flight background calendar ticks with revision guards; the UI can fall back to the exact same engine.
- `src/evolution/populationVisibility.ts`: stable display-only crowd sampling and indoor visibility hints; physical interior simulation is future work.
- `src/evolution/releaseSmoke.ts`: deterministic release gating for world boundaries, camera independence and saved-world integrity.
- `src/evolution/populationSweep.ts`: multi-seed long-horizon demographic diagnostics to detect systematic species collapse.
- `src/evolution/WorldforgeApp.tsx`: the current god-perspective UI.

The `evolution` folder retains its historical internal name to keep the existing simulation modules and tests recognizable. It can be renamed in a future dedicated refactor.

### v2.1.5 — Active Traits & Scenic Atmosphere

Awakened innate gifts now cause modest, deterministic effects on actual travel,
foraging, recovery, practice, relationships and Mind Engine priorities. Each of
the 48 catalog gifts has an effect specialty, scaled by its persistent
potential rank and relevant trained skills. Dormant gifts have no active
benefits; safety and individual agency still outweigh soft trait priorities.

The overhead and raised 2.5D maps feature enhanced pixel terrain, brighter
roof and vegetation details, layered seasonal lighting, dappled cloud shadows,
and calendar-based particles. Seasonal visuals are decorative: they do not
create simulated weather or modify ecology, RNG state or world saves.
