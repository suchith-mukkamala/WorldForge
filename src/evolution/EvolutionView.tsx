import {useState} from 'react';
import {SPECIES,SPECIES_INFO,type Species,type World} from './engine';
import {
  EVOLUTION_TRAITS,TRAIT_LABELS,type EvolutionTrait,type HerdTraitSample,
} from './selection';

const chartWidth=810,chartHeight=270;
const format=(n:number)=>n.toFixed(2);

function seriesPath(points:{x:number;y:number}[]):string{
  let path='',drawing=false;
  for(const point of points){
    if(!Number.isFinite(point.y)){drawing=false;continue;}
    path+=(drawing?'L':'M')+point.x.toFixed(2)+','+point.y.toFixed(2);
    drawing=true;
  }
  return path;
}

/** Charts yearly trait means. Herd series use the same sample shape. */
export function EvolutionView({world}:{world:World}){
  const evolution=world.evolution??{samples:[],shifts:[]};
  const [trait,setTrait]=useState<EvolutionTrait>('cold');
  const [visible,setVisible]=useState<Record<Species,boolean>>({
    human:true,elf:true,dwarf:true,demon:true,
  });
  const history=evolution.samples;
  const plotted=history.flatMap(sample=>SPECIES.filter(species=>visible[species]&&
    sample.species[species].count>0).map(species=>sample.species[species][trait]));
  const low=plotted.length?Math.min(...plotted):.9;
  const high=plotted.length?Math.max(...plotted):1.1;
  const span=Math.max(.08,high-low);
  const minValue=low-(span-(high-low))/2;
  const maxValue=minValue+span;
  const minYear=history[0]?.year??0,maxYear=history.at(-1)?.year??1;
  const yearSpan=Math.max(1,maxYear-minYear);
  const x=(year:number)=>44+(year-minYear)/yearSpan*(chartWidth-60);
  const y=(value:number)=>chartHeight-32-(value-minValue)/span*(chartHeight-63);
  const path=(species:Species)=>seriesPath(history.map(sample=>{
    const row=sample.species[species];
    return {x:x(sample.year),y:row.count>0?y(row[trait]):Number.NaN};
  }));
  const latest=history.at(-1);
  const herds=evolution.herds??[];
  return <main className="evo-history-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / NATURAL SELECTION</span>
        <h2>Evolution of the peoples</h2>
        <p>Heritable traits shift a little each generation as cold, heat, hunger,
          disease and wounds change who lives and who raises children.</p>
      </div>
      <div className="evo-history-summary">
        <span>YEAR <b>{world.year}</b></span>
        <span>SAMPLES <b>{history.length}</b></span>
        <span>SHIFTS <b>{evolution.shifts.length}</b></span>
      </div>
    </header>
    <section className="evo-section-card evo-history-chart-card">
      <div className="evo-card-heading">
        <strong>AVERAGE {TRAIT_LABELS[trait].toUpperCase()}</strong>
        <span>{history.length?minYear+'–'+maxYear:'No years recorded yet'}</span>
      </div>
      <div className="evo-chart-legend" role="group" aria-label="Choose a trait">
        {EVOLUTION_TRAITS.map(item=><button type="button" key={item}
          className={trait===item?'is-on':''} aria-pressed={trait===item}
          onClick={()=>setTrait(item)}>{TRAIT_LABELS[item]}</button>)}
      </div>
      <div className="evo-chart-legend" role="group" aria-label="Toggle species on the graph">
        {SPECIES.map(species=><button type="button" key={species}
          className={visible[species]?'is-on':''} aria-pressed={visible[species]}
          onClick={()=>setVisible(current=>({...current,[species]:!current[species]}))}>
          <span style={{background:SPECIES_INFO[species].color}}/>
          {SPECIES_INFO[species].name}
        </button>)}
      </div>
      <svg className="evo-history-chart" viewBox={'0 0 '+chartWidth+' '+chartHeight}
        role="img" aria-label={'Average '+TRAIT_LABELS[trait]+
          ' for humans, elves, dwarves and demons'}>
        {[0,.5,1].map(frac=><g key={frac}>
          <line x1="44" y1={y(minValue+span*frac)} x2={chartWidth-15}
            y2={y(minValue+span*frac)} stroke="#50617b"
            strokeDasharray={frac===0?undefined:'3 7'} opacity=".5"/>
          <text x="38" y={y(minValue+span*frac)+4} textAnchor="end" fontSize="12"
            fill="#869bb8" fontFamily="monospace">
            {format(minValue+span*frac)}
          </text>
        </g>)}
        {[0,.5,1].map(frac=><text key={frac} x={44+frac*(chartWidth-60)}
          y={chartHeight-10} textAnchor="middle" fill="#839cb7"
          fontFamily="monospace" fontSize="11">
          {Math.round(minYear+frac*yearSpan)}
        </text>)}
        {SPECIES.filter(species=>visible[species]).map(species=><path key={species}
          d={path(species)} fill="none" stroke={SPECIES_INFO[species].color}
          strokeWidth="2.9" strokeLinejoin="round" strokeLinecap="round"/>)}
        <text x={chartWidth-14} y="20" textAnchor="end" fill="#93a7bf"
          fontFamily="monospace" fontSize="10">TRAIT / YEAR</text>
      </svg>
      <div className="evo-evolution-means">
        {SPECIES.map(species=>{
          const row=latest?.species[species];
          return <div key={species}>
            <small style={{color:SPECIES_INFO[species].color}}>
              {SPECIES_INFO[species].name.toUpperCase()}
            </small>
            <strong>{row&&row.count>0?format(row[trait]):'—'}</strong>
            <span>{row&&row.count>0?row.count+' living':'None living'}</span>
          </div>;
        })}
      </div>
      <div className="evo-chart-footnote">
        One sample is kept each year, up to the latest {120}. A missing trait on
        an older life counts as ordinary (1.00). Lines skip years with nobody left.
      </div>
    </section>
    <div className="evo-history-columns">
      <section className="evo-section-card">
        <div className="evo-card-heading">
          <strong>NOTABLE SHIFTS</strong><span>Latest first</span>
        </div>
        <div className="evo-chronicle">
          {evolution.shifts.length?[...evolution.shifts].reverse().map(shift=>
            <article key={shift.year+'-'+shift.species+'-'+shift.trait}
              className="evo-chronicle-entry type-evolution">
              <span>Y{shift.year}</span>
              <div>
                <b>{TRAIT_LABELS[shift.trait].toUpperCase()}</b>
                <p>{shift.message} {format(shift.before)} → {format(shift.after)}.</p>
              </div>
            </article>):
            <p className="evo-muted">No lasting shift has been named yet. A people
              needs about thirty years under the same pressure before the
              chronicle records one.</p>}
        </div>
      </section>
      <HerdTraits samples={herds}/>
    </div>
  </main>;
}

function HerdTraits({samples}:{samples:HerdTraitSample[]}){
  const keys=[...new Set(samples.map(sample=>sample.kind+' · '+sample.trait))];
  const [chosen,setChosen]=useState(keys[0]??'');
  const active=keys.includes(chosen)?chosen:keys[0]??'';
  const series=samples.filter(sample=>sample.kind+' · '+sample.trait===active);
  const minYear=series[0]?.year??0,maxYear=series.at(-1)?.year??1;
  const yearSpan=Math.max(1,maxYear-minYear);
  const values=series.map(sample=>sample.mean);
  const low=values.length?Math.min(...values):0;
  const high=values.length?Math.max(...values):1;
  const span=Math.max(.08,high-low);
  const minValue=low-(span-(high-low))/2;
  const x=(year:number)=>44+(year-minYear)/yearSpan*(chartWidth-60);
  const y=(value:number)=>chartHeight-32-(value-minValue)/span*(chartHeight-63);
  return <section className="evo-section-card">
    <div className="evo-card-heading">
      <strong>HERD TRAITS</strong>
      <span>{samples.length?keys.length+' series':'Waiting on wildlife'}</span>
    </div>
    {samples.length?<>
      <div className="evo-chart-legend" role="group" aria-label="Choose a herd trait">
        {keys.map(key=><button type="button" key={key}
          className={key===active?'is-on':''} aria-pressed={key===active}
          onClick={()=>setChosen(key)}>{key}</button>)}
      </div>
      <svg className="evo-history-chart" viewBox={'0 0 '+chartWidth+' '+chartHeight}
        role="img" aria-label={'Herd trait '+active}>
        <path d={seriesPath(series.map(sample=>({x:x(sample.year),y:y(sample.mean)})))}
          fill="none" stroke="#e0bc8c" strokeWidth="2.9"
          strokeLinejoin="round" strokeLinecap="round"/>
        <text x="38" y={y(minValue)+4} textAnchor="end" fontSize="12"
          fill="#869bb8" fontFamily="monospace">{format(minValue)}</text>
        <text x="38" y={y(minValue+span)+4} textAnchor="end" fontSize="12"
          fill="#869bb8" fontFamily="monospace">{format(minValue+span)}</text>
      </svg>
      <div className="evo-chart-footnote">
        Herd averages are recorded when wildlife carries heritable traits.
        People selection does not invent them.
      </div>
    </>:
      <p className="evo-muted">Herds do not carry heritable traits yet. When
        wildlife genetics records them, their yearly averages will be charted here.</p>}
  </section>;
}
