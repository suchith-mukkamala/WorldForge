# Worldforge

**An autonomous fantasy-world simulator.** Watch societies emerge from the decisions of their inhabitants. Influence them as a god today; eventually, step into the world as a person, explore it, and make your own choices.

Worldforge began as Evolution Lab (Lab 04) in [CircuitBuilder](https://github.com/suchith-mukkamala/CircuitBuilder) and became an independent project at the v0.7.1 milestone. It is now developed as a standalone application—not an electronics laboratory.

## What you can do

- Generate deterministic fantasy worlds with humans, elves, dwarves and demons.
- Watch intelligent agents prioritize survival, relationships, careers, travel and settlement development, with distinct personalities and memories.
- Follow childhood experiences, households, ancestry, friendships, apprenticeships and long-running family records.
- Observe villages construct actual buildings, draw on renewable wood and regenerating mineral deposits, and gradually develop infrastructure.
- Follow workers as they choose farming, forestry, mining, construction, crafting and trading. Farm labor generates stored food, workshops turn ore and wood into tools, and supply shortages affect job and building priorities.
- Watch caravans carry goods between land-connected settlements. Goods leave the origin when a merchant departs and reach the destination only when the merchant arrives; inventories, prices and community funds respond to shortages.
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
npm run test:long-simulation
```

The long-run simulation is intentionally more expensive than unit tests. The simulation has no artificial population ceiling, but your hardware and available world tiles still bound what can run efficiently.

## Design principles

1. **World first.** Creatures and civilizations act even when you are not looking at them. Zoom changes presentation, not simulation results.
2. **Mortal agency.** Every person can weigh needs, experiences and social context. Divine whispers may be resisted; direct interventions change reality.
3. **Emergent construction.** Inhabitants decide which buildings to erect and where. The player influences people and conditions, not every building placement.
4. **Consequences over scripts.** Memories, relationships, resources and environmental conditions shape future events without determining anyone's fate in advance.
5. **More than one perspective.** The first interface is a godlike observer and influencer. Future play may include inhabiting a mortal and participating in the same persistent world.

## Project roadmap

- **Current:** v0.8 — Economy, Work & Trade, building on the v0.7.1 living-settlement and renewable-resource systems.
- **Next:** Broader production chains, improved roads and transport technology, economic institutions, diplomacy and deeper autonomous exploration.
- **Future:** Optional mortal perspective with travel, interactions, choices and character progression. No mortal-play mode is implemented yet.

## Architecture

- `src/evolution/engine.ts`: deterministic world simulation and yearly progression.
- `src/evolution/mind.ts` and `development.ts`: goals, reasoning and life experiences.
- `src/evolution/construction.ts` and `resources.ts`: settlement construction, materials and renewable deposits.
- `src/evolution/economy.ts`: annual job allocation, staffed production, markets, shortages and physical merchant shipments.
- `src/evolution/divine.ts`: divine actions and their consequences.
- `src/evolution/storage.ts`: browser persistence and world-file compatibility.
- `src/evolution/WorldforgeApp.tsx`: the current god-perspective UI.

The `evolution` folder retains its historical internal name to keep the existing simulation modules and tests recognizable. It can be renamed in a future dedicated refactor.
