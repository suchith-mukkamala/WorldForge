/** v2.5.3 — mortal exploration. Everything here edits the authoritative
 * world without consuming simulation RNG or generating unbounded histories. */
import type {Agent,World} from './engine';
import {BUILDING_LABELS,buildingAppearance,
  type Building} from './construction';
import {createDepthProjector,type DepthCamera} from './depthProjection';
import {SEA_LEVEL} from './topography';
import {terrainStepEffort} from './terrainPhysics';
import {cloneCognition} from './mindII';
import {cloneDailyLife,initialDailyLife,
  type Encounter,type Familiarity} from './dailyLife';
import {cloneDevelopment} from './development';
import {refusesConversation} from './socialJudgment';
import {rememberSocialEpisode} from './socialMemory';
import {personName} from './identity';
import {traitProfile} from './family';

export type MortalKey='w'|'a'|'s'|'d';
export type MortalAction='greet'|'ask'|'help';
export type MortalStep={world:World;moved:boolean;reason?:string};
export type MortalTalk={world:World;accepted:boolean;message:string};
export type MortalBuilding={settlementId:number;settlementName:string;
  building:Building;entrance:{x:number;y:number};distance:number};
const clamp=(value:number,min:number,max:number)=>
  Math.max(min,Math.min(max,value));
const range=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));

/** Translate screen-space WASD to eight neighboring world cells. Orbit yaw
 * changes the visual axes, but never the saved tile coordinates or physics. */
export function mortalDirection(keys:ReadonlySet<MortalKey>,camera:DepthCamera):
  {dx:number;dy:number}|null{
  const sx=Number(keys.has('d'))-Number(keys.has('a'));
  const sy=Number(keys.has('s'))-Number(keys.has('w'));
  if(!sx&&!sy)return null;
  const projection=createDepthProjector({width:4,height:4},1,camera);
  const origin=projection.project(0,0,SEA_LEVEL);
  let best=-Infinity,chosen={dx:0,dy:0};
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const p=projection.project(dx,dy,SEA_LEVEL);
    const vx=p.x-origin.x,vy=p.y-origin.y;
    const dot=(vx*sx+vy*sy)/Math.hypot(vx,vy);
    if(dot>best){best=dot;chosen={dx,dy};}
  }
  return chosen;
}

/** Equivalent to density.tileCapacity at a single destination without
 * allocating and scanning the whole world grid on every key press. */
export function mortalTileCapacity(w:World,x:number,y:number):number{
  let capacity=1;
  for(const s of w.settlements){
    const dx=Math.abs(x-s.x),dy=Math.abs(y-s.y);
    if(dx>5||dy>5)continue;
    capacity=Math.max(capacity,dx<=2&&dy<=2?3:2);
  }
  return capacity;
}

/** Only constructed physical structures occupy a solid plot. Farms and
 * unbuilt foundations remain traversable; houses are not enlarged to match
 * their decorative pixel-art roofs. */
function solidBuildingAt(w:World,x:number,y:number):Building|undefined{
  for(const settlement of w.settlements){
    if(Math.abs(settlement.x-x)>14||Math.abs(settlement.y-y)>14)continue;
    const building=settlement.infrastructure?.buildings.find(b=>
      b.x===x&&b.y===y&&b.stage!=='foundation'&&b.type!=='farm'&&
      b.type!=='well'&&b.type!=='dock');
    if(building)return building;
  }
  return undefined;
}

function walkablePlot(w:World,x:number,y:number):boolean{
  if(x<0||y<0||x>=w.width||y>=w.height)return false;
  const index=y*w.width+x;
  if(w.tiles[index].biome==='water'&&
    !w.transport?.bridges.some(b=>b.index===index&&b.condition>25))return false;
  return !solidBuildingAt(w,x,y);
}

/** One stable doorway on the navigable side of each real structure. Roads
 * take priority; ties face the settlement, so the marker never moves when
 * the camera rotates or the visitor changes position. */
export function mortalBuildingEntrance(w:World,
  settlement:World['settlements'][number],building:Building):{x:number;y:number}{
  const road=new Set(settlement.infrastructure?.roads??[]);
  const candidates=[[0,1],[1,0],[0,-1],[-1,0]]
    .map(([dx,dy],index)=>({x:building.x+dx,y:building.y+dy,index}))
    .filter(p=>walkablePlot(w,p.x,p.y));
  candidates.sort((a,b)=>
    Number(road.has(b.y*w.width+b.x))-Number(road.has(a.y*w.width+a.x))||
    range(a,settlement)-range(b,settlement)||a.index-b.index);
  return candidates[0]??{x:building.x,y:building.y};
}

/** Local, read-only points of interest. No separate fake building state. */
export function nearbyMortalBuildings(w:World,limit=3):MortalBuilding[]{
  const id=w.descent?.mode==='mortal'?w.descent.agentId:null;
  const actor=id===null?undefined:w.agents.find(a=>a.id===id);
  if(!actor)return [];
  const found:MortalBuilding[]=[];
  for(const settlement of w.settlements){
    if(range(actor,settlement)>18)continue;
    for(const building of settlement.infrastructure?.buildings??[]){
      if(range(actor,building)>4)continue;
      const entrance=mortalBuildingEntrance(w,settlement,building);
      const distance=range(actor,entrance);
      if(distance<=2)found.push({settlementId:settlement.id,
        settlementName:settlement.name,building,entrance,distance});
    }
  }
  return found.sort((a,b)=>a.distance-b.distance||
    a.settlementId-b.settlementId||a.building.id-b.building.id).slice(0,limit);
}

export function describeMortalBuilding(w:World,site:MortalBuilding):string{
  const {building}=site;
  const residents=building.householdId===undefined?null:
    w.households?.find(h=>h.id===building.householdId);
  const count=residents?.members.filter(id=>w.agents.some(a=>a.id===id)).length??0;
  const description=building.stage==='complete'?
    buildingAppearance(building):building.stage==='ruin'?'A ruined structure':
    building.stage==='abandoned'?'An abandoned building':
    `A ${BUILDING_LABELS[building.type].toLowerCase()} under construction`;
  const family=residents?` ${count} living household member${count===1?'':'s'} call this home.`:'';
  return `${description} in ${site.settlementName}.${family}`;
}

export function walkMortal(w:World,dx:number,dy:number):MortalStep{
  const id=w.descent?.mode==='mortal'?w.descent.agentId:null;
  const actor=id===null?undefined:w.agents.find(a=>a.id===id);
  if(!actor)return {world:w,moved:false,reason:'Descend into a living mortal first.'};
  if(!Number.isInteger(dx)||!Number.isInteger(dy)||
    Math.abs(dx)>1||Math.abs(dy)>1||!dx&&!dy)
    return {world:w,moved:false,reason:'Invalid movement direction.'};
  const x=actor.x+dx,y=actor.y+dy;
  if(x<0||y<0||x>=w.width||y>=w.height)
    return {world:w,moved:false,reason:'You have reached the edge of the world.'};
  const to=y*w.width+x,from=actor.y*w.width+actor.x;
  const bridged=w.transport?.bridges.some(b=>b.index===to&&b.condition>25);
  if(w.tiles[to].biome==='water'&&!bridged)
    return {world:w,moved:false,reason:'Deep water blocks your path.'};
  if(solidBuildingAt(w,x,y))return {world:w,moved:false,
    reason:'A building occupies this plot. Walk around to its doorway and press E.'};
  // Two solid plots cannot be traversed through their shared diagonal
  // corner, even when the destination itself is clear.
  if(dx&&dy&&!walkablePlot(w,actor.x+dx,actor.y)&&
    !walkablePlot(w,actor.x,actor.y+dy))
    return {world:w,moved:false,reason:'The corner is too narrow to pass.'};
  const occupants=w.agents.filter(a=>a.id!==id&&a.x===x&&a.y===y);
  // A populated street should not become an impassable wall. Let one nearby
  // inhabitant trade places with the mortal instead of ignoring tile caps or
  // pushing a crowd into another already-full square.
  const needsYield=occupants.length>=mortalTileCapacity(w,x,y);
  const carriers=new Set((w.shipments??[]).map(s=>s.carrierId));
  const yielding=needsYield?occupants.find(a=>
    !a.work?.tradeId&&!carriers.has(a.id)):undefined;
  if(needsYield&&!yielding)
    return {world:w,moved:false,reason:'The way is temporarily blocked.'};
  const effort=terrainStepEffort(w,from,to);
  const cognition=actor.cognition?cloneCognition(actor.cognition):undefined;
  if(cognition&&cognition.trail.at(-1)!==to){
    cognition.trail.push(to);
    if(cognition.trail.length>24)cognition.trail.shift();
  }
  const next:Agent={...actor,x,y,cognition,
    energy:Math.round(clamp(actor.energy-.018*effort,0,100)*100)/100};
  const displaced=yielding?{...yielding,x:actor.x,y:actor.y}:undefined;
  return {world:{...w,agents:w.agents.map(a=>a.id===id?next:
    a.id===yielding?.id?displaced!:a)},moved:true};
}

/** Gentle corner assistance for a held direction. Only try adjacent headings
 * that still have forward progress; never pathfind through water or walls or
 * convert an invalid input into a move. The canonical move stays grid-based. */
export function walkMortalWithAssist(w:World,dx:number,dy:number):MortalStep{
  const direct=walkMortal(w,dx,dy);
  if(direct.moved||!direct.reason||
    !/(building|blocked|corner)/i.test(direct.reason)||
    !Number.isInteger(dx)||!Number.isInteger(dy)||
    Math.abs(dx)>1||Math.abs(dy)>1||!dx&&!dy)return direct;
  const alternatives=dx&&dy?[[dx,0],[0,dy]]:
    dx?[[dx,1],[dx,-1]]:[[1,dy],[-1,dy]];
  for(const [ax,ay] of alternatives){
    const attempt=walkMortal(w,ax,ay);
    if(attempt.moved)return attempt;
  }
  return direct;
}

export function nearbyMortals(w:World,limit=5):Agent[]{
  const id=w.descent?.mode==='mortal'?w.descent.agentId:null;
  const actor=id===null?undefined:w.agents.find(a=>a.id===id);
  if(!actor)return [];
  return w.agents.filter(a=>a.id!==id&&range(a,actor)<=2)
    .sort((a,b)=>range(a,actor)-range(b,actor)||a.id-b.id)
    .slice(0,limit);
}

function rememberContact(contacts:Familiarity[],personId:number,regard:number){
  const found=contacts.find(c=>c.personId===personId);
  if(found){found.meetings=Math.min(999,found.meetings+1);
    found.regard=clamp((found.regard??0)+regard,-100,100);return;}
  if(contacts.length>=6)contacts.shift();
  contacts.push({personId,meetings:1,regard});
}
function rememberEncounter(agent:Agent,otherId:number,kind:Encounter['kind'],
  topic:Encounter['topic'],detail:string,year:number,day:number){
  if(!agent.dailyLife)return;
  agent.dailyLife.encounters.push({year,day,withId:otherId,kind,topic,
    detail:detail.slice(0,140)});
  if(agent.dailyLife.encounters.length>6)agent.dailyLife.encounters.shift();
  rememberContact(agent.dailyLife.acquaintances,otherId,
    kind==='comfort'?7:kind==='conversation'?2:3);
  agent.dailyLife.socialNeed=clamp(agent.dailyLife.socialNeed-3,0,100);
  agent.dailyLife.morale=clamp(agent.dailyLife.morale+(kind==='comfort'?3:1),0,100);
  if(agent.development&&kind==='comfort'){
    agent.development=cloneDevelopment(agent.development);
    rememberSocialEpisode(agent.development,kind,otherId,year);
  }
}

/** NPCs can decline. Once per in-world day per person keeps familiarity and
 * rare skill growth from being farmed by repeated clicking or key presses. */
export function interactWithMortal(w:World,targetId:number,
  action:MortalAction):MortalTalk{
  const id=w.descent?.mode==='mortal'?w.descent.agentId:null;
  const actor=id===null?undefined:w.agents.find(a=>a.id===id);
  const other=w.agents.find(a=>a.id===targetId);
  if(!actor||!other||actor.id===other.id)
    return {world:w,accepted:false,message:'No one is here to speak with.'};
  if(range(actor,other)>2)return {world:w,accepted:false,
    message:'Move closer to speak with this person.'};
  if(!['greet','ask','help'].includes(action))return {world:w,accepted:false,
    message:'Unknown interaction.'};
  const year=w.year,day=w.dayOfYear??0;
  if(actor.dailyLife?.encounters.some(e=>e.withId===targetId&&
    e.year===year&&e.day===day))return {world:w,accepted:false,
    message:'You have already spoken today. Give them some space.'};
  if(refusesConversation(actor.dailyLife?.acquaintances??[],
    other.dailyLife?.acquaintances??[],actor.id,other.id)||
    (other.dailyLife?.fatigue??0)>86)return {world:w,accepted:false,
    message:'They are not willing to talk right now.'};
  if(action==='help'&&actor.energy<6)return {world:w,accepted:false,
    message:'You are too exhausted to offer help.'};
  const player:Agent={...actor,dailyLife:cloneDailyLife(actor.dailyLife??initialDailyLife())};
  const target:Agent={...other,dailyLife:cloneDailyLife(other.dailyLife??initialDailyLife())};
  const name=personName(w,w.lineage.find(r=>r.id===target.id)??
    {id:target.id,species:target.species});
  const detail=action==='greet'?'Exchanged greetings at the roadside.':
    action==='ask'?'Talked about daily work, hopes and obligations.':
    'Shared supplies and comfort during a difficult day.';
  const kind:Encounter['kind']=action==='help'?'comfort':'conversation';
  const topic:Encounter['topic']=action==='ask'?'future':
    action==='help'?'hardship':'family';
  rememberEncounter(player,target.id,kind,topic,detail,year,day);
  rememberEncounter(target,player.id,kind,topic,detail,year,day);
  if(action==='help'){
    player.energy=Math.round(clamp(player.energy-3,0,100)*100)/100;
    target.energy=Math.round(clamp(target.energy+3,0,100)*100)/100;
  }
  const message=action==='greet'?`You greeted ${name}. A new acquaintance begins.`:
    action==='help'?`You shared some of your strength with ${name}.`:
    `${name}: ${other.dailyLife?.reason??'I am finding my place in this world.'}`;
  return {world:{...w,agents:w.agents.map(a=>a.id===id?player:
    a.id===targetId?target:a)},accepted:true,message};
}

export function mortalMovementDelay(agent:Agent):number{
  const fatigue=agent.dailyLife?.fatigue??0;
  const exhaustion=agent.energy<24?1.6:fatigue>75?1.35:1;
  return clamp(175/(traitProfile(agent.ancestry).speed||1)*exhaustion,95,320);
}
