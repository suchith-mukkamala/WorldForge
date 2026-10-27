import {useState} from 'react';
import {SPECIES,SPECIES_INFO,WORLD_SIZES,
  normalizeSettings,type WorldSettings} from './engine';

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
  const [draft,setDraft]=useState<WorldSettings>(()=>normalizeSettings(current));
  const update=<K extends keyof WorldSettings>(key:K,value:WorldSettings[K])=>
    setDraft(state=>({...state,[key]:value}));
  const total=SPECIES.reduce((sum,s)=>sum+draft.starting[s],0);
  return <main className="evo-creator">
    <header className="evo-section-header">
      <div>
        <span className="evo-overline">WORLDFORGE / GENESIS</span>
        <h2>World Creator</h2>
        <p>Set the opening conditions, then let the world write its own history.</p>
      </div>
      <button className="evo-quiet-button" onClick={onReturn}>← RETURN TO WORLD</button>
    </header>
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
                <button type="button" onClick={()=>update('seed',Math.floor(
                  Math.random()*2147483646)+1)} title="Generate a new random seed">
                  <span aria-hidden="true">⚄</span> RANDOM
                </button>
              </div>
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
          </div>
        </section>
        <section className="evo-section-card evo-genesis-summary">
          <div className="evo-card-heading"><strong>WORLD PREVIEW</strong></div>
          <div className="evo-genesis-count">{total}<span>founding individuals</span></div>
          <p>Seed <strong>{draft.seed}</strong> · {draft.size} map ·
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
    <div className="evo-future-note">
      <strong>COMING LATER</strong>
      <span>Partnerships, hybrids and family archives are here. Coming later:
        settlements at war, natural disasters, separate realms, and learning agents.</span>
    </div>
  </main>;
}
