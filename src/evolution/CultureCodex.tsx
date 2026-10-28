import {useState} from 'react';
import type {World} from './engine';
import {FAITH_LABELS,GOVERNMENT_LABELS,POLICY_LABELS,
  type CivicPolicy} from './culture';

const IMPACT:Record<CivicPolicy,string>={
  mutual_aid:'Uses local food and community funds to help vulnerable residents.',
  learning:'Funds a small number of residents to gain practical knowledge.',
  autonomy:'Encourages personal independence and voluntary decisions.',
  tradition:'Supports civic ceremonies and preserves cultural practices.',
};
export function CultureCodex({world,onFindSettlement,onOpenPerson}:{world:World;
  onFindSettlement:(id:number)=>void;onOpenPerson:(id:number)=>void}){
  const [page,setPage]=useState<'governments'|'faiths'>('governments');
  const state=world.culture;
  const faiths=state?.faiths??[],governments=state?.governments??[];
  const adherents=new Map<number,number>();
  for(const a of world.agents)if(a.belief)
    adherents.set(a.belief.faithId,(adherents.get(a.belief.faithId)??0)+1);
  const followers=[...adherents.values()].reduce((n,c)=>n+c,0);
  const activeFaiths=faiths.filter(f=>(adherents.get(f.id)??0)>0).length;
  return <main className="evo-history-page evo-culture-page">
    <header className="evo-knowledge-header">
      <div><span className="evo-overline">WORLDFORGE V1.5 · BELIEFS & GOVERNMENT</span>
        <h1>Ideas become <em>institutions.</em></h1>
        <p>People interpret their lives, invent beliefs, teach or question them,
          and choose who should govern their settlements. Neither species nor
          gods dictate a civilization's religion or political future.</p></div>
      <div className="evo-knowledge-stats">
        <span><b>{governments.length}</b><small>SELF-GOVERNING TOWNS</small></span>
        <span><b>{activeFaiths}</b><small>LIVING FAITHS</small></span>
        <span><b>{followers.toLocaleString()}</b><small>INDIVIDUAL BELIEVERS</small></span>
        <span><b>{state?.history.length??0}</b><small>CHRONICLED DECISIONS</small></span>
      </div>
    </header>
    <div className="evo-expedition-switch" aria-label="Culture views">
      <button className={page==='governments'?'active':''}
        aria-pressed={page==='governments'} onClick={()=>setPage('governments')}>
        ⚖ GOVERNMENTS & POLICIES</button>
      <button className={page==='faiths'?'active':''}
        aria-pressed={page==='faiths'} onClick={()=>setPage('faiths')}>
        ✧ RELIGIONS & BELIEFS</button>
    </div>
    {page==='governments'?<section className="evo-culture-grid" aria-label="Governing communities">
      {governments.map(g=>{
        const s=world.settlements.find(v=>v.id===g.settlementId);
        if(!s)return null;
        return <article className="evo-section-card evo-culture-card" key={s.id}>
          <div className="evo-card-heading"><strong>⚖ {s.name.toUpperCase()}</strong>
            <span>{GOVERNMENT_LABELS[g.kind]}</span></div>
          <h3>{POLICY_LABELS[g.policy]}</h3>
          <p>{IMPACT[g.policy]}</p>
          <div className="evo-culture-meters">
            <label>Legitimacy <b>{Math.round(g.legitimacy)}%</b>
              <progress max="100" value={g.legitimacy}/></label>
            <label>Unrest <b>{Math.round(g.unrest)}%</b>
              <progress max="100" value={g.unrest}/></label>
          </div>
          <small>Elected Y{g.elected} · {g.turnout} participating residents</small>
          <div className="evo-culture-actions">
            <button onClick={()=>onOpenPerson(g.leaderId)}>View leader #{g.leaderId}</button>
            <button onClick={()=>onFindSettlement(s.id)}>⌖ Find town</button>
          </div>
        </article>;
      })}
      {!governments.length&&<p className="evo-family-help">No government has
        formed yet. Communities must gather enough adults and decide how to
        organize; watch the world unfold.</p>}
    </section>:<section className="evo-culture-grid" aria-label="Emergent religions">
      {faiths.map(f=><article className="evo-section-card evo-culture-card" key={f.id}>
        <div className="evo-card-heading"><strong>✧ {f.name.toUpperCase()}</strong>
          <span>{FAITH_LABELS[f.theme]}</span></div>
        <h3>{adherents.get(f.id)??0} living followers</h3>
        <p>Core value: {f.tenet} · Tolerance {Math.round(f.tolerance)}/100.
          Mortals may follow, reject, reinterpret or leave this faith.</p>
        <small>Founded in year {f.founded} by citizen #{f.founderId}.
          {(adherents.get(f.id)??0)===0?' No living followers remain.':''}</small>
        <div className="evo-culture-actions">
          <button onClick={()=>onOpenPerson(f.founderId)}>View founder #{f.founderId}</button>
        </div>
      </article>)}
      {!faiths.length&&<p className="evo-family-help">No traditions have been
        founded yet. Beliefs can emerge from memories, hardship, craft,
        exploration and divine experiences.</p>}
    </section>}
    <section className="evo-section-card evo-culture-chronicle">
      <div className="evo-card-heading"><strong>≋ CULTURAL CHRONICLE</strong>
        <span>RECENT DECISIONS</span></div>
      <div className="evo-expedition-log">
        {(state?.history??[]).slice(-20).reverse().map((m,i)=><p key={i}>
          <b>YEAR {m.year} · {m.kind.toUpperCase()}</b> {m.description}
        </p>)}
        {!state?.history.length&&<p>History is waiting for the first
          founding, election or reform.</p>}
      </div>
    </section>
    <footer className="evo-knowledge-footer">Beliefs are acquired through
      experiences and contact. Policies spend real community resources and
      can change as people vote; disagreement doesn't automatically become war.</footer>
  </main>;
}
