import type {World} from './engine';
import {ancientSiteName,TOPIC_INFO,type AncientSite} from './knowledge';

export function FieldJournal({world,site,directions,near,marked,onExplore}:{
  world:World;site?:AncientSite;directions?:string;near:boolean;
  marked:boolean;onExplore?:()=>void;
}){
  const entries=world.descent?.surveys??[];
  if(!site&&!entries.length)return null;
  return <section className="adventure-errand-tracker adventure-field-journal"
    aria-label="Field journal">
    {site&&<>
      <h2>{ancientSiteName(site)}</h2>
      {onExplore&&<button className="adventure-board-link" onClick={onExplore}
        aria-pressed={near?undefined:marked}>
        {near?'Survey landmark':(marked?'Landmark marked · ':'Mark landmark · ')+directions}
      </button>}
    </>}
    {entries.length>0&&<details className="adventure-errand-history">
      <summary>Field journal · {entries.length}</summary>
      <ul>{[...entries].reverse().map(entry=>{
        const place=world.ancientSites?.find(s=>s.id===entry.siteId);
        return <li key={entry.siteId}>
          <span>{place?ancientSiteName(place):'Landmark #'+entry.siteId}
            <small>Year {entry.year}</small></span>
          <small>{entry.topic?TOPIC_INFO[entry.topic].name:'Surveyed'}</small>
        </li>;
      })}</ul>
    </details>}
  </section>;
}
