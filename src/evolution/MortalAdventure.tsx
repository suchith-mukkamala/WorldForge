import {useEffect,useRef,useState} from 'react';
import type {Agent,World} from './engine';
import {advanceWorldDays,calendarDate,MONTH_NAMES} from './calendar';
import {BUILDING_LABELS,settlementStage} from './construction';
import {AdventureCanvas} from './AdventureCanvas';
import {MortalHUD,mortalName} from './MortalHUD';
import {MortalInterior} from './MortalInterior';
import {PixelPortrait} from './PixelPortrait';
import {adventureDistance,adventureMapFor,adventureRegion,LANDSCAPE_NAME,
  useAdventureGate,walkAdventure,type AdventureGate} from './adventureMap';
import {adventurePlaceKey} from './adventurePlaces';
import {livingHousehold,nearestIndoorResident} from './livingHouseholds';
import {atInteriorDoor,canEnterMortalBuilding,findInteriorBuilding,
  INTERIOR_DOOR,moveInside} from './mortalInteriors';
import {interactWithMortal,mortalMovementDelay,nearbyMortalBuildings,nearbyMortals,
  type MortalAction,type MortalBuilding} from './mortalGameplay';
import {useAdventureControls,WALK_DIRECTIONS} from './useAdventureControls';
import type {Point} from './motion';

const buildingKey=(site:MortalBuilding)=>site.settlementId+':'+site.building.id;
const equal=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
type Focus={personId:number}|{building:string};
type Interior={settlementId:number;buildingId:number;position:Point;target:number|null};
type Interaction={label:string;point?:Point;run:()=>void};

function directionTo(from:Point,to:Point){
  const vertical=to.y<from.y?'N':to.y>from.y?'S':'';
  const horizontal=to.x<from.x?'W':to.x>from.x?'E':'';
  return vertical+horizontal;
}

export function MortalAdventure({world,actor,notice,onChange,onAscend}:{
  world:World;actor:Agent;notice?:string;onChange:(next:World)=>void;onAscend:()=>void;
}){
  const current=useRef(world);
  current.current=world;
  const [running,setRunning]=useState(true);
  const [focus,setFocus]=useState<Focus|null>(null);
  const [interior,setInterior]=useState<Interior|null>(null);
  const [message,setMessage]=useState('');
  const [waypoint,setWaypoint]=useState<string|null>(null);
  const map=adventureMapFor(world),region=adventureRegion(world,map,actor);
  const scene=adventurePlaceKey(region.place);
  const date=calendarDate(world);
  const interiorSite=interior&&findInteriorBuilding(world,interior);
  const nearby=nearbyMortals(world,12).filter(a=>region.area.has(a.y*world.width+a.x));
  const buildings=nearbyMortalBuildings(world,12).filter(site=>
    region.area.has(site.entrance.y*world.width+site.entrance.x)&&
    (!region.settlement||region.settlement.id===site.settlementId));
  const focusedPerson=focus&&'personId' in focus?
    nearby.find(person=>person.id===focus.personId):undefined;
  const focusedBuilding=focus&&'building' in focus?
    buildings.find(site=>buildingKey(site)===focus.building):undefined;
  const gates=region.gates.map(gate=>({gate,
    distance:adventureDistance(actor,gate.point),key:adventurePlaceKey(gate.destination)}))
    .sort((a,b)=>a.distance-b.distance);
  const pinned=gates.find(g=>g.key===waypoint);

  const commit=(next:World)=>{
    current.current=next;
    onChange(next);
  };
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>{
      const before=current.current;
      const after=advanceWorldDays(before,1);
      if(after!==before)commit(after);
    },2000);
    return ()=>window.clearInterval(timer);
  },[running,onChange]);
  useEffect(()=>{
    if(interior&&!interiorSite){
      setInterior(null);
      setMessage('This building is no longer accessible.');
    }
  },[interior,interiorSite]);
  useEffect(()=>{
    if(focus&&!focusedPerson&&!focusedBuilding)setFocus(null);
  },[focus,focusedPerson,focusedBuilding]);

  const clear=()=>{setFocus(null);setMessage('');};
  const exitInterior=()=>{setInterior(null);clear();};
  const toggleTime=()=>setRunning(value=>!value);
  const selectPerson=(person:Agent)=>{
    setFocus({personId:person.id});setMessage('');
  };
  const enterBuilding=(site:MortalBuilding)=>{
    const actual=nearbyMortalBuildings(current.current,12).find(b=>
      buildingKey(b)===buildingKey(site));
    if(!actual||!canEnterMortalBuilding(current.current,actual)){
      setFocus({building:buildingKey(site)});setMessage('');return;
    }
    clear();
    setInterior({settlementId:site.settlementId,buildingId:site.building.id,
      position:INTERIOR_DOOR,target:null});
  };
  const travel=(gate:AdventureGate)=>{
    const before=current.current;
    const player=before.agents.find(a=>a.id===actor.id);
    if(!player)return;
    const actual=adventureRegion(before,adventureMapFor(before),player);
    const exit=actual.gates.find(g=>adventurePlaceKey(g.destination)===
      adventurePlaceKey(gate.destination));
    if(!exit)return;
    const result=useAdventureGate(before,actual,player,exit);
    if(!result.moved){setMessage(result.reason??'The exit is blocked.');return;}
    commit(result.world);
    const destination=exit.destination;
    const ahead=destination.kind==='route'?
      (adventurePlaceKey(destination.to)===scene?destination.from:destination.to):null;
    setWaypoint(ahead?adventurePlaceKey(ahead):null);
    clear();
  };
  const speak=(personId:number,action:MortalAction,inside=false)=>{
    const before=current.current;
    if(inside&&interiorSite&&interior&&!livingHousehold(before,interiorSite).present
      .some(resident=>resident.agent.id===personId&&
        adventureDistance(resident.position,interior.position)<=1)){
      setInterior({...interior,target:null});
      setMessage('They have moved away.');return;
    }
    const result=interactWithMortal(before,personId,action,inside?'home':'outside');
    if(result.world!==before)commit(result.world);
    setMessage(result.message);
  };
  const gateAction=(g:AdventureGate):Interaction=>({
    label:(g.ferry?'Sail to ':g.destination.kind==='route'?'Take trail to ':'Enter ')+g.label,
    run:()=>travel(g),point:g.point,
  });
  const buildingAction=(site:MortalBuilding):Interaction=>({
    label:(canEnterMortalBuilding(world,site)?'Enter ':'Inspect ')+
      BUILDING_LABELS[site.building.type].toLowerCase(),
    run:()=>enterBuilding(site),point:site.entrance,
  });
  const personAction=(person:Agent):Interaction=>({
    label:'Talk to '+mortalName(world,person),run:()=>selectPerson(person),point:person,
  });
  let actions:Interaction[];
  if(interior&&interiorSite){
    const resident=nearestIndoorResident(world,interiorSite,interior.position);
    actions=atInteriorDoor(interior.position)?[{label:'Exit building',run:exitInterior}]:
      resident?[{label:'Talk to '+mortalName(world,resident.agent),
        run:()=>{setInterior({...interior,target:resident.agent.id});setMessage('');}}]:[];
  }else{
    actions=[
      ...gates.filter(g=>g.distance<=1).map(g=>gateAction(g.gate)),
      ...buildings.filter(site=>site.distance===0).map(buildingAction),
      ...nearby.map(personAction),
      ...buildings.filter(site=>site.distance===1).map(buildingAction),
    ];
  }
  const primary=actions[0];
  const interact=()=>{
    if(interior&&interior.target!==null){
      setInterior({...interior,target:null});setMessage('');return;
    }
    if(focusedBuilding){enterBuilding(focusedBuilding);return;}
    if(focusedPerson){clear();return;}
    primary?.run();
  };
  const escape=()=>{
    if(interior){
      if(interior.target!==null){setInterior({...interior,target:null});setMessage('');}
      else exitInterior();
    }else clear();
  };
  const move=({x,y}:Point)=>{
    const before=current.current;
    const player=before.agents.find(a=>a.id===actor.id);
    if(!player)return 150;
    if(interior&&interiorSite){
      const occupants=livingHousehold(before,interiorSite).present;
      const occupied=new Set(occupants.map(resident=>
        resident.position.x+':'+resident.position.y));
      const next=moveInside(interiorSite.building.type,interior.position,x,y,occupied);
      if(next!==interior.position){
        setInterior({...interior,position:next,target:null});setMessage('');
      }
      return 150;
    }
    const actual=adventureRegion(before,adventureMapFor(before),player);
    const step=walkAdventure(before,actual,x,y);
    if(step.moved){commit(step.world);clear();}
    else if(step.reason)setMessage(step.reason);
    return mortalMovementDelay(player);
  };
  const controls=useAdventureControls({move,interact,escape,pause:toggleTime});
  const selectTile=(point:Point)=>{
    const exit=gates.find(g=>equal(g.gate.point,point));
    if(exit){
      if(exit.distance<=1)travel(exit.gate);
      else setWaypoint(exit.key);
      return;
    }
    const person=nearby.find(a=>equal(a,point));
    if(person){selectPerson(person);return;}
    const site=buildings.find(b=>equal(b.building,point)||equal(b.entrance,point));
    if(site){setFocus({building:buildingKey(site)});setMessage('');}
  };
  const name=mortalName(world,actor);
  const regionDetails=region.ends?region.ends.join(' ↔ '):region.settlement?
    LANDSCAPE_NAME[region.landscape]+' · '+settlementStage(region.settlement):
    LANDSCAPE_NAME[region.landscape];
  const routeMessage=region.place.kind==='route'?'Follow the path to a town sign.':
    gates.some(({gate})=>gate.ferry)?'Follow the path to a trail or ferry landing.':
      gates.length?'Follow a signed trail to the next town.':region.settlement?
        'No routes reach this settlement yet.':'No settlements are reachable from here yet.';
  const showAction=!focusedPerson&&!focusedBuilding&&
    (!interior||interior.target===null&&!atInteriorDoor(interior.position));
  const movementControls=(
    <div className="adventure-controls" role="group" aria-label="Adventure controls">
      <div className="adventure-dpad" role="group" aria-label="Walk with touch controls">
        {WALK_DIRECTIONS.map(d=><button key={d.id} className={'walk-'+d.id}
          aria-label={d.label} onPointerDown={event=>controls.start(event,d.id)}
          onPointerUp={controls.stop} onPointerCancel={controls.stop}
          onLostPointerCapture={controls.stop}
          onClick={event=>{if(event.detail===0)controls.tap(d);}}>{d.icon}</button>)}
      </div>
      <div className="adventure-controls-main">
        <div className="adventure-hints">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span>
          <span><kbd>E</kbd> Interact</span>
        </div>
        <div className="adventure-interactions">
          {primary&&showAction&&<button className="adventure-primary" onClick={interact}
            aria-keyshortcuts="E">{primary.label}</button>}
          {actions.length>1&&showAction&&<details className="adventure-nearby" key={scene}>
            <summary>Nearby</summary>
            <div>{actions.slice(1,7).map((action,i)=><button
              key={action.label+':'+i} onClick={event=>{
                event.currentTarget.closest('details')?.removeAttribute('open');
                action.run();
              }}>{action.label}</button>)}</div>
          </details>}
        </div>
        {!interior&&showAction&&<p className="adventure-feedback" role="status">
          {message||(!primary&&gates.length?routeMessage:'')}</p>}
      </div>
    </div>);
  return <div className="evo-app adventure-shell" data-landscape={region.landscape}>
    <header className="adventure-topbar">
      <div className="adventure-brand"><span aria-hidden="true">✦</span> WorldForge</div>
      <div className="adventure-top-actions">
        <button onClick={toggleTime} aria-pressed={!running}
          aria-keyshortcuts="P">{running?'Pause time':'Resume time'}</button>
        <button className="adventure-ascend" onClick={onAscend}>↑ Ascend</button>
      </div>
    </header>
    <main className="adventure-main">
      <header className="adventure-heading">
        <div>
          <p>{regionDetails}</p>
          <h1 aria-live="polite">{region.name}</h1>
        </div>
        <time>{MONTH_NAMES[date.month]} {date.day} <span>· Year {date.year}</span></time>
      </header>
      {notice&&<p className="adventure-feedback" role="status">{notice}</p>}
      <div className="adventure-layout">
        <div className="adventure-stage">
          {interior&&interiorSite?<MortalInterior world={world} site={interiorSite}
            position={interior.position} message={message} targetId={interior.target}
            onSelectResident={id=>setInterior({...interior,target:id})}
            onTalk={action=>{if(interior.target!==null)speak(interior.target,action,true);}}
            onCloseConversation={()=>{setInterior({...interior,target:null});setMessage('');}}
            onExit={exitInterior}>{movementControls}</MortalInterior>:<>
            <div className="adventure-picture">
              <AdventureCanvas world={world} map={map} region={region} actor={actor}
                marked={focusedBuilding?.entrance??focusedPerson??pinned?.gate.point??
                  primary?.point??null} onSelect={selectTile}/>
              <MortalHUD world={world} person={focusedPerson} site={focusedBuilding}
                message={message} onClose={clear}
                onEnter={()=>{if(focusedBuilding)enterBuilding(focusedBuilding);}}
                onTalk={action=>{if(focusedPerson)speak(focusedPerson.id,action);}}/>
            </div>
            {movementControls}
          </>}
        </div>
        <aside className="adventure-sidebar">
          <section className="adventure-profile" aria-label="Your mortal">
            <PixelPortrait person={actor} name={name} compact/>
            <div>
              <strong>{name}</strong>
              <label>Energy <meter min={0} max={100} value={actor.energy}/></label>
            </div>
          </section>
          {!interior&&<section className="adventure-exits">
            <h2>{region.place.kind==='route'?'Trail ends':
              gates.some(({gate})=>gate.ferry)?'Trails & ferries':'Trails'}</h2>
            {gates.length?<ul>{gates.map(({gate,distance,key})=><li key={key}>
              <button onClick={()=>distance<=1?travel(gate):
                setWaypoint(prev=>prev===key?null:key)}
                aria-pressed={distance>1?waypoint===key:undefined}
                title={gate.ferry?(distance<=1?'Board ferry':'Mark ferry landing'):
                  distance<=1?'Use this signpost':'Mark this signpost'}>
                <span className="adventure-direction" aria-hidden="true">
                  {distance<=1?(gate.ferry?'≈':'•'):directionTo(actor,gate.point)}
                </span>
                <span><strong>{gate.label}</strong>
                  <small>{distance<=1?(gate.ferry?'Ferry · '+gate.ferry.seaTiles+' sea tiles':
                    'At the signpost'):(gate.ferry?'Ferry · ':'')+
                    distance+' tiles '+directionTo(actor,gate.point)}</small></span>
                <span aria-hidden="true">›</span>
              </button>
            </li>)}</ul>:<p>{routeMessage}</p>}
          </section>}
        </aside>
      </div>
    </main>
  </div>;
}
