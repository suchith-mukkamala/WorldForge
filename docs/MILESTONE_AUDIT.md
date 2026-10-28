# WorldForge milestone audit (through v1.5)

WorldForge is a *simulation* rather than a scripted city painter. This audit
distinguishes implemented foundations from aspirational features.

| Release | Implemented and exercised |
| --- | --- |
| v0.2–0.2.1 | Four peoples, inherited genetics, partnerships, mixed-ancestry children, portable worlds and basic history. |
| v0.3 | Repeatable identities, personal chronicles, favorites, renaming and the world codex. |
| v0.4 | Autonomous rule-based intentions, survival choices and movement toward personally selected goals, with memory of experiences. |
| v0.5 | Species-specific life stages, caregivers, adoption, mentorship, childhood circumstances, languages, relationships and changing goals. |
| v0.6 | Divine whispers and agency, blessings, curses, inherited effects, direct intervention and intervention history. |
| v0.7 | Physical settlement land, homes, families, construction stages, labor, material costs, architecture and ruins. |
| v0.8 | Renewable trees and minerals, jobs, goods, farming, workshops, shortages and physical merchant deliveries. No artificial 850-person cap. |
| v0.9 | Settlement specialties, roads, bridges, marketplaces, delivery-based trust and economic routes. |
| v1.0 | Navigable connected-water voyages with provisions and cargo; voluntary guilds and apprenticeships; trade, aid and embargo accords. |
| v1.1 | Deterministic detailed pixel people, consistent portraits, textured world map, distinct structures and visible residents in local settlements. |
| v1.2 | Four-direction sprites, two-frame walking motion between yearly positions and an optional camera following a living individual. |
| v1.2.1 | Saved 365-day calendar, day/week/month/year playback and stepping, monthly pursuit of existing travel goals, physically bounded multi-person settlement tiles, map-size-scaled settlement count and demographic seed-sweep tooling. Annual reproduction, aging and economy are unchanged in frequency. |
| v1.3 | Nine learnable knowledge domains tied to lived practice, work and environment; nearby cross-cultural mentorship, persistent lineage learning records, written archives, seeded ancient temples/vaults with injuries or rare breakthroughs, a Knowledge Codex, and inherited demon physical strength/speed that actually influence travel, health, extraction, crafting and construction. |
| v1.4 | Seeded libraries, crypts, temples and ruins; true collapsed towns with archived lost knowledge; curiosity/risk-aware site selection and provisioning; persistent trips, hazards, recoverable relics, exceptional multi-subject learning, and an expedition chronicle. Distinct site pixel art, traveler gear and a focused simplified navigation/journal. |
| v1.5 | Religions emerge from individuals' lived experiences; voluntary contact- and language-based faith adoption, doubt and dissent. Local residents select governments and leaders through value-informed votes; civic priorities draw on real funds and food or develop skills and values. Legitimacy, unrest, re-elections, reforms and persistent culture histories appear in a new archive and person/town views. |

## Validation

- v1.0: GitHub Actions and all 126 local tests passed; additional 3,000-year
  archival and 250-year uncapped population checks passed, with all four
  peoples present at year 250.
- A 240-year regression caught a ship-landing issue where a merchant could
  swap a pedestrian into water. v1.0 prevents that swap and tests it.
- v1.1: Unit tests exercise species- and experience-specific sprite identity,
  consistent portraits and world-state purity.
- v1.2: Motion and camera calculations are separately tested for direction,
  footfall timing, clamping and non-mutation. The renderer interpolates
  observed yearly positions; no new simulation state is introduced.
- v1.2.1: Focused tests cover daily calendar rollover, annual life boundaries,
  save/restore compatibility, deterministic outcomes across playback chunk sizes,
  household-capacity boundaries, and ordered IndexedDB writes. Population
  survival has a repeatable 12-seed sweep in `npm run test:population-sweep`
  (120 years by default, with a longer horizon accepted as an argument).
- v1.3: Knowledge tests verify first discovery, mentorship with provenance, durable
  lineage knowledge, rescue of old saves without knowledge fields, seeded ancient
  site generation, dangerous once-per-person visits and mixed-ancestry physical
  strengths. Specialized labor connects education to tangible world output.
- v1.4: Expedition tests exercise seed-independent site generation, autonomous
  destination choice, preparation, factual collapsed-town ruins, artifacts,
  individual knowledge changes and serialized outcomes. New journal records
  stay independent of zoom, while old worlds without the new fields still load.
- v1.5: Cultural tests verify unassigned founding beliefs, individual faith
  founders, voluntary adoption and resistance, cross-species communication,
  locally chosen governments, real funded policy effects, deep-cloned world
  transitions, save compatibility and observable histories.

## Honest limits and next work

- The Mind Engine is a deterministic, rules-based decision system, **not** a
  language model generating unscripted dialogue. Agents can choose differently
  based on conditions but do not conduct free-form LLM conversations.
- Survival and long-term coexistence are **not guaranteed** for every seed.
  Geography, scarcity and population dynamics still cause failures. A 12-seed
  120-year baseline found no human or demon extinctions; longer horizons are
  essential before treating lower fertility as a fix.
- Sea voyages require connected navigable water, ports, supplies, people and
  trade needs. Not every generated world will show a completed sea delivery.
- The world has no hard population cap, but developed settlement tiles have
  bounded occupancy based on communal space, wilderness tiles remain
  single-occupancy, and device resources are practical limits. Settlements are
  bounded by a map-area safety limit rather than the former fixed 54.
- The daily calendar allows weeks and months to pass slowly, with real local
  movement on month boundaries. Aging, births, resources and the economy still
  update annually. **Full day-by-day needs, work schedules, and conversations
  remain future Mind Engine / Daily Life milestones.**
- Sprite appearances and directional walking are implemented, but weather,
  day-night cycles, combat animation and a full character avatar editor remain
  future work. Rapid multi-tile travel uses an abbreviated onscreen path, not
  a record of every intermediate tile the agent actually traversed.
- No playable first-person/mortal perspective yet. The current interface is
  god-mode, with mortal exploration remaining a future direction.
- Early accords and voluntary guilds are **not** complete nations, elections,
  complete nations or geopolitical warfare. v1.5 adds elections and settlement-
  level governments, but **not** unified nation states, enforceable criminal
  codes, militaries or procedural religious texts. These remain future work.
- Animals and husbandry remain deliberately deferred until animals exist in
  the simulation; no imaginary animal products are generated by v1.3.
- Written records require a living literate community and completed communal
  hall to create. Archives can survive their founders, but oral knowledge without
  teachers can be lost. Excavations can seriously wound explorers, with death
  usually resolved by the subsequent annual health and survival tick.
- Expedition sites are pixel-map landmarks and simulated encounters, **not**
  navigable interiors or tactical dungeon combat. A person plans independently
  from nearby sites and known routes; no global pathfinding or organized multi-
  person expedition parties are modeled yet. Lost-town archives reflect actual
  pre-collapse records, whereas primordial sites are seed-generated mysteries.

The UI's zoom controls only affect rendering and never alter world progression.
