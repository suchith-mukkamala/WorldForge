# WorldForge milestone audit (through v1.2)

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

## Honest limits and next work

- The Mind Engine is a deterministic, rules-based decision system, **not** a
  language model generating unscripted dialogue. Agents can choose differently
  based on conditions but do not conduct free-form LLM conversations.
- Survival and long-term coexistence are **not guaranteed** for every seed.
  Geography, scarcity and population dynamics still cause failures.
- Sea voyages require connected navigable water, ports, supplies, people and
  trade needs. Not every generated world will show a completed sea delivery.
- The world has no hard population cap, but free land and device resources are
  practical limits. Larger worlds can become computationally expensive.
- Sprite appearances and directional walking are implemented, but weather,
  day-night cycles, combat animation and a full character avatar editor remain
  future work. Rapid multi-tile travel uses an abbreviated onscreen path, not
  a record of every intermediate tile the agent actually traversed.
- No playable first-person/mortal perspective yet. The current interface is
  god-mode, with mortal exploration remaining a future direction.
- Early accords and voluntary guilds are **not** complete nations, elections,
  formal governments or geopolitical warfare.

The UI's zoom controls only affect rendering and never alter world progression.
