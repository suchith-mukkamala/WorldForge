/** Mind Engine I — explainable, deterministic utility-based choices.
 * No language model is invoked: each mind responds to observable needs,
 * relationships and remembered experience, then chooses where to travel.
 */
import type {Agent,Ancestry,Biome,World} from './engine';
import {divineFactor,mortalWhisper} from './divine';

export type MindGoal='forage'|'seek_safety'|'seek_family'|'seek_partner'|
  'stay_together'|'explore'|'venture'|'vocation'|'build'|'return_home'|
  'work'|'trade';
export type PlaceMemory={x:number;y:number;year:number};
export type AgentMind={goal:MindGoal;reason:string;since:number;
  target?:{x:number;y:number};targetPersonId?:number;lastScarcity?:PlaceMemory;
  lastGoodFood?:PlaceMemory};

export const MIND_GOALS:MindGoal[]=[
  'forage','seek_safety','seek_family','seek_partner','stay_together','explore',
  'venture','vocation','build','return_home','work','trade',
];
export const GOAL_LABELS:Record<MindGoal,string>={
  forage:'Gather food',seek_safety:'Find safer ground',
  seek_family:'Stay near family',seek_partner:'Find companionship',
  stay_together:'Stay with partner',explore:'Explore the world',
  venture:'Expedition beyond home',
  vocation:'Pursue a vocation',
  build:'Help construct a settlement',
  return_home:'Return to a permanent home',
  work:'Work for the community',trade:'Transport goods between settlements',
};
export const initialMind=(year:number):AgentMind=>({goal:'explore',
  reason:'Discovering a new world.',since:year});
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const inBounds=(w:World,x:number,y:number)=>
  x>=0&&y>=0&&x<w.width&&y<w.height;
const index=(w:World,x:number,y:number)=>y*w.width+x;
const edible=(w:World,x:number,y:number)=>
  inBounds(w,x,y)&&w.tiles[index(w,x,y)].biome!=='water';

/** Amount of forage reachable from a proposed location, not just its tile. */
export function foodAround(w:World,x:number,y:number):number{
  let sum=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(edible(w,x+dx,y+dy))sum+=w.tiles[index(w,x+dx,y+dy)].food;
  }
  return sum;
}

function nearestPerson(w:World,a:Agent,occupied:Map<number,number|number[]>,
  byId:Map<number,Agent>,eligible:(b:Agent)=>boolean,limit=6):Agent|undefined{
  let best:Agent|undefined,bestScore=Infinity;
  for(let dy=-limit;dy<=limit;dy++)for(let dx=-limit;dx<=limit;dx++){
    const x=a.x+dx,y=a.y+dy;
    if(!inBounds(w,x,y))continue;
    const id=occupied.get(index(w,x,y));
    for(const candidate of id===undefined?[]:Array.isArray(id)?id:[id]){
      const person=byId.get(candidate);
      if(!person||person.id===a.id||!eligible(person))continue;
      const score=distance(a,person)+Math.abs(a.genes.social-person.genes.social)*.1;
      if(score<bestScore||(score===bestScore&&person.id<(best?.id??Infinity))){
        best=person;bestScore=score;
      }
    }
  }
  return best;
}

function bestHabitat(w:World,a:Agent,goal:MindGoal,
  suitability:(ancestry:Ancestry,biome:Biome)=>number):{x:number;y:number}{
  let target={x:a.x,y:a.y},best=-Infinity;
  // A finite search horizon keeps this affordable for hundreds of inhabitants.
  // Memory discourages returning to a site that recently failed to feed them.
  for(let dy=-6;dy<=6;dy+=2)for(let dx=-6;dx<=6;dx+=2){
    const x=a.x+dx,y=a.y+dy;
    if(!edible(w,x,y))continue;
    const compatible=suitability(a.ancestry,w.tiles[index(w,x,y)].biome);
    const food=foodAround(w,x,y);
    const bad=a.mind?.lastScarcity;
    const remembered=bad&&w.year-bad.year<12&&distance({x,y},bad)<=2?14:0;
    const good=a.mind?.lastGoodFood;
    const familiar=good&&w.year-good.year<12&&distance({x,y},good)<=2?3.5:0;
    const score=(goal==='forage'?Math.min(food,45)*.48:Math.min(food,35)*.12)+
      compatible*(goal==='seek_safety'?21:11)-
      distance(a,{x,y})*.7-remembered+familiar;
    if(score>best){best=score;target={x,y};}
  }
  return target;
}

/** A nearby land-reachable waypoint outside the traveler's familiar terrain. */
function expedition(w:World,a:Agent):{x:number;y:number}|undefined{
  let best=-Infinity,target:AgentMind['target'];
  for(let dy=-21;dy<=21;dy+=3)for(let dx=-21;dx<=21;dx+=3){
    const x=a.x+dx,y=a.y+dy;
    if(!edible(w,x,y)||distance(a,{x,y})<7)continue;
    // A river is a genuine barrier until crossing technology exists. Pick
    // destinations reachable over land rather than sending minds into water.
    const steps=Math.max(Math.abs(dx),Math.abs(dy));
    let reachable=true;
    for(let i=1;i<=steps;i++){
      const px=Math.round(a.x+dx*i/steps),py=Math.round(a.y+dy*i/steps);
      if(!edible(w,px,py)){reachable=false;break;}
    }
    if(!reachable)continue;
    const biome=w.tiles[index(w,x,y)].biome;
    const newBiome=!a.development?.knownBiomes.includes(biome);
    const different=biome!==w.tiles[index(w,a.x,a.y)].biome;
    const variation=((a.id*7919+x*131+y*73+w.year*17)>>>0)%29;
    const score=(newBiome?65:different?35:-25)+variation*.25+
      Math.min(12,foodAround(w,x,y))*.10-distance(a,{x,y})*.20;
    if(score>best){best=score;target={x,y};}
  }
  return best>0?target:undefined;
}

export function planMind(w:World,a:Agent,occupied:Map<number,number|number[]>,
  byId:Map<number,Agent>,contacts:Map<number,number>,
  suitability:(ancestry:Ancestry,biome:Biome)=>number,
  traits:(ancestry:Ancestry)=>{maturity:number;lifespan:number},
  permanentHomes?:Map<number,{x:number;y:number}>):AgentMind{
  const prior=a.mind;
  const {maturity,lifespan}=traits(a.ancestry);
  const safe=suitability(a.ancestry,w.tiles[index(w,a.x,a.y)].biome);
  const adult=a.age>=maturity&&a.age<lifespan*.76;
  const whisper=mortalWhisper(a,w.year);
  const shipment=a.work?.tradeId?w.shipments?.find(t=>t.id===a.work?.tradeId):undefined;
  const employer=a.work?w.settlements.find(s=>s.id===a.work?.settlementId):undefined;
  let goal:MindGoal='explore',reason='Healthy and curious about the surroundings.';
  let target:AgentMind['target'],targetPersonId:number|undefined;
  const expeditionReady=a.age>=maturity*.85&&a.age<lifespan*.76&&
    a.energy>77&&a.health>76&&
    (a.development?.career==='scout'||
      a.genes.curiosity*divineFactor(a,'courage',w.year)>1.08||
      (a.development?.values.discovery??0)>57);
  const continuing=expeditionReady&&prior?.goal==='venture'&&prior.target&&
    w.year-prior.since<18&&distance(a,prior.target)>2;
  const construction=adult&&a.energy>=66&&a.health>=65&&
    (a.development?.career==='artisan'||
      (a.development?.values.community??50)>52&&(a.id+w.year)%3===0||
      (a.id+w.year)%9===0)?
    w.settlements.filter(s=>distance(a,s)<=8).map(s=>({s,
      project:s.infrastructure?.buildings.find(b=>
        b.stage==='foundation'||b.stage==='frame'||b.stage==='finishing')}))
      .find(v=>v.project):undefined;
  const residence=permanentHomes?
    permanentHomes.get(a.development?.householdId??-1):
    w.households?.find(h=>h.id===a.development?.householdId&&h.residence)?.home;
  const wantsHome=adult&&residence&&distance(a,residence)>4&&
    (a.energy<73||(w.year+a.id)%11===0);
  if(shipment&&a.energy>=44&&a.health>=40){
    // Caravans are real commitments. Workers can still interrupt the journey
    // for serious hunger or illness, but do not abandon it for ordinary forage.
    const waypoint=shipment.route[Math.min(shipment.progress+2,shipment.route.length-1)];
    goal='trade';reason='Carrying '+shipment.good+' to another community.';
    target={x:waypoint%w.width,y:Math.floor(waypoint/w.width)};
  }else if(a.energy<57||foodAround(w,a.x,a.y)<4){
    goal='forage';reason='Food or stored energy is running low.';
    target=bestHabitat(w,a,goal,suitability);
  }else if((safe<.45||a.health<52)&&a.energy>=57&&!continuing){
    goal='seek_safety';reason='The terrain or current condition is unsafe.';
    target=bestHabitat(w,a,goal,suitability);
  }else if(a.age<maturity){
    const parent=[...(a.development?.caregiverIds??[]),...(a.parents??[])]
      .map(id=>byId.get(id)).find(Boolean);
    const nearby=parent??nearestPerson(w,a,occupied,byId,b=>
      b.age>=traits(b.ancestry).maturity&&b.energy>55,5);
    if(nearby){goal='seek_family';reason='Seeking adult support and companionship.';
      target={x:nearby.x,y:nearby.y};}
  }else if(continuing){
    goal='venture';reason='Continuing a chosen expedition into unfamiliar land.';
    target={...prior!.target!};
  }else if(whisper&&a.age>=maturity){
    // A divine voice becomes an intention only if the mortal accepted it or
    // reinterpreted it. Hunger, danger and dependent children still come first.
    const theme=whisper.interpretedAs;
    if(theme==='exploration'){
      target=expedition(w,a);
      goal=target?'venture':'explore';
    }else goal='vocation';
    reason=(whisper.response==='reinterpreted'?'Reimagining':'Choosing to follow')+
      ' a divine whisper about '+theme+'.';
  }else if(construction?.project){
    goal='build';reason='Contributing labor to a locally chosen building project.';
    target={x:construction.project.x,y:construction.project.y};
  }else if(adult&&employer&&a.work&&(w.year+a.id)%3===0){
    goal='work';reason='Serving as a '+a.work.job+' for '+employer.name+'.';
    const role=a.work.job;
    const site=employer.infrastructure?.buildings.find(b=>
      b.stage==='complete'&&(role==='farmer'?b.type==='farm':
        role==='artisan'?b.type==='workshop':false));
    target=site?{x:site.x,y:site.y}:{x:employer.x,y:employer.y};
  }else if(wantsHome){
    goal='return_home';reason='Returning to a permanent household residence.';
    target={...residence};
  }else if((a.partnerId||contacts.has(a.id))&&
    byId.has(a.partnerId??contacts.get(a.id)!)){
    const partner=byId.get(a.partnerId??contacts.get(a.id)!)!;
    goal='stay_together';reason=a.partnerId?
      'Protecting a close partnership.':'Building trust in a developing bond.';
    target={x:partner.x,y:partner.y};
  }else if(expeditionReady&&
    (a.development?.career==='scout'||(w.year+a.id*7)%19===0)){
    const waypoint=expedition(w,a);
    if(waypoint){goal='venture';reason='Seeking places beyond familiar biomes.';
      target=waypoint;}
  }else if(adult&&a.development?.career&&(w.year+a.id)%4===0){
    goal='vocation';
    reason={forager:'Gathering provisions for people nearby.',
      scout:'Surveying routes and landmarks.',artisan:'Practicing a craft.',
      scholar:'Studying and sharing knowledge.',healer:'Learning to help the sick or injured.',
      guardian:'Watching over the local community.',
      trader:'Seeking exchange and cooperation with neighbors.'
    }[a.development.career];
    if(a.development.career==='forager')target=bestHabitat(w,a,'forage',suitability);
    else{
      const place=w.settlements.filter(s=>distance(a,s)<=15)
        .sort((x,y)=>distance(a,x)-distance(a,y))[0];
      if(place)target={x:place.x,y:place.y};
    }
  }else if(adult&&a.energy>=57&&a.health>=52){
    const eligible=(b:Agent)=>{
      if(b.partnerId||contacts.has(b.id)||b.energy<=40||b.health<=45||
        (!w.settings.interbreeding&&a.species!==b.species))return false;
      const p=traits(b.ancestry);
      return b.age>=p.maturity&&b.age<p.lifespan*.76;
    };
    const oldTarget=byId.get(prior?.targetPersonId??-1);
    const match=oldTarget&&oldTarget.id!==a.id&&eligible(oldTarget)&&
      distance(a,oldTarget)<=8?oldTarget:
      nearestPerson(w,a,occupied,byId,eligible);
    if(match){goal='seek_partner';reason='Looking for compatible company.';
      target={x:match.x,y:match.y};targetPersonId=match.id;}
  }
  return {goal,reason,since:prior?.goal===goal?prior.since:w.year,
    ...(target?{target}:{}),
    ...(targetPersonId?{targetPersonId}:{}),
    ...(prior?.lastScarcity?{lastScarcity:prior.lastScarcity}:{}),
    ...(prior?.lastGoodFood?{lastGoodFood:prior.lastGoodFood}:{})};
}

/** Utility for an adjacent position: intentions compete with immediate needs. */
export function movementIntent(a:Agent,x:number,y:number,year:number):number{
  const m=a.mind;
  if(!m)return 0;
  const here={x:a.x,y:a.y},candidate={x,y};
  const progress=m.target?(distance(here,m.target)-distance(candidate,m.target)):0;
  const urgency=m.goal==='forage'||m.goal==='seek_safety'?7:
    m.goal==='stay_together'?10:m.goal==='seek_partner'?8:
    m.goal==='seek_family'?7:m.goal==='venture'?55:
    m.goal==='vocation'?5:m.goal==='build'?13:m.goal==='return_home'?14:
    m.goal==='work'?9:m.goal==='trade'?72:0;
  const bad=m.lastScarcity;
  return progress*urgency-
    (bad&&year-bad.year<12&&distance(candidate,bad)<=1?6:0);
}

export function rememberForage(a:Agent,year:number,amount:number,needed:number):void{
  if(!a.mind)return;
  if(amount<needed*.45)
    a.mind.lastScarcity={x:a.x,y:a.y,year};
  else if(amount>=needed*.9)
    a.mind.lastGoodFood={x:a.x,y:a.y,year};
}
