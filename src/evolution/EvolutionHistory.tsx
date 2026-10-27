import {useState} from 'react';
import {PopulationDiagnostics} from './PopulationDiagnostics';
import {SPECIES,SPECIES_INFO,type Sample,type Species,type World} from './engine';

const chartWidth=810,chartHeight=270;
const format=(n:number)=>n.toLocaleString('en-US');
/** Population history derives from actual simulation state. */
export function EvolutionHistory({world}:{world:World}){
  const [visible,setVisible]=useState<Record<Species,boolean>>({
    human:true,elf:true,dwarf:true,demon:true,
  });
  const history=world.history;
  const ymax=Math.max(5,...history.map(h=>Math.max(h.human,h.elf,h.dwarf,h.demon)));
  const minYear=history[0]?.year??0,maxYear=history.at(-1)?.year??1;
  const span=Math.max(1,maxYear-minYear);
  const x=(year:number)=>44+(year-minYear)/span*(chartWidth-60);
  const y=(count:number)=>chartHeight-32-count/ymax*(chartHeight-63);
  const path=(kind:Species)=>history.map((p,i)=>
    (i?'L':'M')+x(p.year).toFixed(2)+','+y(p[kind]).toFixed(2)).join(' ');
  const most=world.settlements.slice().sort((a,b)=>b.population-a.population);
  const recent=world.events.slice().reverse();
  const summary=world.history.at(-1)??({total:0,births:0,deaths:0} as Sample);
  return <main className="evo-history-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / WORLD RECORD</span>
        <h2>History of a living world</h2>
        <p>Population trends, changing settlements, and events produced by the simulation.</p>
      </div>
      <div className="evo-history-summary">
        <span>YEAR <b>{world.year}</b></span>
        <span>POPULATION <b>{format(summary.total)}</b></span>
        <span>SETTLEMENTS <b>{world.settlements.length}</b></span>
      </div>
    </header>
    <section className="evo-section-card evo-history-chart-card">
      <div className="evo-card-heading">
        <strong>POPULATION THROUGH TIME</strong>
        <span>{history.length} recorded years · {minYear}–{maxYear}</span>
      </div>
      <div className="evo-chart-legend" role="group" aria-label="Toggle species on the graph">
        {SPECIES.map(s=><button type="button" key={s}
          className={visible[s]?'is-on':''}
          aria-pressed={visible[s]} onClick={()=>setVisible(v=>({...v,[s]:!v[s]}))}>
          <span style={{background:SPECIES_INFO[s].color}}/>
          {SPECIES_INFO[s].name}
        </button>)}
      </div>
      <svg className="evo-history-chart" viewBox={'0 0 '+chartWidth+' '+chartHeight}
        role="img" aria-label="Population history graph for humans, elves, dwarves and demons">
        {[0,.25,.5,.75,1].map(frac=><g key={frac}>
          <line x1="44" y1={y(ymax*frac)} x2={chartWidth-15} y2={y(ymax*frac)}
            stroke="#50617b" strokeDasharray={frac===0?undefined:"3 7"} opacity=".5"/>
          <text x="35" y={y(ymax*frac)+4} textAnchor="end" fontSize="12"
            fill="#869bb8" fontFamily="monospace">{Math.round(ymax*frac)}</text>
        </g>)}
        {[0,.25,.5,.75,1].map(frac=><text key={frac}
          x={44+frac*(chartWidth-60)} y={chartHeight-10} textAnchor="middle"
          fill="#839cb7" fontFamily="monospace" fontSize="11">
          {Math.round(minYear+frac*span)}
        </text>)}
        {SPECIES.filter(s=>visible[s]).map(s=><g key={s}>
          <path d={path(s)} fill="none" stroke={SPECIES_INFO[s].color}
            strokeWidth="2.9" strokeLinejoin="round" strokeLinecap="round"/>
          {history.length>0&&<circle
            cx={x(history.at(-1)!.year)} cy={y(history.at(-1)![s])} r="5"
            fill={SPECIES_INFO[s].color} stroke="#10192c" strokeWidth="2"/>}
        </g>)}
        <text x={chartWidth-14} y="20" textAnchor="end" fill="#93a7bf"
          fontFamily="monospace" fontSize="10">POPULATION / YEAR</text>
      </svg>
      <div className="evo-chart-footnote">
        Population is tracked every simulated year, with the last 400 samples retained.
        Species survival depends on resources, reproduction, aging, and local biomes.
      </div>
    </section>
    <PopulationDiagnostics world={world}/>
    <div className="evo-history-columns">
      <section className="evo-section-card">
        <div className="evo-card-heading">
          <strong>WORLD CHRONICLE</strong><span>Latest first</span>
        </div>
        <div className="evo-chronicle">
          {recent.length?recent.map(e=><article key={e.id}
            className={'evo-chronicle-entry type-'+e.type}>
            <span>Y{e.year}</span><div><b>{e.type.toUpperCase()}</b><p>{e.message}</p></div>
          </article>):<p className="evo-muted">Events will appear as your world evolves.</p>}
        </div>
      </section>
      <section className="evo-section-card">
        <div className="evo-card-heading">
          <strong>SETTLEMENT REGISTER</strong><span>{most.length} active</span>
        </div>
        {most.length?<div className="evo-settlement-list">
          {most.map(s=><article key={s.id}>
            <div className="evo-settlement-mark"
              style={{color:SPECIES_INFO[s.species].color}}>⌂</div>
            <div><strong>{s.name}</strong><small>{SPECIES_INFO[s.species].name} ·
              Founded Y{s.founded}</small></div>
            <div className="evo-settlement-pop">{s.population}<small>nearby</small></div>
          </article>)}
        </div>:<div className="evo-empty-panel">
          <strong>NO SETTLEMENTS YET</strong>
          <p>When four or more adults of a species gather in a suitable biome,
            they may establish a settlement. Unpopulated settlements can collapse.</p>
        </div>}
        <div className="evo-history-totals">
          <div><small>TOTAL BIRTHS</small><strong>{format(world.totalBirths)}</strong></div>
          <div><small>TOTAL DEATHS</small><strong>{format(world.totalDeaths)}</strong></div>
        </div>
        <div className="evo-chart-footnote">Population counts represent individuals.
          Settlements track nearby residents of any species. Warfare, disasters,
          politics, and disasters arrive in later releases. Partnerships are simulated.</div>
      </section>
    </div>
  </main>;
}
