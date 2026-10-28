import type {World} from './engine';
import {SPECIES_INFO} from './engine';
import {TOPICS,TOPIC_INFO,knows} from './knowledge';

export function KnowledgeCodex({world,onFindOnMap,onOpenPerson}:{world:World;
  onFindOnMap:(x:number,y:number)=>void;onOpenPerson:(id:number)=>void}){
  const firsts=new Map(world.knowledge?.firsts.map(f=>[f.topic,f])??[]);
  const learned=world.agents.filter(a=>(a.knowledge?.length??0)>0).length;
  const archived=world.settlements.filter(s=>(s.archives?.length??0)>0).length;
  return <main className="evo-history-page evo-knowledge-page">
    <header className="evo-knowledge-header">
      <div><span className="evo-overline">WORLDFORGE V1.3 · THE AGE OF KNOWLEDGE</span>
        <h1>Knowledge is <em>earned.</em></h1>
        <p>People discover useful ideas through experience, teach one another,
          and sometimes uncover forgotten wisdom. A new generation is not born
          knowing what its ancestors knew. Written archives can preserve ideas
          long after their discoverers are gone.</p></div>
      <div className="evo-knowledge-stats">
        <span><b>{firsts.size}/{TOPICS.length}</b><small>DISCOVERED IDEAS</small></span>
        <span><b>{learned.toLocaleString()}</b><small>LIVING LEARNERS</small></span>
        <span><b>{archived}</b><small>ARCHIVING TOWNS</small></span>
        <span><b>{world.ancientSites?.length??0}</b><small>ANCIENT SITES</small></span>
      </div>
    </header>
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
    <section className="evo-section-card evo-knowledge-sites">
      <div className="evo-card-heading"><strong>⌖ ANCIENT TEMPLES, ARCHIVES & VAULTS</strong>
        <span>PROCEDURAL · EXPEDITION RISKS</span></div>
      <p>Ancient structures have fixed locations and dangers in each world seed.
        Explorers may uncover rare knowledge—or suffer serious injuries.
        The same person cannot repeatedly raid one site.</p>
      <div className="evo-knowledge-site-grid">
        {(world.ancientSites??[]).map(site=><button key={site.id}
          onClick={()=>onFindOnMap(site.x,site.y)} title="Show this site on the world map">
          <b>{site.kind.toUpperCase()} #{site.id}</b>
          <small>X {site.x} · Y {site.y} · {site.visitors.length} expeditions</small>
          <span>{site.visitors.length?'Explored':'Unexplored'} ·
            {' '}danger {site.danger}/100</span>
        </button>)}
      </div>
    </section>
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
