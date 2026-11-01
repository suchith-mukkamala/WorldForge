/** v2.5.1 — direct mortal control. Everything here edits the authoritative
 * world without consuming simulation RNG or generating unbounded histories. */
import type {Agent,World} from './engine';
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
  const present=w.agents.reduce((count,a)=>count+(a.id!==id&&a.x===x&&a.y===y?1:0),0);
  if(present>=mortalTileCapacity(w,x,y))
    return {world:w,moved:false,reason:'Too crowded to move through.'};
  const effort=terrainStepEffort(w,from,to);
  const cognition=actor.cognition?cloneCognition(actor.cognition):undefined;
  if(cognition&&cognition.trail.at(-1)!==to){
    cognition.trail.push(to);
    if(cognition.trail.length>24)cognition.trail.shift();
  }
  const next:Agent={...actor,x,y,cognition,
    energy:Math.round(clamp(actor.energy-.018*effort,0,100)*100)/100};
  return {world:{...w,agents:w.agents.map(a=>a.id===id?next:a)},moved:true};
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
