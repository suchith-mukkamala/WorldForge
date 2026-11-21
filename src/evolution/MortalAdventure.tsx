import {useEffect,useRef,useState} from 'react';
import type {Agent,World} from './engine';
import {calendarDate,MONTH_NAMES} from './calendar';
import {BUILDING_LABELS,settlementStage} from './construction';
import {AdventureCanvas} from './AdventureCanvas';
import {AdventureDirections} from './AdventureDirections';
import {MortalHUD,mortalName} from './MortalHUD';
import {MortalInterior} from './MortalInterior';
import {ErrandTracker,TownNoticeBoard} from './TownErrands';
import {CoastalJournal,FieldJournal} from './FieldJournal';
import {PixelPortrait} from './PixelPortrait';
import {adventureDistance,adventureMapFor,adventureRegion,LANDSCAPE_NAME,
  useAdventureGate,walkAdventure,type AdventureGate} from './adventureMap';
import {adventurePlaceKey} from './adventurePlaces';
import {livingHousehold} from './livingHouseholds';
import {atInteriorDoor,canEnterMortalBuilding,enterMortalRoom,findInteriorBuilding,
  findMortalBuilding,INTERIOR_DOOR,INTERIOR_TEMPLATES,interiorTitle,leaveMortalRoom,
  moveInside,occupiedMortalRoom} from './mortalInteriors';
import {interactWithInteriorProp,interiorPropAction} from './interiorActions';
import type {RoomReference} from './roomSave';
import {facingActions} from './adventureCamera';
import {interactWithMortal,isMortalSolidBuilding,mortalMovementDelay,nearbyMortalBuildings,nearbyMortals,
  type MortalAction,type MortalBuilding} from './mortalGameplay';
import {useAdventureControls} from './useAdventureControls';
import {abandonErrand,abandonErrandLabel,acceptErrand,availableErrands,buyMeal,
  deliverErrand,errandObjective,gatherErrand,journalFor,noticeBoard,
  type ErrandResult} from './mortalErrands';
import {coinLabel} from './errandRecords';
import {reachableLandmarks,surveyLandmark} from './mortalSurveys';
import {isRiverDiscovery} from './riverDiscoveries';
import {waterSeason} from './riverSeasons';
import type {AncientSite} from './knowledge';
import {directionBetween,samePoint as equal,type Facing,type Point} from './motion';
import {launchShip,recoverShip,shipMooring} from './mortalSailing';
import {MortalSailing} from './MortalSailing';
import {seaPoint} from './shipSave';
import {MortalCave} from './MortalCave';
import {enterTideCave,leaveTideCave,occupiedTidalCave,usableTidalCave,waitForCaveTide} from './mortalTidalCaves';
import {coastTide,tidalCaves,type TidalCave} from './tidalCaves';

const buildingKey=(site:MortalBuilding)=>site.settlementId+':'+site.building.id;
const buildingRef=(site:MortalBuilding):RoomReference=>({
  settlementId:site.settlementId,buildingId:site.building.id,
});
type Focus={personId:number}|{building:string};
type Interaction={label:string;point?:Point;run:()=>void};

function directionTo(from:Point,to:Point){
  const vertical=to.y<from.y?'N':to.y>from.y?'S':'';
  const horizontal=to.x<from.x?'W':to.x>from.x?'E':'';
  return vertical+horizontal;
}

type AdventureProps={
  world:World;actor:Agent;notice?:string;onChange:(next:World)=>void;onAscend:()=>void;
  running:boolean;onToggleTime:()=>void;
};

export function MortalAdventure(props:AdventureProps){
  const {world,onChange}=props,ship=world.descent?.ship,visit=occupiedTidalCave(world);
  useEffect(()=>{
    if(world.descent?.tidal?.inside&&!visit){
      onChange(leaveTideCave(world).world);return;
    }
    const recovered=recoverShip(world);
    if(recovered!==world)onChange(recovered);
  },[world,onChange,!!visit]);
  if(visit)return <MortalCave key={visit.cave.mouth} {...props} visit={visit}/>;
  return ship?.underway?<MortalSailing {...props} ship={ship}/>:<MortalOnFoot {...props}/>;
}

function MortalOnFoot({world,actor,notice,onChange,onAscend,running,onToggleTime}:AdventureProps){
  const current=useRef(world);
  current.current=world;
  const [focus,setFocus]=useState<Focus|null>(null);
  const [facing,setFacing]=useState<Facing>(world.descent?.interior?'north':'south');
  const [residentTarget,setResidentTarget]=useState<number|null>(null);
  const [doorPin,setDoorPin]=useState<RoomReference|null>(null);
  const [message,setMessage]=useState('');
  const [waypoint,setWaypoint]=useState<string|null>(null);
  const [boardOpen,setBoardOpen]=useState(false);
  const [boardPinned,setBoardPinned]=useState(false);
  const [errandMessage,setErrandMessage]=useState('');
  const [landmarkPin,setLandmarkPin]=useState<number|null>(null);
  const [markRiver,setMarkRiver]=useState(false);
  const [cavePin,setCavePin]=useState<number|null>(null);
  const [markedBerth,setMarkedBerth]=useState(false);
  const map=adventureMapFor(world),region=adventureRegion(world,map,actor);
  const caves=tidalCaves(world).filter(cave=>region.area.has(cave.mouth)&&usableTidalCave(world,map,cave));
  const distanceToCave=(cave:TidalCave)=>adventureDistance(actor,seaPoint(world.width,cave.mouth));
  const cave=caves.find(c=>c.mouth===cavePin)??[...caves].sort((a,b)=>distanceToCave(a)-distanceToCave(b))[0];
  const cavePoint=cave&&seaPoint(world.width,cave.mouth),caveNear=!!cave&&distanceToCave(cave)<=1;
  const tide=coastTide(world);
  const scene=adventurePlaceKey(region.place);
  const interiorSite=occupiedMortalRoom(world);
  const interior=interiorSite?world.descent?.interior:undefined;
  const residents=interiorSite?livingHousehold(world,interiorSite).present:[];
  const roomItems=interiorSite?INTERIOR_TEMPLATES[interiorSite.building.type].props:[];
  const markedDoor=doorPin&&findInteriorBuilding(world,doorPin);
  const mooring=shipMooring(world,map);
  const localYard=[...map.shipyards.values()].find(yard=>region.area.has(yard.shore));
  const berth=mooring&&region.area.has(mooring.shore)?mooring:localYard;
  const berthPoint=berth&&seaPoint(world.width,berth.shore);
  const berthDistance=berthPoint?adventureDistance(actor,berthPoint):Infinity;
  const ownBerth=berth&&berth.shore===mooring?.shore&&berth.water===mooring.water;
  const boatLabel=ownBerth?'Board sailboat':'Launch sailboat';
  const board=noticeBoard(world,region),boardNear=!!board&&adventureDistance(actor,board)<=1;
  const journal=journalFor(world),activeErrand=journal.active;
  const objective=activeErrand&&errandObjective(world,map,region,activeErrand);
  const showBoard=boardOpen&&boardNear&&!interior;
  const date=calendarDate(world);
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
  const landmarks=interior?[]:reachableLandmarks(world,map,region);
  const surveyed=new Set(world.descent?.surveys?.map(entry=>entry.siteId));
  const unsurveyed=landmarks.filter(site=>!surveyed.has(site.id)&&
    (!isRiverDiscovery(site.kind)||adventureDistance(actor,site)<=3))
    .sort((a,b)=>adventureDistance(actor,a)-adventureDistance(actor,b)||a.id-b.id);
  const markedLandmark=unsurveyed.find(site=>site.id===landmarkPin);
  const landmark=markedLandmark??unsurveyed[0];
  const closeLandmark=unsurveyed.find(site=>adventureDistance(actor,site)<=1);
  const toPoint=(i:number)=>({x:i%world.width,y:Math.floor(i/world.width)});
  const river=region.river;
  const along=river?.path.reduce((nearest,index,step)=>adventureDistance(actor,toPoint(index))<
    adventureDistance(actor,toPoint(river.path[nearest]))?step:nearest,0)??0;
  const nextStop=river?.stops.find(stop=>river.path.indexOf(stop.index)>along&&region.area.has(stop.index));
  const nextBank=nextStop&&toPoint(nextStop.index);

  const commit=(next:World)=>{
    current.current=next;
    onChange(next);
  };
  useEffect(()=>{
    if(world.descent?.interior&&!interiorSite){
      commit(leaveMortalRoom(current.current));
      setResidentTarget(null);
      setMessage('This building is no longer accessible.');
    }
  },[world.descent?.interior,interiorSite]);
  useEffect(()=>{
    if(focus&&!focusedPerson&&!focusedBuilding)setFocus(null);
  },[focus,focusedPerson,focusedBuilding]);
  useEffect(()=>{
    if(residentTarget!==null&&(!interior||!residents.some(resident=>
      resident.agent.id===residentTarget&&adventureDistance(resident.position,interior.position)<=1)))
      setResidentTarget(null);
  },[interior,residents,residentTarget]);
  useEffect(()=>{
    if(boardOpen&&!showBoard)setBoardOpen(false);
  },[boardOpen,showBoard]);
  useEffect(()=>{
    if(!errandMessage||showBoard)return;
    const timer=window.setTimeout(()=>setErrandMessage(''),6000);
    return ()=>window.clearTimeout(timer);
  },[errandMessage,showBoard]);

  const clear=()=>{setFocus(null);setBoardOpen(false);setMessage('');};
  const exitInterior=()=>{
    const before=current.current,site=occupiedMortalRoom(before);
    if(site)setFacing(directionBetween(site.building,site.entrance));
    commit(leaveMortalRoom(before));setResidentTarget(null);clear();
  };
  const toggleTime=onToggleTime;
  const selectPerson=(person:Agent)=>{
    setFacing(value=>directionBetween(actor,person,value));
    setFocus({personId:person.id});setMessage('');
  };
  const performAction=(action:(before:World)=>ErrandResult,close=false)=>{
    const before=current.current,result=action(before);
    if(result.world!==before){
      commit(result.world);
      setWaypoint(null);setBoardPinned(false);setLandmarkPin(null);setDoorPin(null);
      if(close)setBoardOpen(false);
    }
    setErrandMessage(result.message);
  };
  const openBoard=()=>{
    if(!boardNear||interior)return;
    clear();setBoardOpen(true);setErrandMessage('');
  };
  const selectBoard=()=>{
    if(boardNear)openBoard();
    else{setWaypoint(null);setLandmarkPin(null);setDoorPin(null);setBoardPinned(value=>!value);}
  };
  const pinGate=(key:string)=>{
    setBoardPinned(false);setLandmarkPin(null);setDoorPin(null);
    setWaypoint(current=>current===key?null:key);
  };
  const selectLandmark=(site:AncientSite)=>{
    clear();
    if(adventureDistance(actor,site)<=1){
      performAction(before=>surveyLandmark(before,site.id));
      return;
    }
    setWaypoint(null);setBoardPinned(false);setDoorPin(null);
    setLandmarkPin(value=>value===site.id?null:site.id);
  };
  const goalPoint=objective?.point;
  const goalNear=!!goalPoint&&adventureDistance(actor,goalPoint)<=1;
  const workAction:Interaction|undefined=goalNear&&objective?.action?
    objective.action==='gather'?
      {label:'Gather food',point:goalPoint,run:()=>performAction(gatherErrand)}:
      {label:'Deliver supplies',point:goalPoint,run:()=>performAction(deliverErrand,true)}:
    undefined;
  const enterBuilding=(site:MortalBuilding)=>{
    const before=current.current,ref=buildingRef(site);
    const door=findInteriorBuilding(before,ref);
    const player=before.agents.find(a=>a.id===actor.id);
    if(!player||!door||door.distance>1){
      setFocus({building:buildingKey(site)});setMessage('');return false;
    }
    const actual=adventureRegion(before,adventureMapFor(before),player);
    if(!actual.area.has(door.entrance.y*before.width+door.entrance.x))return false;
    const approach=door.distance===0?before:walkAdventure(before,actual,
      door.entrance.x-player.x,door.entrance.y-player.y,false).world;
    const entered=enterMortalRoom(approach,ref);
    if(entered===approach){
      setMessage('The doorway is blocked.');return false;
    }
    clear();setDoorPin(null);setResidentTarget(null);setFacing('north');commit(entered);
    return true;
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
    setBoardPinned(false);setLandmarkPin(null);setDoorPin(null);
    const destination=exit.destination;
    const ahead=destination.kind==='route'?
      (adventurePlaceKey(destination.to)===scene?destination.from:destination.to):null;
    setWaypoint(ahead?adventurePlaceKey(ahead):null);
    clear();
  };
  const speak=(personId:number,action:MortalAction,inside=false)=>{
    const before=current.current;
    const place=inside&&occupiedMortalRoom(before),position=before.descent?.interior?.position;
    if(inside&&(!place||!position||!livingHousehold(before,place).present.some(resident=>
      resident.agent.id===personId&&adventureDistance(resident.position,position)<=1))){
      setResidentTarget(null);
      setMessage('They have moved away.');return;
    }
    const result=interactWithMortal(before,personId,action,inside?'home':'outside');
    if(result.world!==before)commit(result.world);
    setMessage(result.message);
  };
  const gateAction=(g:AdventureGate):Interaction=>({
    label:(g.ferry?'Sail to ':g.destination.kind==='river'?'Follow ':
      g.destination.kind==='route'?'Take trail to ':'Enter ')+g.label,
    run:()=>travel(g),point:g.point,
  });
  const buildingAction=(site:MortalBuilding):Interaction=>{
    const enterable=canEnterMortalBuilding(world,site);
    return {label:(enterable?'Enter ':'Inspect ')+BUILDING_LABELS[site.building.type].toLowerCase(),
      run:()=>enterBuilding(site),point:enterable&&site.distance>0?site.entrance:site.building};
  };
  const personAction=(person:Agent):Interaction=>({
    label:'Talk to '+mortalName(world,person),run:()=>selectPerson(person),point:person,
  });
  const inspectItem=(point:Point)=>{
    const before=current.current,outcome=interactWithInteriorProp(before,point);
    const position=before.descent?.interior?.position;
    if(position)setFacing(value=>directionBetween(position,point,value));
    if(outcome.world!==before)commit(outcome.world);
    setResidentTarget(null);setMessage(outcome.message);
  };
  const selectResident=(id:number)=>{
    const resident=residents.find(r=>r.agent.id===id);
    if(!interior||!resident||adventureDistance(interior.position,resident.position)>1)return;
    setFacing(value=>directionBetween(interior.position,resident.position,value));
    setResidentTarget(id);setMessage('');
  };
  const boardShip=()=>{
    if(!berth)return;
    if(berthDistance>1){setMarkedBerth(value=>!value);return;}
    const result=launchShip(current.current,berth);
    if(result.moved)commit(result.world);
    else setMessage(result.reason??'The berth is unavailable.');
  };
  const exploreCave=(target:TidalCave)=>{
    const before=current.current;
    const low=coastTide(before).low;
    const result=low?enterTideCave(before,target.mouth):waitForCaveTide(before,target.mouth);
    if(result.moved){
      clear();commit(result.world);
      if(!low)setMessage('The tide has fallen. The sand below the arch is exposed.');
    }else setMessage(result.reason??'Approach the ledge.');
  };
  const caveAction:Interaction|undefined=caveNear&&cave?
    {label:tide.low?'Enter sea cave':'Wait for low tide',point:cavePoint,run:()=>exploreCave(cave)}:undefined;
  let actions:Interaction[];
  if(interior&&interiorSite){
    const position=interior.position;
    actions=[
      ...(atInteriorDoor(position)?[{label:'Exit building',run:exitInterior,
        point:{x:INTERIOR_DOOR.x,y:INTERIOR_DOOR.y+1}}]:[]),
      ...residents.filter(r=>adventureDistance(r.position,position)<=1).map(r=>({
        label:'Talk to '+mortalName(world,r.agent),point:r.position,
        run:()=>selectResident(r.agent.id),
      })),
      ...roomItems.filter(item=>adventureDistance(item,position)<=1).map(item=>({
        label:interiorPropAction(item.kind),point:item,run:()=>inspectItem(item),
      })),
    ];
  }else{
    const surveyActions=closeLandmark?[{label:'Survey landmark',point:closeLandmark,
      run:()=>selectLandmark(closeLandmark)}]:[];
    const exits=gates.filter(g=>g.distance<=1).map(g=>gateAction(g.gate));
    actions=[
      ...(berthDistance<=1?[{label:boatLabel,point:berthPoint,run:boardShip}]:[]),
      ...(workAction?[workAction]:[]),
      ...(caveAction?[caveAction]:[]),
      ...(region.place.kind==='wild'?[...surveyActions,...exits]:[...exits,...surveyActions]),
      ...buildings.filter(site=>site.distance===0).map(buildingAction),
      ...(boardNear?[{label:'Read town board',run:openBoard,point:board}]:[]),
      ...nearby.map(personAction),
      ...buildings.filter(site=>site.distance===1).map(buildingAction),
    ];
  }
  actions=facingActions(actions,interior?.position??actor,facing);
  const primary=actions[0];
  const closeRoomDialogue=()=>{setResidentTarget(null);setMessage('');};
  const interact=()=>{
    if(showBoard){setBoardOpen(false);return;}
    if(interior&&residentTarget!==null){closeRoomDialogue();return;}
    if(focusedBuilding){enterBuilding(focusedBuilding);return;}
    if(focusedPerson){clear();return;}
    primary?.run();
  };
  const escape=()=>{
    if(interior){
      if(residentTarget!==null)closeRoomDialogue();
      else exitInterior();
    }else clear();
  };
  const move=({x,y}:Point)=>{
    const before=current.current;
    const player=before.agents.find(a=>a.id===actor.id);
    if(!player)return 150;
    setFacing(directionBetween({x:0,y:0},{x,y}));
    const room=before.descent?.interior,inside=room&&occupiedMortalRoom(before);
    if(room&&inside){
      if(atInteriorDoor(room.position)&&y===1){exitInterior();return 265;}
      const occupants=livingHousehold(before,inside).present;
      const occupied=new Set(occupants.map(resident=>
        resident.position.x+':'+resident.position.y));
      const next=moveInside(inside.building.type,room.position,x,y,occupied);
      if(next!==room.position){
        commit({...before,descent:{...before.descent!,interior:{...room,position:next}}});
        closeRoomDialogue();
      }
      return 150;
    }
    const liveMap=adventureMapFor(before),actual=adventureRegion(before,liveMap,player);
    const forward={x:player.x+x,y:player.y+y};
    const building=liveMap.buildings.get(forward.y*before.width+forward.x);
    if(building&&equal(building.building,forward)&&isMortalSolidBuilding(building.building)){
      const doorway=findInteriorBuilding(before,{
        settlementId:building.settlementId,buildingId:building.building.id,
      });
      if(doorway?.distance===0&&enterBuilding(doorway))return 265;
    }
    const step=walkAdventure(before,actual,x,y,false);
    if(step.moved){commit(step.world);clear();}
    else if(step.reason)setMessage(step.reason);
    return mortalMovementDelay(player);
  };
  const controls=useAdventureControls({move,interact,escape,pause:toggleTime});
  const selectRoomTile=(point:Point)=>{
    if(!interior)return;
    if(point.x===INTERIOR_DOOR.x&&point.y>=INTERIOR_DOOR.y&&point.y<=INTERIOR_DOOR.y+1&&
      adventureDistance(interior.position,INTERIOR_DOOR)<=1){exitInterior();return;}
    const resident=residents.find(r=>equal(r.position,point));
    if(resident){selectResident(resident.agent.id);return;}
    if(roomItems.some(item=>equal(item,point)))inspectItem(point);
  };
  const selectTile=(point:Point)=>{
    if(showBoard)return;
    const index=point.y*world.width+point.x;
    if(berth&&(index===berth.shore||index===berth.water)){boardShip();return;}
    const mouth=caves.find(c=>c.mouth===index);
    if(mouth){
      if(tide.low&&distanceToCave(mouth)<=1)exploreCave(mouth);
      else{setCavePin(mouth.mouth);if(distanceToCave(mouth)<=1)setMessage('Wait until the tide exposes the sand.');}
      return;
    }
    if(workAction?.point&&equal(workAction.point,point)){
      workAction.run();return;
    }
    if(board&&equal(board,point)){selectBoard();return;}
    const exit=gates.find(g=>equal(g.gate.point,point));
    if(exit){
      if(exit.distance<=1)travel(exit.gate);
      else pinGate(exit.key);
      return;
    }
    const ruin=unsurveyed.find(site=>equal(site,point));
    if(ruin){selectLandmark(ruin);return;}
    const plot=map.buildings.get(point.y*world.width+point.x);
    const tileBuilding=plot&&equal(plot.building,point)?
      findMortalBuilding(world,{settlementId:plot.settlementId,buildingId:plot.building.id}):null;
    const site=buildings.find(b=>equal(b.entrance,point))??tileBuilding;
    if(site&&region.area.has(site.entrance.y*world.width+site.entrance.x)){
      if(canEnterMortalBuilding(world,site)){enterBuilding(site);return;}
      if(findInteriorBuilding(world,buildingRef(site))){
        clear();setWaypoint(null);setBoardPinned(false);setLandmarkPin(null);
        setDoorPin(buildingRef(site));
      }else if(site.distance<=2){
        setFocus({building:buildingKey(site)});setMessage('');
      }
      return;
    }
    const person=nearby.find(a=>equal(a,point));
    if(person){selectPerson(person);return;}
  };
  const name=mortalName(world,actor);
  const regionDetails=region.ends?region.ends.join(' ↔ '):region.settlement?
    LANDSCAPE_NAME[region.landscape]+' · '+settlementStage(region.settlement):
    LANDSCAPE_NAME[region.landscape];
  const routeMessage=region.place.kind==='route'?'Follow the path to a signpost.':
    gates.some(({gate})=>gate.ferry)?'Follow the path to a trail or ferry landing.':
      gates.length?'Follow a signpost to take a trail.':region.settlement?
        'No routes reach this settlement yet.':'No settlements are reachable from here yet.';
  const showAction=!showBoard&&!focusedPerson&&!focusedBuilding&&residentTarget===null;
  const doorHint=markedDoor?
    BUILDING_LABELS[markedDoor.building.type]+' doorway · '+
      (markedDoor.distance===0?'At the doorstep':markedDoor.distance+' tiles '+directionTo(actor,markedDoor.entrance)):
    '';
  const movementControls=(
    <div className="adventure-controls" role="group" aria-label="Adventure controls">
      <AdventureDirections controls={controls}/>
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
        {!showBoard&&errandMessage?<p className="adventure-errand-feedback" role="status">
          {errandMessage}</p>:!interior&&showAction&&<p className="adventure-feedback"
          role="status">{message||doorHint||(!primary&&gates.length?routeMessage:'')}</p>}
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
          <p>{interiorSite?region.name+' · Indoors':regionDetails}</p>
          <h1 aria-live="polite">{interiorSite?interiorTitle(interiorSite.building.type):region.name}</h1>
        </div>
        <time>{MONTH_NAMES[date.month]} {date.day} <span>· Year {date.year}</span></time>
      </header>
      {notice&&<p className="adventure-feedback" role="status">{notice}</p>}
      <div className="adventure-layout">
        <div className="adventure-stage">
          {interior&&interiorSite?<MortalInterior key={buildingKey(interiorSite)}
            world={world} site={interiorSite} position={interior.position} message={message}
            facing={facing} marked={primary?.point} targetId={residentTarget} compact
            onSelectResident={selectResident} onSelectTile={selectRoomTile}
            onTalk={action=>{if(residentTarget!==null)speak(residentTarget,action,true);}}
            onCloseConversation={closeRoomDialogue}
            onExit={exitInterior}>{movementControls}</MortalInterior>:<>
            <div className="adventure-picture" key={scene}>
              <AdventureCanvas world={world} map={map} region={region} actor={actor} facing={facing}
                board={board} landmarks={landmarks} caves={caves} gather={objective?.action==='gather'?goalPoint:undefined}
                focused={focusedBuilding?.building??markedDoor?.building}
                marked={focusedBuilding?.entrance??focusedPerson??markedDoor?.entrance??
                  (markedBerth?berthPoint:undefined)??(boardPinned?board:undefined)??pinned?.gate.point??markedLandmark??
                  (cavePin!==null&&cave?.mouth===cavePin?cavePoint:undefined)??
                  goalPoint??(markRiver?nextBank:undefined)??primary?.point??null}
                onSelect={selectTile}/>
              {showBoard?<TownNoticeBoard world={world} journal={journal}
                offers={availableErrands(world,region)} objective={objective}
                canDeliver={goalNear&&objective?.action==='deliver'} message={errandMessage}
                onAccept={order=>performAction(before=>acceptErrand(before,order),true)}
                onDeliver={()=>performAction(deliverErrand,true)}
                onMeal={()=>performAction(buyMeal)} onClose={()=>setBoardOpen(false)}/>:
                <MortalHUD world={world} person={focusedPerson} site={focusedBuilding}
                  message={message} onClose={clear}
                  onEnter={()=>{if(focusedBuilding)enterBuilding(focusedBuilding);}}
                  onTalk={action=>{if(focusedPerson)speak(focusedPerson.id,action);}}/>}
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
              {(journal.coins>0||journal.history.length>0)&&
                <span className="adventure-purse">{coinLabel(journal.coins)}</span>}
            </div>
          </section>
          {!interior&&berthPoint&&<section className="adventure-exits" aria-label="Shipyard and mooring">
            <h2>{ownBerth?'Sailboat mooring':'Shipyard'}</h2>
            <button onClick={boardShip} aria-pressed={berthDistance>1?markedBerth:undefined}>
              <span className="adventure-direction" aria-hidden="true">{berthDistance<=1?'≈':directionTo(actor,berthPoint)}</span>
              <span><strong>{berthDistance<=1?boatLabel:ownBerth?'Mark sailboat':'Mark shipyard'}</strong>
                {berthDistance>1&&<small>{berthDistance} tiles {directionTo(actor,berthPoint)}</small>}</span>
              <span aria-hidden="true">›</span>
            </button>
          </section>}
          {!interior&&!berthPoint&&mooring&&<section className="adventure-exits">
            <h2>Sailboat mooring</h2>
            <p>{adventureDistance(actor,seaPoint(world.width,mooring.shore))} tiles {directionTo(actor,seaPoint(world.width,mooring.shore))}</p>
          </section>}
          {!interior&&cave&&cavePoint&&<section className="adventure-exits tidal-status" aria-label="Sea cave">
            <h2>{cave.name}</h2>
            <p>{tide.low?'Low tide · Sand exposed':'High tide · Low tide in '+tide.untilLow+
              (tide.untilLow===1?' day':' days')}</p>
            {(!caveNear||primary!==caveAction||!showAction)&&<button onClick={()=>{
              if(caveNear)exploreCave(cave);
              else{clear();setCavePin(value=>value===cave.mouth?null:cave.mouth);}
            }} aria-pressed={caveNear?undefined:cavePin===cave.mouth}>
              <span className="adventure-direction" aria-hidden="true">⌂</span>
              <span><strong>{caveNear?caveAction?.label:'Mark cave entrance'}</strong>
                {!caveNear&&<small>{distanceToCave(cave)} tiles {directionTo(actor,cavePoint)}</small>}</span>
              <span aria-hidden="true">›</span>
            </button>}
          </section>}
          {!interior&&<CoastalJournal world={world}/>}
          {(!interior||activeErrand)&&<ErrandTracker world={world} journal={journal}
            objective={objective}
            readyAction={!interior&&!showBoard&&workAction&&(!showAction||primary!==workAction)?
              workAction:undefined}
            directions={goalPoint?(goalNear?'In reach':adventureDistance(actor,goalPoint)+
              ' tiles '+directionTo(actor,goalPoint)):undefined}
            boardLabel={!interior&&!showBoard&&board&&primary?.label!=='Read town board'?
              (boardNear?'Read town board':
              (boardPinned?'Board marked · ':'Mark town board · ')+adventureDistance(actor,board)+
              ' tiles '+directionTo(actor,board)):undefined}
            abandonLabel={activeErrand&&abandonErrandLabel(world,region,actor,activeErrand)}
            onBoard={selectBoard} onAbandon={()=>performAction(abandonErrand,true)}/>}
          {!interior&&river&&<section className="adventure-exits" aria-label="River trail progress">
            <h2>Downstream</h2>
            {nextStop&&nextBank?<button type="button" aria-pressed={markRiver}
              onClick={()=>setMarkRiver(on=>!on)}>
              {nextStop.label} · {adventureDistance(actor,nextBank)} tiles {directionTo(actor,nextBank)}
            </button>:<p>You reached the downstream shore.</p>}
            {world.settings.riverlands&&waterSeason(world)==='Bloom'&&
              <p>Spring floods can cover low trails. Look for higher banks or boardwalks.</p>}
          </section>}
          {!interior&&<section className="adventure-exits">
            <h2>{region.place.kind==='route'?'Trail ends':
              gates.some(({gate})=>gate.ferry)?'Trails & ferries':'Trails'}</h2>
            {gates.length?<ul>{gates.map(({gate,distance,key})=><li key={key}>
              <button onClick={()=>distance<=1?travel(gate):
                pinGate(key)}
                aria-pressed={distance>1?waypoint===key:undefined}
                title={gate.ferry?(distance<=1?'Board ferry':'Mark ferry landing'):
                  distance<=1?'Use this signpost':'Mark this signpost'}>
                <span className="adventure-direction" aria-hidden="true">
                  {distance<=1?(gate.ferry?'≈':gate.landmark?'✧':'•'):directionTo(actor,gate.point)}
                </span>
                <span><strong>{gate.label}</strong>
                  <small>{distance<=1?(gate.ferry?'Ferry · '+gate.ferry.seaTiles+' sea tiles':
                    'At the signpost'):(gate.ferry?'Ferry · ':'')+
                    distance+' tiles '+directionTo(actor,gate.point)}</small></span>
                <span aria-hidden="true">›</span>
              </button>
            </li>)}</ul>:<p>{routeMessage}</p>}
          </section>}
          <FieldJournal world={world} site={showBoard?undefined:landmark}
            directions={landmark?adventureDistance(actor,landmark)+' tiles '+directionTo(actor,landmark):undefined}
            near={!!landmark&&adventureDistance(actor,landmark)<=1} marked={!!markedLandmark}
            onExplore={landmark&&!(showAction&&primary?.point===landmark&&
              primary.label==='Survey landmark')?()=>selectLandmark(landmark):undefined}/>
        </aside>
      </div>
    </main>
  </div>;
}
