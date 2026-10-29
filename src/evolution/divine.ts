/** Evolution Lab v0.6 — sandbox interventions with observable consequences.
 * Whispers may be refused; direct changes take effect. Everything is stored
 * in the world file and resolved deterministically from the world seed.
 */
import type {Agent,Biome,Species,World} from './engine';
import {appendLifeMoment,makeLifeRecord} from './identity';
import {birthPotentialRank,potentialRank} from './traitRanks';
import {birthInnateTrait,innateTrait} from './innateTraits';
import {initialDevelopment} from './development';
import {initialMind} from './mind';
import {editDeposit} from './resources';
import {reconcileTradeTerrain} from './economy';
import {reconcileTransportTerrain} from './transport';
import {generateTopography} from './topography';

export const DIVINE_ASPECTS=['health','lifespan','intelligence','fertility',
  'skill_growth','luck','courage','social'] as const;
export type DivineAspect=typeof DIVINE_ASPECTS[number];
export const INFLUENCES=['exploration','leadership','learning','cooperation',
  'faith','personal_goal'] as const;
export type Influence=typeof INFLUENCES[number];
export const DIVINE_VOICES=['whisper','dream','prophecy'] as const;
export type DivineVoice=typeof DIVINE_VOICES[number];
export type DivineResponse='accepted'|'resisted'|'reinterpreted';
export type DivineDuration='temporary'|'permanent'|'hereditary';
export type DivineEffect={id:number;sourceId:number;stat:DivineAspect;
  strength:number;hereditary:boolean;expires?:number;inheritedFrom?:number};
export type DivineWhisper={id:number;theme:Influence;words:string;
  voice:DivineVoice;response:DivineResponse;interpretedAs:Influence;until:number};
export type DivineActionKind='whisper'|'blessing'|'heal'|'resurrect'|
  'punish'|'summon'|'terrain';
export type DivineRecord={id:number;year:number;kind:DivineActionKind;
  targetId?:number;sourceId?:number;description:string;
  response?:DivineResponse;interpretations:Record<Species,string>};
export type DivineState={mode:'sandbox';nextId:number;history:DivineRecord[]};
export type DivineAction=
  |{kind:'whisper';personId:number;theme:Influence;voice?:DivineVoice;
    words:string;years:number}
  |{kind:'blessing';personId:number;stat:DivineAspect;strength:number;
    duration:DivineDuration;years:number}
  |{kind:'heal';personId:number}
  |{kind:'punish';personId:number;severity:number}
  |{kind:'resurrect';personId:number;x?:number;y?:number}
  |{kind:'summon';species:Species;x:number;y:number}
  |{kind:'terrain';biome:Biome;x:number;y:number};

const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
const round=(n:number)=>Math.round(n*1000)/1000;
const validPos=(w:World,x:number,y:number)=>Number.isInteger(x)&&
  Number.isInteger(y)&&x>=0&&y>=0&&x<w.width&&y<w.height;
const square=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export const divineState=():DivineState=>({mode:'sandbox',nextId:1,history:[]});
export const cloneDivine=(d:DivineState):DivineState=>({...d,
  history:d.history.map(r=>({...r,interpretations:{...r.interpretations}}))});
export const activeEffects=(a:Agent,year:number)=>
  (a.blessings??[]).filter(e=>e.expires===undefined||e.expires>=year);
/** Effects are additive, bounded and never alter the person's inherited DNA. */
export function divineFactor(a:Agent,stat:DivineAspect,year:number):number{
  const bonus=activeEffects(a,year).filter(e=>e.stat===stat)
    .reduce((sum,e)=>sum+e.strength,0);
  return clamp(1+bonus,.2,3);
}
export function mortalWhisper(a:Agent,year:number):DivineWhisper|undefined{
  return [...(a.whispers??[])].reverse().find(w=>
    w.until>=year&&w.response!=='resisted');
}
const interpretation=(kind:DivineActionKind,theme?:Influence):Record<Species,string>=>({
  human:kind==='whisper'?'A call to choose a new path.':'A sign that destiny can change.',
  elf:kind==='whisper'?'An echo in the old dreams.':'The ancient balance has shifted.',
  dwarf:kind==='whisper'?'A challenge to be tested by deeds.':'A mark of the world-forge.',
  demon:kind==='whisper'?'A test of freedom and personal will.':
    (theme==='faith'?'A new covenant to question.':'Power has answered a mortal.'),
});
const alternate:Record<Influence,Influence>={exploration:'learning',
  leadership:'cooperation',learning:'personal_goal',cooperation:'leadership',
  faith:'personal_goal',personal_goal:'exploration'};
const disposition=(a:Agent,theme:Influence)=>{
  const d=a.development;
  const value=theme==='cooperation'?'community':
    theme==='faith'?'tradition':theme==='leadership'?'independence':'discovery';
  return clamp(.45+(a.genes.curiosity-1)*.15+
    (a.genes.social-1)*.08+((d?.values[value]??50)-50)*.006+
    ((d?.trust??50)-50)*.003,.10,.86);
};
function responseFor(w:World,a:Agent,id:number,theme:Influence):DivineResponse{
  // Independent of tick order, and stable after export/import or replay.
  let n=(w.settings.seed^Math.imul(id,2654435761)^Math.imul(a.id,2246822519))>>>0;
  n=Math.imul(n^(n>>>16),2246822519);
  const roll=((n^(n>>>13))>>>0)/4294967296;
  const willing=disposition(a,theme);
  return roll<willing?'accepted':roll<willing+.23?'reinterpreted':'resisted';
}
function site(w:World,x:number,y:number){
  const occupied=new Set(w.agents.map(a=>a.y*w.width+a.x));
  if(!validPos(w,x,y))throw Error('Choose a tile within the world.');
  for(let radius=0;radius<=12;radius++){
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
      const px=x+dx,py=y+dy;
      if(!validPos(w,px,py)||occupied.has(py*w.width+px)||
        w.tiles[py*w.width+px].biome==='water')continue;
      return {x:px,y:py};
    }
  }
  throw Error('No free dry tile nearby for this intervention.');
}
function record(w:World,id:number,kind:DivineActionKind,description:string,
  targetId?:number,response?:DivineResponse,sourceId?:number){
  w.divine??=divineState();
  w.divine.history.push({id,year:w.year,kind,description:description.slice(0,200),
    ...(targetId?{targetId}:{}),...(sourceId?{sourceId}:{}),
    ...(response?{response}:{}),interpretations:interpretation(kind)});
  // The complete recent history is portable, with a fixed-size browser budget.
  if(w.divine.history.length>500)w.divine.history=w.divine.history.slice(-500);
  w.events.push({id:w.nextEventId++,year:w.year,type:'milestone',
    message:'Divine intervention: '+description.slice(0,150)});
  if(w.events.length>90)w.events=w.events.slice(-90);
  if(targetId!==undefined)appendLifeMoment(w,targetId,{year:w.year,
    kind:'divine',text:description.slice(0,200)});
}
/** The sandbox has no cooldown or resource costs. Preconditions prevent invalid saves. */
export function intervene(previous:World,action:DivineAction):World{
  const w:World={...previous,agents:previous.agents.map(a=>({...a,
    blessings:a.blessings?.map(e=>({...e})),whispers:a.whispers?.map(e=>({...e})),
    development:a.development?{...a.development,values:{...a.development.values}}:undefined})),
    lineage:previous.lineage.map(r=>({...r,moments:r.moments?.map(m=>({...m}))})),
    tiles:[...previous.tiles],deposits:previous.deposits?.map(d=>({...d})),
    events:[...previous.events],history:[...previous.history],
    tradeRelations:previous.tradeRelations?.map(r=>({...r})),
    divine:cloneDivine(previous.divine??divineState())};
  const id=w.divine!.nextId++;
  const person=('personId' in action)?w.agents.find(a=>a.id===action.personId):undefined;
  if('personId' in action&&action.kind!=='resurrect'&&!person)
    throw Error('Choose a living person to receive this intervention.');
  if(action.kind==='whisper'&&person){
    if(!INFLUENCES.includes(action.theme))throw Error('Unknown divine influence.');
    if(action.voice!==undefined&&!DIVINE_VOICES.includes(action.voice))
      throw Error('Unknown form of divine message.');
    if(!Number.isFinite(action.years))throw Error('Set a valid duration.');
    const years=clamp(Math.round(action.years),1,100);
    const response=responseFor(w,person,id,action.theme);
    const words=action.words.trim().slice(0,100)||'A voice urges a different path.';
    const interpretedAs=response==='reinterpreted'?alternate[action.theme]:action.theme;
    const voice=action.voice??'whisper';
    person.whispers=[...(person.whispers??[]).slice(-7),{id,theme:action.theme,
      voice,words,response,interpretedAs,until:w.year+years}];
    if(person.development){const d=person.development;
      d.values[response==='resisted'?'independence':
        interpretedAs==='cooperation'?'community':
        interpretedAs==='faith'?'tradition':'discovery']=clamp(
        d.values[response==='resisted'?'independence':
          interpretedAs==='cooperation'?'community':
          interpretedAs==='faith'?'tradition':'discovery']+.5,0,100);
    }
    record(w,id,'whisper','A '+voice+' of '+action.theme+' was '+response+
      (response==='reinterpreted'?' as '+interpretedAs:'')+'.',person.id,response);
  }else if(action.kind==='blessing'&&person){
    if(!DIVINE_ASPECTS.includes(action.stat)||!Number.isFinite(action.strength)||
      action.strength<-.8||action.strength>2)throw Error('Invalid divine modifier.');
    if(!['temporary','permanent','hereditary'].includes(action.duration))
      throw Error('Choose how long the blessing or curse lasts.');
    if(action.duration==='temporary'&&!Number.isFinite(action.years))
      throw Error('Set a valid duration.');
    const effect:DivineEffect={id,sourceId:person.id,stat:action.stat,
      strength:round(action.strength),hereditary:action.duration==='hereditary',
      ...(action.duration==='temporary'?{expires:w.year+
        clamp(Math.round(action.years),1,500)}:{})};
    person.blessings=[...(person.blessings??[]).slice(-23),effect];
    const mode=effect.hereditary?'hereditary':effect.expires?'temporary':'permanent';
    record(w,id,'blessing',mode+' '+action.stat+' '+
      (effect.strength>=0?'+':'')+Math.round(effect.strength*100)+'% applied.',person.id);
  }else if(action.kind==='heal'&&person){
    person.health=100;person.energy=100;
    // Divine healing can reverse an otherwise fatal ancient-site injury.
    person.mortalWound=undefined;
    record(w,id,'heal','Restored health and energy completely.',person.id);
  }else if(action.kind==='punish'&&person){
    if(!Number.isFinite(action.severity))throw Error('Invalid severity.');
    const damage=clamp(action.severity,1,99);
    person.health=round(Math.max(1,person.health-damage));
    person.energy=round(Math.max(0,person.energy-damage));
    record(w,id,'punish','Divine punishment dealt '+Math.round(damage)+' harm.',person.id);
  }else if(action.kind==='summon'){
    if(!['human','elf','dwarf','demon'].includes(action.species))
      throw Error('Choose a valid species.');
    const at=site(w,action.x,action.y);
    const profile={human:[16,74],elf:[36,245],dwarf:[27,166],demon:[23,137]}[action.species];
    const age=profile[0]+3,ancestry={human:0,elf:0,dwarf:0,demon:0};
    ancestry[action.species]=1;
    const agent:Agent={id:w.nextAgentId++,species:action.species,
      ancestry,generation:0,x:at.x,y:at.y,age,born:w.year-age,
      energy:98,health:100,genes:{vigor:1,curiosity:1,fertility:1,social:1},
      mind:initialMind(w.year)};
    agent.potentialRank=birthPotentialRank(w.settings.seed,agent.id,agent.genes);
    agent.innateTrait=birthInnateTrait(w.settings.seed,agent.id,agent.genes);
    agent.development=initialDevelopment(agent,w.tiles[at.y*w.width+at.x].biome);
    w.agents.push(agent);w.lineage.push(makeLifeRecord(w,agent));
    record(w,id,'summon','Summoned a '+action.species+' into the world.',agent.id);
  }else if(action.kind==='resurrect'){
    const past=w.lineage.find(r=>r.id===action.personId);
    if(!past||past.died===undefined)
      throw Error('Choose a deceased person while there is space for them.');
    const nearby=w.agents.find(a=>a.parents?.includes(past.id));
    const desired={x:action.x??nearby?.x??Math.floor(w.width/2),
      y:action.y??nearby?.y??Math.floor(w.height/2)};
    const at=site(w,desired.x,desired.y);
    const age={human:20,elf:42,dwarf:32,demon:27}[past.species];
    const restored:Agent={id:past.id,species:past.species,
      ancestry:{...past.ancestry},generation:past.generation,x:at.x,y:at.y,
      born:past.born,age,energy:95,health:100,genes:{...past.genes},
      knowledge:past.knownKnowledge?.map(k=>({...k})),
      ...(past.parents?{parents:[...past.parents] as [number,number]}:{}),
      mind:initialMind(w.year)};
    restored.potentialRank=potentialRank(w.settings.seed,past);
    restored.innateTrait=innateTrait(w.settings.seed,past);
    if(past.awakening)restored.awakening={...past.awakening};
    restored.development=initialDevelopment(restored,w.tiles[at.y*w.width+at.x].biome);
    w.agents.push(restored);past.died=undefined;
    record(w,id,'resurrect','Returned from death with a renewed adult body.',past.id);
  }else if(action.kind==='terrain'){
    if(!validPos(w,action.x,action.y))throw Error('Choose a tile within the world.');
    const idx=action.y*w.width+action.x;
    if(action.biome==='water'&&w.agents.some(a=>a.x===action.x&&a.y===action.y))
      throw Error('Move or relocate the occupant before flooding their tile.');
    const food={plains:7.5,forest:9.5,mountain:5,cave:4.5,
      wasteland:4.2,volcanic:3.7,water:0}[action.biome];
    if(food===undefined)throw Error('Unknown terrain type.');
    w.tiles[idx]={biome:action.biome,food:food*w.settings.resourceLevel};
    // God-mode terrain changes must invalidate the same elevation/drainage
    // fields as map-brush edits. Hydrology itself never changes the biome.
    w.topography=generateTopography(w.width,w.height,w.tiles,w.settings.seed);
    editDeposit(w,idx);
    reconcileTradeTerrain(w,idx);
    reconcileTransportTerrain(w,idx);
    record(w,id,'terrain','Transformed terrain at '+action.x+', '+action.y+
      ' into '+action.biome+'.');
  }
  // A direct summon or resurrection changes the current living census.
  if(action.kind==='summon'||action.kind==='resurrect'){
    const counts={human:0,elf:0,dwarf:0,demon:0};
    for(const a of w.agents)counts[a.species]++;
    w.history[w.history.length-1]={...w.history.at(-1)!,total:w.agents.length,...counts};
  }
  return w;
}

/** Called after newborn records are created, before developmental updates. */
export function inheritDivinity(w:World,baby:Agent,parents:[Agent,Agent]):void{
  const inherited=new Map<number,DivineEffect>();
  for(const parent of parents)for(const effect of activeEffects(parent,w.year)){
    if(!effect.hereditary)continue;
    const current=inherited.get(effect.id);
    if(!current||Math.abs(effect.strength)>Math.abs(current.strength))
      inherited.set(effect.id,{...effect,strength:round(effect.strength*.92),
        inheritedFrom:parent.id});
  }
  baby.blessings=[...inherited.values()].filter(e=>Math.abs(e.strength)>=.01)
    .slice(-24);
  if(baby.blessings.length){
    const origins=[...new Set(baby.blessings.map(e=>e.id))];
    const life=w.lineage.find(r=>r.id===baby.id);
    if(life)life.divineOrigins=origins;
    appendLifeMoment(w,baby.id,{year:w.year,kind:'divine',
      text:'Inherited '+origins.length+' blessing(s) or family curse(s).',
      relatedIds:parents.map(p=>p.id)});
  }
}

export function validDivinity(w:World):boolean{
  const validId=(n:number)=>Number.isSafeInteger(n)&&n>0;
  const validEffect=(e:DivineEffect)=>!!e&&validId(e.id)&&validId(e.sourceId)&&
    DIVINE_ASPECTS.includes(e.stat)&&Number.isFinite(e.strength)&&
    e.strength>=-.8&&e.strength<=2&&typeof e.hereditary==='boolean'&&
    (e.expires===undefined||Number.isInteger(e.expires)&&e.expires>=0)&&
    (e.inheritedFrom===undefined||validId(e.inheritedFrom));
  if(w.divine!==undefined){
    const d=w.divine;
    if(!d||d.mode!=='sandbox'||!validId(d.nextId)||
      !Array.isArray(d.history)||d.history.length>500||
      !d.history.every(e=>e&&validId(e.id)&&Number.isInteger(e.year)&&
        e.year>=0&&e.year<=w.year&&
        ['whisper','blessing','heal','resurrect','punish','summon','terrain'].includes(e.kind)&&
        typeof e.description==='string'&&e.description.length<=200&&
        (e.targetId===undefined||validId(e.targetId))&&
        (e.sourceId===undefined||validId(e.sourceId))&&
        (e.response===undefined||['accepted','resisted','reinterpreted'].includes(e.response))&&
        e.interpretations&&['human','elf','dwarf','demon'].every(s=>
          typeof e.interpretations[s as Species]==='string'&&
          e.interpretations[s as Species].length<=140)))return false;
  }
  return w.agents.every(a=>(a.blessings===undefined||
    Array.isArray(a.blessings)&&a.blessings.length<=24&&
    a.blessings.every(validEffect))&&
    (a.whispers===undefined||Array.isArray(a.whispers)&&a.whispers.length<=8&&
      a.whispers.every(q=>q&&validId(q.id)&&INFLUENCES.includes(q.theme)&&
        DIVINE_VOICES.includes(q.voice)&&
        INFLUENCES.includes(q.interpretedAs)&&typeof q.words==='string'&&
        q.words.length<=100&&['accepted','resisted','reinterpreted'].includes(q.response)&&
        Number.isInteger(q.until)&&q.until>=0)))&&
    w.lineage.every(r=>r.divineOrigins===undefined||
      Array.isArray(r.divineOrigins)&&r.divineOrigins.length<=24&&
      r.divineOrigins.every(validId));
}
