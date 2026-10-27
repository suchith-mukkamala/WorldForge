import {useMemo} from 'react';
import {traitProfile} from './family';
import {
  DEATH_CAUSES,DEATH_LABELS,SPECIES,SPECIES_INFO,
  type Species,type World,
} from './engine';

const fmt=(n:number)=>n.toLocaleString('en-US');
const label=(n:number)=>n===1?'year':'years';
function status(count:number,baseline:number){
  if(count===0)return 'EXTINCT';
  if(count<5)return 'CRITICAL';
  if(baseline===0)return 'NEW POPULATION';
  const change=(count-baseline)/Math.max(1,baseline);
  if(change>.1)return 'GROWING';
  if(change<-.1)return 'DECLINING';
  return 'STABLE';
}
/**
 * Observational diagnostics only: never extrapolate a cause for a historical
 * death when a v0.2 save predates mortality tracking.
 */
export function PopulationDiagnostics({world}:{world:World}){
  const populations=useMemo(()=>SPECIES.map(species=>{
    const individuals=world.agents.filter(a=>a.species===species);
    const children=individuals.filter(a=>a.age<traitProfile(a.ancestry).maturity);
    const elders=individuals.filter(a=>
      a.age>=traitProfile(a.ancestry).lifespan*.76);
    const ledger=world.demography?.bySpecies[species];
    const start=Math.max(0,world.history.length-26);
    const earlier=world.history[start];
    return {species,individuals,children,elders,ledger,
      status:status(individuals.length,earlier?.[species]??individuals.length)};
  }),[world]);
  const last=world.history.at(-1);
  const recorded=world.demography;
  const totalDeaths=populations.reduce((n,p)=>n+(p.ledger?.deaths??0),0);
  const causes=Object.fromEntries(DEATH_CAUSES.map(c=>[c,
    populations.reduce((n,p)=>n+(p.ledger?.causes[c]??0),0)])) as Record<(typeof DEATH_CAUSES)[number],number>;
  const reportedYears=world.year-(recorded?.sinceYear??world.year);
  return <section className="evo-section-card evo-pop-diagnostics"
    aria-label="Population and mortality diagnostics">
    <div className="evo-card-heading">
      <strong>◈ POPULATION HEALTH / CAUSES OF DEATH</strong>
      <span>{recorded?'TRACKED SINCE Y'+recorded.sinceYear:'STARTS AFTER FIRST TICK'}</span>
    </div>
    <div className="evo-diagnostic-overview">
      <div><small>NEWBORNS / LAST YEAR</small>
        <strong>{fmt(last?.births??0)}</strong></div>
      <div><small>DEATHS / LAST YEAR</small>
        <strong>{fmt(last?.deaths??0)}</strong></div>
      <div><small>LIVING CHILDREN</small>
        <strong>{fmt(populations.reduce((n,p)=>n+p.children.length,0))}</strong></div>
      <div><small>RECORDED DEATHS</small>
        <strong>{fmt(totalDeaths)}</strong></div>
    </div>
    {world.agents.length>=1500&&<p className="evo-pop-cap-note">
      The population has grown beyond 1,500 individuals. There is no artificial
      birth ceiling; available habitat and resources constrain survival.
      Large populations can slow the simulation and require bigger world saves.
    </p>}
    <div className="evo-diagnostic-columns">
      <div className="evo-diagnostic-species">
        <div className="evo-diagnostic-title">SPECIES VITALS</div>
        <div className="evo-diagnostic-table-scroll">
          <table>
            <thead><tr><th scope="col">PEOPLE</th><th scope="col">ALIVE</th>
              <th scope="col">CHILDREN</th><th scope="col">BORN*</th>
              <th scope="col">DIED*</th><th scope="col">AVG AGE†</th></tr></thead>
            <tbody>{populations.map(p=><tr key={p.species}>
              <th scope="row"><i style={{background:SPECIES_INFO[p.species].color}}/>
                {SPECIES_INFO[p.species].name}
                <small className={p.status==='EXTINCT'||p.status==='CRITICAL'?'at-risk':''}>
                  {p.status}
                </small>
              </th>
              <td>{fmt(p.individuals.length)}</td>
              <td>{fmt(p.children.length)}</td>
              <td>{p.ledger?fmt(p.ledger.births):'—'}</td>
              <td>{p.ledger?fmt(p.ledger.deaths):'—'}</td>
              <td>{p.ledger?.deaths?Math.round(p.ledger.ageAtDeathSum/p.ledger.deaths)+
                ' yr':'—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="evo-diagnostic-note">
          * Births and deaths are recorded only since diagnostics began.
          † Average age includes all recorded deaths, including childhood losses.
          Population status compares the available last 25 years, not a prediction.
        </p>
      </div>
      <div className="evo-diagnostic-mortality">
        <div className="evo-diagnostic-title">RECORDED CAUSES OF DEATH</div>
        {DEATH_CAUSES.map(cause=><div key={cause} className="evo-diagnostic-cause">
          <div className="evo-diagnostic-cause-heading">
            <span>{DEATH_LABELS[cause]}</span><b>{fmt(causes[cause])}</b>
          </div>
          <div className="evo-diagnostic-bar" aria-label={
            DEATH_LABELS[cause]+': '+causes[cause]+' recorded deaths'}>
            <div style={{width:(totalDeaths?causes[cause]/totalDeaths*100:0)+'%'}}/>
          </div>
        </div>)}
        <div className="evo-diagnostic-extra">
          <span>Childhood deaths recorded</span>
          <strong>{fmt(populations.reduce((n,p)=>n+(p.ledger?.juvenileDeaths??0),0))}</strong>
        </div>
        <p className="evo-diagnostic-note">
          Tracking spans {reportedYears} {label(reportedYears)}.
          Causes reflect real simulation checks—not invented illness events.
          Harsh terrain means environmental health loss; declining health is
          reserved for other non-hunger health failures.
        </p>
      </div>
    </div>
    <div className="evo-diagnostic-legend">
      <span><i/> Tracking begins with v0.2.1 on newly created worlds, or after
        the first year advanced on an older save. Earlier causes and ages at death
        cannot be reconstructed reliably.</span>
    </div>
  </section>;
}
