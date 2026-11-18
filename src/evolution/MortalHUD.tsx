import type {Agent,World} from './engine';
import {personName} from './identity';
import {describeMortalBuilding,type MortalAction,type MortalBuilding} from './mortalGameplay';
import {BUILDING_LABELS} from './construction';
import {canEnterMortalBuilding} from './mortalInteriors';
import {PixelPortrait} from './PixelPortrait';

export function mortalName(world:World,agent:Agent){
  return personName(world,world.lineage.find(record=>record.id===agent.id)??agent);
}

export function MortalHUD({world,person,site,message,onTalk,onEnter,onClose}:{
  world:World;person:Agent|undefined;site:MortalBuilding|undefined;message:string;
  onTalk:(action:MortalAction)=>void;onEnter:()=>void;onClose:()=>void;
}){
  if(site)return <section className="adventure-dialogue" aria-label="Nearby building">
    <div className="adventure-dialogue-copy">
      <strong>{BUILDING_LABELS[site.building.type]}</strong>
      <p>{describeMortalBuilding(world,site)}</p>
      {canEnterMortalBuilding(world,site)?
        <button className="adventure-primary" onClick={onEnter}>Enter building</button>:
        <p>{site.distance>1?'Walk to the doorway to enter.':
          'This building is closed while unfinished or in ruins.'}</p>}
    </div>
    <button className="adventure-close" onClick={onClose}
      aria-label="Close building inspection">×</button>
  </section>;
  if(!person)return null;
  const name=mortalName(world,person);
  return <section className="adventure-dialogue" aria-label="Conversation">
    <PixelPortrait person={person} name={name} compact/>
    <div className="adventure-dialogue-copy">
      <strong>{name}</strong>
      <p aria-live="polite">{message||person.dailyLife?.reason||'What brings you here?'}</p>
      <div className="adventure-dialogue-actions">
        <button onClick={()=>onTalk('greet')}>Greet</button>
        <button onClick={()=>onTalk('ask')}>Ask about life</button>
        <button onClick={()=>onTalk('help')}>Offer help</button>
      </div>
    </div>
    <button className="adventure-close" onClick={onClose} aria-label="Close conversation">×</button>
  </section>;
}
