import {useState} from 'react';
import type {World} from './engine';
import {SPECIES_INFO} from './engine';
import {TOPICS,TOPIC_INFO,knows} from './knowledge';

export function KnowledgeCodex({world,onFindOnMap,onOpenPerson}:{world:World;
  onFindOnMap:(x:number,y:number)=>void;onOpenPerson:(id:number)=>void}){
  const [page,setPage]=useState<'expeditions'|'ideas'>('expeditions');
  const [filter,setFilter]=useState<'all'|'unexplored'|'collapsed'>('all');
  const firsts=new Map(world.knowledge?.firsts.map(f=>[f.topic,f])??[]);
  const learned=world.agents.filter(a=>(a.knowledge?.length??0)>0).length;
  const archived=world.settlements.filter(s=>(s.archives?.length??0)>0).length;
  const underway=world.agents.filter(a=>a.mind?.expedition);
  const sites=(world.ancientSites??[]).filter(s=>filter==='all'||
    filter==='unexplored'&&(s.visits??s.visitors.length)===0||
    filter==='collapsed'&&s.origin==='collapsed');
  const artifacts=world.agents.flatMap(a=>(a.artifacts??[]).map(v=>({a,v})));
  return <main className="evo-history-page evo-knowledge-page">
    <header className="evo-knowledge-header">
      <div><span className="evo-overline">WORLDFORGE V1.4 · RUINS & EXPEDITIONS</span>
        <h1>Every ruin hides <em>a story.</em></h1>
        <p>Curious mortals prepare expeditions, travel to forgotten places,
          risk their lives, and return with knowledge or relics. When a real
          settlement falls, its abandoned buildings and lost learning remain.</p></div>
      <div className="evo-knowledge-stats">
        <span><b>{firsts.size}/{TOPICS.length}</b><small>DISCOVERED IDEAS</small></span>
        <span><b>{underway.length}</b><small>ON EXPEDITIONS</small></span>
        <span><b>{world.expeditions?.length??0}</b><small>RECORDED JOURNEYS</small></span>
        <span><b>{world.ancientSites?.length??0}</b><small>KNOWN TO YOU</small></span>
      </div>
    </header>
    <div className="evo-expedition-switch" aria-label="Knowledge and expeditions views">
      <button className={page==='expeditions'?'active':''}
        aria-pressed={page==='expeditions'} onClick={()=>setPage('expeditions')}>
        ⌖ EXPEDITIONS & RUINS</button>
      <button className={page==='ideas'?'active':''}
        aria-pressed={page==='ideas'} onClick={()=>setPage('ideas')}>
        ✧ KNOWLEDGE & ARCHIVES</button>
    </div>
    {page==='ideas'?<>
    <div className="evo-expedition-summary">
      <span>{learned.toLocaleString()} living learners</span>
      <span>{archived} archiving settlements</span>
      <span>Knowledge must be taught or preserved to outlast its discoverer.</span>
    </div>
    <section className="evo-knowledge-grid" aria-label="Discoverable knowledge">
      {TOPICS.map(topic=>{
        const first=firsts.get(topic);
        const knowers=world.agents.filter(a=>knows(a,topic));
        const archives=world.settlements.filter(s=>s.archives?.includes(topic));
        return <article className="evo-section-card evo-knowledge-topic" key={topic}>
          <div className="evo-card-heading"><strong>✧ {TOPIC_INFO[topic].name.toUpperCase()}</strong>
            <span>{first?'DISCOVERED':'UNDISCOVERED'}</span></div>
          <p>{TOPIC_INFO[topic].description}</p>
          <p className="evo-knowledge-benefit">↳ {TOPIC_INFO[topic].benefit}</p>
          <div className="evo-knowledge-counts"><b>{knowers.length} living knowers</b>
            <small>{archives.length} settlement archives</small></div>
          {first?<small>First observed in year {first.year} by{' '}
            <button className="evo-knowledge-link" onClick={()=>onOpenPerson(first.personId)}>
              individual #{first.personId}</button> · {first.source}</small>:
            <small>Not yet discovered in this timeline.</small>}
          {knowers.length===0&&first&&archives.length===0&&
            <p className="evo-knowledge-lost">⚠ Lost knowledge — no living teacher
              or preserved text remains.</p>}
        </article>;
      })}
    </section>
    </>:<>
    <section className="evo-section-card evo-knowledge-sites">
      <div className="evo-card-heading"><strong>⌖ SITES & LOST CIVILIZATIONS</strong>
        <span>{world.ruins?.length??0} COLLAPSED TOWNS</span></div>
      <p>Places are seeded with the world. New ruins emerge when actual settlements
        collapse. Mortals choose which nearby site is worth the trip, pack
        provisions, and may abandon a journey to survive. Click a site to find
        it on the map.</p>
      <div className="evo-expedition-filters"><label htmlFor="ruin-filter">Show sites</label>
        <select id="ruin-filter" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
          <option value="all">All sites</option>
          <option value="unexplored">Never explored</option>
          <option value="collapsed">Collapsed civilizations</option>
        </select><small>{sites.length} shown</small></div>
      <div className="evo-knowledge-site-grid">
        {sites.map(site=><button key={site.id}
          onClick={()=>onFindOnMap(site.x,site.y)} title="Show this site on the world map">
          <b>{site.kind==='temple'?'✧':site.kind==='library'||site.kind==='archive'?'▤':
            site.kind==='crypt'?'♜':site.kind==='vault'?'◈':'⌂'}{' '}
            {site.name??site.kind.toUpperCase()+' #'+site.id}</b>
          <small>{site.kind.toUpperCase()} · ({site.x}, {site.y})
            {site.culture?' · '+site.culture:''}</small>
          <span>{(site.visits??site.visitors.length)>0?'Visited':'Unexplored'} ·
            {' '}{site.visits??site.visitors.length} visits · risk {site.danger}/100</span>
          {site.origin==='collapsed'&&<small>Fell in year {site.collapsed} ·
            {' '}{site.lostTopics?.length??0} archived subjects</small>}
        </button>)}
        {!sites.length&&<p className="evo-family-help">No sites match this view yet.</p>}
      </div>
    </section>
    <section className="evo-expedition-columns">
      <div className="evo-section-card">
        <div className="evo-card-heading"><strong>◈ PEOPLE ON EXPEDITIONS</strong>
          <span>{underway.length} ACTIVE</span></div>
        <div className="evo-expedition-log">
          {underway.slice(0,18).map(a=>{
            const plan=a.mind!.expedition!;
            const site=world.ancientSites?.find(s=>s.id===plan.siteId);
            return <button key={a.id} onClick={()=>onOpenPerson(a.id)}>
              <b>Explorer #{a.id}</b><span>{plan.stage} ·
                {' '}{site?.name??site?.kind??'unknown destination'} ·
                {' '}supplies {plan.supplies}/100</span>
            </button>;
          })}
          {!underway.length&&<p>No one has set out yet. Curious scouts and
            scholars will decide when the journey is worth the risk.</p>}
        </div>
      </div>
      <div className="evo-section-card">
        <div className="evo-card-heading"><strong>✦ EXPEDITION CHRONICLE</strong>
          <span>RECENT FINDINGS</span></div>
        <div className="evo-expedition-log">
          {(world.expeditions??[]).slice(-18).reverse().map((record,i)=><button
            key={i} onClick={()=>onOpenPerson(record.personId)}>
            <b>Y{record.year} · #{record.personId} · {record.outcome.toUpperCase()}</b>
            <span>{record.description}</span>
          </button>)}
          {!world.expeditions?.length&&<p>No expeditions have been recorded yet.</p>}
        </div>
      </div>
    </section>
    {artifacts.length>0&&<section className="evo-section-card">
      <div className="evo-card-heading"><strong>✧ RELICS IN MORTAL HANDS</strong>
        <span>{artifacts.length} SURVIVING</span></div>
      <div className="evo-expedition-log">
        {artifacts.slice(0,24).map(({a,v},i)=><button key={i}
          onClick={()=>onOpenPerson(a.id)}><b>{v.name}</b>
          <span>Held by #{a.id} · Discovered Y{v.year} · Site #{v.siteId}</span>
        </button>)}
      </div>
    </section>}
    </>}
    {world.knowledge?.firsts.length===0&&<p className="evo-family-help">
      The world is still young. People begin with practical instincts and
      ordinary skills, but specialized discoveries have not been made yet.</p>}
    <footer className="evo-knowledge-footer">Knowledge belongs to individuals,
      not species. Humans, elves, dwarves and demons may teach each other.
      Physical advantages are inherited; acquired ideas are not.
      {world.agents.length>0&&<span> · {' '}{SPECIES_INFO.demon.name} have
        exceptional strength and speed.</span>}</footer>
  </main>;
}
