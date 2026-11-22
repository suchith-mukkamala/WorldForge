import {useMemo,useState} from 'react';
import {DEFAULT_SETTINGS,SPECIES,SPECIES_INFO,WORLD_SIZES,
  normalizeSettings,type WorldSettings} from './engine';
import {freshWorldSeed} from './worldSeeds';
import {DEFAULT_WORLD_LAYOUT,landmassCount,WORLD_LAYOUTS,
  WORLD_LAYOUT_NAMES,type WorldLayout} from './worldGeography';
import {TerrainPreview} from './TerrainPreview';
import {DEFAULT_LANDFORMS,LANDFORM_NAMES,
  type LandformProfile} from './regionalGeography';
import {generateWorldLandscape} from './worldLandscape';
import {initialWoodland} from './woodland';
import {generateSkylands} from './skylands';

const PRESETS=[
  {id:'balanced',name:'FOUR KINGDOMS',description:'Every people starts with a foothold',
    starting:{human:26,elf:19,dwarf:16,demon:13}},
  {id:'human',name:'AGE OF HUMANS',description:'Fast colonization and crowded river valleys',
    starting:{human:58,elf:14,dwarf:11,demon:8}},
  {id:'elf',name:'ANCIENT WOODS',description:'Forests flourish while other groups remain small',
    starting:{human:14,elf:45,dwarf:13,demon:8}},
  {id:'border',name:'ASHEN FRONTIER',description:'Stronger pressure from the demonic borderlands',
    starting:{human:18,elf:15,dwarf:17,demon:42}},
] as const;
export function WorldCreator({
  current,onCreate,onReturn,
}:{
  current:WorldSettings;
  onCreate:(settings:WorldSettings)=>void;
  onReturn:()=>void;
}){
  // Entering New World starts with a different seed. Reusing the old one is
  // still an explicit choice for players who want a reproducible landscape.
  const [draft,setDraft]=useState<WorldSettings>(()=>normalizeSettings({
    ...current,seed:freshWorldSeed(current.seed),
    layout:current.layout??DEFAULT_WORLD_LAYOUT,
    livingBiomes:current.livingBiomes??true,
    regionalGeography:true,
    regionalBiomes:current.regionalBiomes??true,
    riverlands:current.riverlands??true,
    landforms:current.landforms??DEFAULT_LANDFORMS,
    terrainCells:current.terrainCells??true,
    worldTree:true,
    volcanicWorld:current.volcanicWorld??true,
    floatingIslands:current.floatingIslands??true,
    climateEcology:current.climateEcology??true,
  }));
  const update=<K extends keyof WorldSettings>(key:K,value:WorldSettings[K])=>
    setDraft(state=>({...state,[key]:value}));
  const total=SPECIES.reduce((sum,s)=>sum+draft.starting[s],0);
  const [width,height]=WORLD_SIZES[draft.size];
  const {seed,layout,livingBiomes,landforms,regionalBiomes,riverlands,floatingIslands,climateEcology,worldTree,volcanicWorld}=draft;
  const map=useMemo(()=>{
    const settings={...DEFAULT_SETTINGS,seed,layout,landforms,regionalGeography:true,regionalBiomes,
      riverlands,floatingIslands,climateEcology,worldTree,volcanicWorld};
    const terrain=generateWorldLandscape(width,height,settings);
    const tiles=terrain.biomes.map(biome=>({biome,food:0}));
    const landscape={width,height,tiles,settings,topography:terrain.topography,worldTree:terrain.worldTree};
    const preview={...landscape,woodland:livingBiomes?initialWoodland(landscape):undefined,
      skylands:floatingIslands?generateSkylands(landscape):undefined};
    return {...terrain,preview,count:landmassCount(width,height,terrain.biomes)};
  },[width,height,seed,layout,livingBiomes,landforms,regionalBiomes,riverlands,floatingIslands,
    climateEcology,worldTree,volcanicWorld]);
  const landmasses=map.count+' landmass'+(map.count===1?'':'es');
  return <main className="evo-creator world-generator">
    <header className="evo-section-header">
      <div>
        <h2>New world</h2>
        <p>Preview the terrain before starting a new simulation.</p>
      </div>
      <button className="evo-quiet-button" onClick={onReturn}>← RETURN TO WORLD</button>
    </header>
    <section className="world-preview-card" aria-label="World preview">
      <figure>
        <TerrainPreview world={map.preview} label={WORLD_LAYOUT_NAMES[map.layout]+' terrain preview'}/>
        <figcaption><strong>{WORLD_LAYOUT_NAMES[map.layout]}</strong>
          <span>{landmasses}{map.preview.skylands?.length?' · '+map.preview.skylands.length+' floating groups':''}
            {' · Seed '+draft.seed}</span></figcaption>
      </figure>
      <div className="world-preview-controls">
        <label htmlFor="world-geography">Geography</label>
        <select id="world-geography" value={draft.layout??'classic'}
          onChange={event=>update('layout',event.target.value as WorldLayout)}>
          {WORLD_LAYOUTS.map(layout=><option key={layout} value={layout}>
            {WORLD_LAYOUT_NAMES[layout]}</option>)}
        </select>
        <label className="world-floating-option">
          <input type="checkbox" checked={!!floatingIslands}
            onChange={event=>update('floatingIslands',event.target.checked)}/>
          Floating islands
        </label>
        <label htmlFor="evo-landforms">Relief</label>
        <select id="evo-landforms" value={landforms??''}
          onChange={e=>update('landforms',(e.target.value||undefined) as LandformProfile|undefined)}>
          {Object.entries(LANDFORM_NAMES).map(([value,name])=>
            <option key={value} value={value}>{name}</option>)}
          <option value="">Classic terrain</option>
        </select>
        <div className="world-preview-actions">
          <button type="button" onClick={()=>update('seed',freshWorldSeed(draft.seed))}>
            Randomize terrain
          </button>
          <button className="evo-primary-button"
            onClick={()=>onCreate(normalizeSettings(draft))}>BEGIN NEW WORLD</button>
        </div>
      </div>
    </section>
    <details className="evo-creator-advanced">
      <summary>⚙ CUSTOMIZE WORLD SETTINGS <span>POPULATION · MAP SIZE · SEED · RESOURCES</span></summary>
    <div className="evo-creator-columns">
      <section className="evo-section-card evo-creator-main">
        <div className="evo-card-heading"><strong>01 / STARTING SCENARIO</strong>
          <span>Presets are editable</span></div>
        <div className="evo-preset-grid">
          {PRESETS.map(p=><button type="button" key={p.id}
            onClick={()=>setDraft(s=>({...s,starting:{...p.starting}}))}>
            <strong>{p.name}</strong><span>{p.description}</span>
          </button>)}
        </div>
        <div className="evo-card-heading"><strong>02 / FOUNDING POPULATIONS</strong>
          <span>{total} individuals</span></div>
        <div className="evo-pop-config">
          {SPECIES.map(species=><div key={species} className="evo-pop-row">
            <div className="evo-pop-species">
              <span className="evo-species-avatar" style={{color:SPECIES_INFO[species].color}}>
                {SPECIES_INFO[species].symbol}
              </span>
              <div><strong>{SPECIES_INFO[species].name}</strong>
                <small>{SPECIES_INFO[species].intro}</small></div>
            </div>
            <input type="range" min="0" max="75" step="1" value={draft.starting[species]}
              aria-label={SPECIES_INFO[species].name+' starting population'}
              onChange={e=>setDraft(s=>({...s,starting:{...s.starting,
                [species]:Number(e.target.value)}}))}/>
            <input type="number" min="0" max="75" value={draft.starting[species]}
              aria-label={SPECIES_INFO[species].name+' exact population'}
              onChange={e=>setDraft(s=>({...s,starting:{...s.starting,
                [species]:Math.max(0,Math.min(75,Number(e.target.value)||0))}}))}/>
          </div>)}
        </div>
      </section>
      <aside className="evo-creator-side">
        <section className="evo-section-card">
          <div className="evo-card-heading"><strong>03 / WORLD CONDITIONS</strong></div>
          <div className="evo-creator-fields">
            <label htmlFor="evo-map-size">MAP SIZE
              <select id="evo-map-size" value={draft.size}
                onChange={e=>update('size',e.target.value as WorldSettings['size'])}>
                <option value="small">Small · 96 × 64</option>
                <option value="medium">Medium · 160 × 104</option>
                <option value="large">Large · 256 × 160</option>
                <option value="vast">Vast · 320 × 208 (slower)</option>
              </select>
            </label>
            <label htmlFor="evo-seed">RANDOM SEED
              <div className="evo-seed-row">
                <input id="evo-seed" type="number" min="1" max="2147483647"
                  value={draft.seed} onChange={e=>update('seed',
                    Math.max(1,Math.min(2147483647,Math.trunc(Number(e.target.value)||1))))}/>
                <button type="button" onClick={()=>update('seed',
                  freshWorldSeed(draft.seed))} title="Generate a different random seed">
                  <span aria-hidden="true">⚄</span> RANDOM
                </button>
                <button type="button" onClick={()=>setDraft(settings=>({...settings,
                  seed:current.seed,size:current.size,layout:current.layout,landforms:current.landforms,
                  regionalBiomes:current.regionalBiomes??false,riverlands:current.riverlands??false,
                  worldTree:current.worldTree??false,floatingIslands:current.floatingIslands??false,
                  climateEcology:current.climateEcology??false,
                  volcanicWorld:current.volcanicWorld??false}))}
                  title="Reuse this world's seed, map size, and geography">↺ REUSE</button>
              </div>
              <small className="evo-seed-hint">A fresh seed is chosen for each new world.
                Reuse or enter a seed to reproduce a familiar map.</small>
            </label>
            <label htmlFor="evo-food">RESOURCE ABUNDANCE <b>{draft.resourceLevel.toFixed(2)}×</b>
              <input id="evo-food" type="range" min=".5" max="1.8" step=".1"
                value={draft.resourceLevel}
                onChange={e=>update('resourceLevel',Number(e.target.value))}/>
            </label>
            <label htmlFor="evo-wander">WANDERING TENDENCY <b>{draft.wandering.toFixed(2)}×</b>
              <input id="evo-wander" type="range" min=".5" max="1.8" step=".1"
                value={draft.wandering}
                onChange={e=>update('wandering',Number(e.target.value))}/>
            </label>
            <label className="evo-hybrid-toggle" htmlFor="evo-interbreeding">
              <input id="evo-interbreeding" type="checkbox"
                checked={draft.interbreeding}
                onChange={e=>update('interbreeding',e.target.checked)}/>
              <span><b>ALLOW CROSS-SPECIES FAMILIES</b>
                <small>Adults from different peoples can bond. Children inherit
                  blended ancestry, genetic traits and lifespan.</small>
              </span>
            </label>
            <label className="evo-hybrid-toggle" htmlFor="evo-regional-biomes">
              <input id="evo-regional-biomes" type="checkbox" checked={draft.regionalBiomes}
                onChange={e=>update('regionalBiomes',e.target.checked)}/>
              <span><b>REGIONAL BIOMES</b>
                <small>Include taiga, wetlands and savanna where the climate suits them.</small>
              </span>
            </label>
            <label className="evo-hybrid-toggle" htmlFor="evo-riverlands">
              <input id="evo-riverlands" type="checkbox" checked={draft.riverlands}
                onChange={e=>update('riverlands',e.target.checked)}/>
              <span><b>RIVERLANDS</b>
                <small>Add glacial lakes, canyons, calderas, barrier islands, and seasonal floods.</small>
              </span>
            </label>
            <label className="evo-hybrid-toggle" htmlFor="evo-volcanic-world">
              <input id="evo-volcanic-world" type="checkbox" checked={!!draft.volcanicWorld}
                onChange={e=>update('volcanicWorld',e.target.checked)}/>
              <span><b>VOLCANOES &amp; UNDERWORLD</b>
                <small>Volcanic island chains grow from lava. Quiet craters open a route below.</small>
              </span>
            </label>
            <label className="evo-hybrid-toggle" htmlFor="evo-climate-ecology">
              <input id="evo-climate-ecology" type="checkbox" checked={!!draft.climateEcology}
                onChange={e=>update('climateEcology',e.target.checked)}/>
              <span><b>CLIMATE, WEATHER & WILDLIFE</b>
                <small>Rain shadows, river marshes and coasts follow the wind.
                  Seasons and herds respond as the years pass.</small>
              </span>
            </label>
            <label className="evo-hybrid-toggle" htmlFor="evo-living-biomes">
              <input id="evo-living-biomes" type="checkbox" checked={draft.livingBiomes}
                onChange={e=>update('livingBiomes',e.target.checked)}/>
              <span><b>LET BIOMES CHANGE OVER TIME</b>
                <small>Forests can spread into grassland or thin into meadows as years pass.</small>
              </span>
            </label>
            <label className="evo-hybrid-toggle" htmlFor="evo-terrain-cells">
              <input id="evo-terrain-cells" type="checkbox" checked={draft.terrainCells}
                onChange={e=>update('terrainCells',e.target.checked)}/>
              <span><b>SIMULATE SMALL TERRAIN CELLS</b>
                <small>Soil, sand and stone shape runoff, erosion and footing.</small>
              </span>
            </label>
          </div>
        </section>
        <section className="evo-section-card evo-genesis-summary">
          <div className="evo-card-heading"><strong>STARTING CONDITIONS</strong></div>
          <div className="evo-genesis-count">{total}<span>founding individuals</span></div>
          <p>New world seed <strong>{draft.seed}</strong> · {draft.size} map ·
            {WORLD_SIZES[draft.size].join(' × ')} tiles ·
            {draft.resourceLevel.toFixed(1)}× resources</p>
          <p>Mixed-species families: <strong>{draft.interbreeding?'ON':'OFF'}</strong></p>
          <p>Elves seek forests, dwarves cluster near caves, humans spread
            around rivers and plains, and demons begin in remote scorched lands.</p>
          <button className="evo-primary-button" onClick={()=>onCreate(normalizeSettings(draft))}>
            ✦ GENERATE THIS WORLD
          </button>
          <small>Creating a new world replaces the active simulation. The app asks
            for confirmation. Export your current world first to preserve it.</small>
        </section>
      </aside>
    </div>
    </details>
  </main>;
}
