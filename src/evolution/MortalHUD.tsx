import type {Agent,World} from './engine';
import {calendarDate,MONTH_NAMES} from './calendar';
import {personName} from './identity';
import {SPECIES_INFO} from './engine';
import type {MortalAction} from './mortalGameplay';
import {describeMortalBuilding,type MortalBuilding} from './mortalGameplay';
import {ARCHITECTURE,BUILDING_LABELS} from './construction';
import {canEnterMortalBuilding} from './mortalInteriors';
import type {MortalCameraMode} from './adventureCamera';

const nameOf=(world:World,agent:Agent)=>personName(world,
  world.lineage.find(r=>r.id===agent.id)??{id:agent.id,species:agent.species});

/** Small in-world controls; the underlying map stays the primary screen. */
export function MortalHUD({world,nearby,buildings=[],targetId,selectedBuilding,
  message,running,cameraMode='adventure',onToggleCamera,onTalk,onSelect,
  onInspectBuilding,onEnterBuilding,onClose,onToggleTime,onLeave}:{
  world:World;nearby:Agent[];targetId:number|null;message:string;
  buildings?:MortalBuilding[];selectedBuilding?:MortalBuilding|null;
  running:boolean;cameraMode?:MortalCameraMode;onToggleCamera?:()=>void;
  onTalk:(action:MortalAction)=>void;
  onSelect:(id:number)=>void;onInspectBuilding?:(site:MortalBuilding)=>void;
  onEnterBuilding?:(site:MortalBuilding)=>void;
  onClose:()=>void;
  onToggleTime:()=>void;onLeave:()=>void;
}){
  const person=world.agents.find(a=>a.id===world.descent?.agentId);
  if(!person)return null;
  const date=calendarDate(world);
  const active=nearby.find(a=>a.id===targetId);
  const doorway=buildings.find(b=>b.distance<=1);
  return <>
    <section className="evo-mortal-hud" aria-label="Mortal player controls">
      <div className="evo-mortal-identity">
        <strong>✦ {nameOf(world,person)}</strong>
        <span>{SPECIES_INFO[person.species].name} ·
          {' '}ENERGY {Math.round(person.energy)} ·
          {' '}{MONTH_NAMES[date.month]} {date.day}, Y{date.year}</span>
      </div>
      <div className="evo-mortal-keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Walk</span>
        <span><kbd>E</kbd> Interact</span>
        <span><kbd>V</kbd> View</span>
        <span><kbd>P</kbd> Time</span>
      </div>
      <div className="evo-mortal-actions">
        {onToggleCamera&&<button onClick={onToggleCamera}
          title="Switch between the close adventure camera and the traditional atlas"
          aria-label="Switch mortal camera perspective">
          {cameraMode==='adventure'?'◈ ADVENTURE VIEW':'▦ ATLAS VIEW'}</button>}
        <button onClick={()=>nearby.length&&onSelect(nearby[0].id)}
          disabled={!nearby.length} title="Talk with a nearby inhabitant">
          ◈ INTERACT {nearby.length?'('+nearby.length+')':''}</button>
        {doorway&&onInspectBuilding&&<button onClick={()=>onInspectBuilding(doorway)}
          title="Examine this real structure and its inhabitants">
          ⌂ {BUILDING_LABELS[doorway.building.type].toUpperCase()}</button>}
        <button onClick={onToggleTime} aria-pressed={!running}>
          {running?'Ⅱ PAUSE TIME':'▶ RESUME TIME'}</button>
        <button onClick={onLeave}>↑ ASCEND</button>
      </div>
    </section>
    {targetId===null&&!selectedBuilding&&message&&
      <p className="evo-mortal-feedback" role="status">
      {message}</p>}
    {!selectedBuilding&&targetId===null&&doorway&&
      <p className="evo-mortal-door-prompt">⌂ {BUILDING_LABELS[doorway.building.type]}
        {' '}— {doorway.distance===0||!nearby.length?<>
          <kbd>E</kbd> examine entrance</>:'Use the building button to examine'}</p>}
    {selectedBuilding&&<section className="evo-mortal-dialogue evo-mortal-building"
      aria-label="Nearby building">
      <header><strong>⌂ {BUILDING_LABELS[selectedBuilding.building.type].toUpperCase()}</strong>
        <button onClick={onClose} aria-label="Close building inspection">✕</button></header>
      <p className="evo-mortal-voice">
        {describeMortalBuilding(world,selectedBuilding)}</p>
      <p>{ARCHITECTURE[selectedBuilding.building.culture].name}
        {' '}· {selectedBuilding.building.stage.replace('_',' ')}
        {' '}· {Math.round(selectedBuilding.building.condition)}% condition</p>
      {canEnterMortalBuilding(world,selectedBuilding)?<>
        <p className="evo-mortal-building-note">This building is ready to explore.
          {' '}Press E or use the button to step inside.</p>
        {onEnterBuilding&&<div className="evo-mortal-talk-actions">
          <button onClick={()=>onEnterBuilding(selectedBuilding)}>
            ↳ ENTER BUILDING</button></div>}
      </>:<p className="evo-mortal-building-note">This site is unfinished or
        inaccessible. You can return when it is ready.</p>}
    </section>}
    {!selectedBuilding&&targetId!==null&&<section className="evo-mortal-dialogue"
      aria-label="Talk with a nearby inhabitant">
      <header><strong>◈ CONVERSATION</strong>
        <button onClick={onClose} aria-label="Close conversation">✕</button></header>
      {nearby.length?<>
        <div className="evo-mortal-contacts">
          {nearby.map(other=><button key={other.id}
            className={other.id===targetId?'active':''}
            onClick={()=>onSelect(other.id)}>{nameOf(world,other)}</button>)}
        </div>
        {active?<>
          <p><strong>{nameOf(world,active)}</strong> ·
            {' '}{active.development?.career??'Wanderer'}</p>
          <p className="evo-mortal-voice">{message||
            active.dailyLife?.reason||'A stranger watches you approach.'}</p>
          <div className="evo-mortal-talk-actions">
            <button onClick={()=>onTalk('greet')}>GREET</button>
            <button onClick={()=>onTalk('ask')}>ASK ABOUT LIFE</button>
            <button onClick={()=>onTalk('help')}>OFFER HELP</button>
          </div>
        </>:<p>Move closer to continue speaking.</p>}
      </>:<p>No one is close enough to speak with right now.</p>}
    </section>}
  </>;
}
