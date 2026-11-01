/** v2.4.3 — disease is a lived, local civilization event, not a population cap.
 * Annual contagion uses a bounded number of physical encounters per carrier.
 * The world RNG is never consumed: replay and camera speed remain independent.
 */
import type {Agent,Settlement,World} from './engine';
import {knows} from './knowledge';
import {indexAgentsByTile,nearbyAgents} from './nearbyAgents';

export const DISEASES={
  marsh_fever:{name:'Marsh fever',duration:3,damage:9,spread:.36,immunity:7},
  red_pox:{name:'Red pox',duration:4,damage:17,spread:.27,immunity:12},
  ash_cough:{name:'Ash cough',duration:3,damage:12,spread:.44,immunity:6},
} as const;
export type DiseaseId=keyof typeof DISEASES;
export type DiseaseRecord={kind:DiseaseId;stage:'incubating'|'sick'|'immune';
  since:number;immuneUntil?:number};
export type PublicHealthState={year:number;active:number;newCases:number;
  recovered:number;deaths:number;cumulativeCases:number;
  cumulativeDeaths:number;affectedSettlements:number;responses:number};
const ids=Object.keys(DISEASES) as DiseaseId[];
const mix=(n:number)=>{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
};
const fraction=(seed:number,year:number,id:number,salt:number)=>
  mix(seed^Math.imul(year,0x9e3779b1)^Math.imul(id,0x85ebca6b)^salt)/4294967296;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const active=(a:Agent)=>a.disease?.stage==='sick'||a.disease?.stage==='incubating';
const susceptible=(a:Agent,year:number)=>!a.disease||
  a.disease.stage==='immune'&&(a.disease.immuneUntil??0)<=year;

export function isDiseaseRecord(value:unknown,year:number):value is DiseaseRecord{
  if(!value||typeof value!=='object')return false;
  const d=value as Partial<DiseaseRecord>;
  return ids.includes(d.kind as DiseaseId)&&
    (d.stage==='incubating'||d.stage==='sick'||d.stage==='immune')&&
    Number.isInteger(d.since)&&d.since!>=0&&d.since!<=year&&
    (d.stage==='immune'?
      Number.isInteger(d.immuneUntil)&&d.immuneUntil!>d.since!&&
      d.immuneUntil!<=year+20:d.immuneUntil===undefined);
}
export function isPublicHealthState(value:unknown,year:number,
  population:number):value is PublicHealthState{
  if(!value||typeof value!=='object')return false;
  const state=value as PublicHealthState;
  return Number.isInteger(state.year)&&state.year>=0&&state.year<=year&&
    (['active','newCases','recovered','deaths','cumulativeCases',
      'cumulativeDeaths','affectedSettlements','responses'] as const)
      .every(k=>Number.isSafeInteger(state[k])&&state[k]>=0)&&
    state.active<=population&&state.deaths<=state.cumulativeDeaths&&
    state.newCases<=state.cumulativeCases;
}

/** Sanitation grows through actual civic investment and medical learning.
 * Building walls alone cannot guarantee good public health in a crowded city.
 */
export function settlementSanitation(s:Settlement,residents:readonly Agent[]):number{
  const complete=s.infrastructure?.buildings.filter(b=>b.stage==='complete')??[];
  const count=(type:string)=>complete.filter(b=>b.type===type).length;
  const housing=count('house')+count('shelter');
  const crowding=residents.length/Math.max(12,16+housing*5);
  const trained=residents.filter(a=>knows(a,'medicine')||knows(a,'herbalism')).length;
  return clamp(.16+count('well')*.13+count('communal')*.065+
    Math.min(.2,trained/Math.max(1,residents.length)*.65)-
    Math.max(0,crowding-1)*.035,.03,.85);
}

/** Advances disease before the annual mortality check. It never removes an
 * agent directly; ordinary health/energy and age checks remain authoritative.
 * The returned stories may be logged in the world's bounded event chronicle.
 */
export function advancePublicHealth(world:World):string[]{
  const year=world.year,seed=world.settings.seed;
  const previous=world.publicHealth;
  const stories:string[]=[];
  const byTile=indexAgentsByTile(world.agents,world.width);
  const buckets=new Map<number,Agent[]>();
  for(const a of world.agents){
    const index=a.y*world.width+a.x;
    let group=buckets.get(index);
    if(!group){group=[];buckets.set(index,group);}
    group.push(a);
  }
  const protections=new Float32Array(world.width*world.height).fill(1);
  const townResidents=new Map<number,Agent[]>();
  let responses=0;
  for(const s of world.settlements){
    const people=nearbyAgents(byTile,world.width,s,6);
    townResidents.set(s.id,people);
    const sanitation=settlementSanitation(s,people);
    const ill=people.filter(a=>a.disease?.stage==='sick').length;
    // Communities spend actual money and tools on emergency caretaking. This
    // response helps local patients and reduces transmission for the year.
    const response=ill>=3&&!!s.economy&&s.economy.coins>=5&&
      s.economy.tools>=.5;
    if(response){
      s.economy!.coins=Math.round((s.economy!.coins-3)*100)/100;
      s.economy!.tools=Math.round((s.economy!.tools-.5)*100)/100;
      responses++;
    }
    const factor=clamp(1-sanitation*.6-(response?.18:0),.25,1);
    for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
      const x=s.x+dx,y=s.y+dy;
      if(x>=0&&y>=0&&x<world.width&&y<world.height){
        const index=y*world.width+x;
        protections[index]=Math.min(protections[index],factor);
      }
    }
  }

  // Snapshot the contagious population before changes. Nobody can infect
  // someone who infects a third person in this same annual update.
  const carriers=world.agents.filter(a=>a.disease?.stage==='sick');
  const infections=new Map<number,DiseaseId>();
  for(const a of carriers){
    const strain=DISEASES[a.disease!.kind];
    for(let attempt=0;attempt<8;attempt++){
      const roll=mix(seed^Math.imul(a.id,0x6ec51ae1)^Math.imul(year,0x13a4c829)^
        Math.imul(attempt+1,0x9e3779b1));
      const dx=roll%3-1,dy=(roll>>>8)%3-1;
      const x=a.x+dx,y=a.y+dy;
      if(x<0||y<0||x>=world.width||y>=world.height)continue;
      const group=buckets.get(y*world.width+x);
      if(!group?.length)continue;
      const target=group[(roll>>>16)%group.length];
      if(target.id===a.id||infections.has(target.id)||!susceptible(target,year))
        continue;
      const hygiene=protections[target.y*world.width+target.x];
      const resilience=clamp(target.genes.vigor,.5,1.5);
      if(fraction(seed,year,target.id,roll) <
        strain.spread*hygiene*(1.35-resilience*.25))
        infections.set(target.id,a.disease!.kind);
    }
  }

  // Each settlement has a small independent chance of an index case. It
  // grows with local crowding, not with a global head-count threshold.
  for(const s of world.settlements){
    const people=townResidents.get(s.id)!;
    if(!people.length)continue;
    const housing=s.infrastructure?.buildings.filter(b=>b.stage==='complete'&&
      (b.type==='house'||b.type==='shelter')).length??0;
    const crowding=people.length/Math.max(12,16+housing*5);
    const risk=clamp(.003+Math.max(0,crowding-1)*.015,0,.33)*
      protections[s.y*world.width+s.x];
    if(fraction(seed,year,s.id,0x779f2e3b)>=risk)continue;
    const first=mix(seed^Math.imul(s.id,0x7f4a7c15)^year)%people.length;
    let patient:Agent|undefined;
    for(let i=0;i<people.length;i++){
      const candidate=people[(first+i)%people.length];
      if(susceptible(candidate,year)&&!infections.has(candidate.id)){
        patient=candidate;break;
      }
    }
    if(!patient)continue;
    const kind=ids[mix(seed^Math.imul(year,0x6d2b79f5)^s.id)%ids.length];
    infections.set(patient.id,kind);
    if(stories.length<4)stories.push(DISEASES[kind].name+
      ' emerged near '+s.name+'.');
  }

  let recovered=0;
  for(const a of world.agents){
    const illness=a.disease;
    if(!illness)continue;
    if(illness.stage==='immune'){
      if((illness.immuneUntil??0)<=year)a.disease=undefined;
      continue;
    }
    const strain=DISEASES[illness.kind];
    if(year-illness.since>=strain.duration){
      a.disease={kind:illness.kind,stage:'immune',since:illness.since,
        immuneUntil:year+strain.immunity};
      recovered++;continue;
    }
    if(illness.stage==='incubating'&&year>illness.since)
      a.disease={...illness,stage:'sick'};
    if(a.disease?.stage!=='sick')continue;
    const tile=a.y*world.width+a.x;
    const medicine=knows(a,'medicine')?.35:knows(a,'herbalism')?.16:0;
    const vulnerability=clamp(1.25-(a.genes.vigor-1)*.6,.7,1.55);
    const harm=strain.damage*vulnerability*(1-medicine)*protections[tile];
    a.health-=harm;
    a.energy=Math.max(0,a.energy-harm*.38);
  }
  for(const a of world.agents){
    const kind=infections.get(a.id);
    if(kind!==undefined)a.disease={kind,stage:'incubating',since:year};
  }
  const activeCount=world.agents.filter(active).length;
  let affectedSettlements=0;
  for(const people of townResidents.values())if(people.some(active))affectedSettlements++;
  world.publicHealth={year,active:activeCount,newCases:infections.size,
    recovered,deaths:0,cumulativeCases:(previous?.cumulativeCases??0)+infections.size,
    cumulativeDeaths:previous?.cumulativeDeaths??0,
    affectedSettlements,responses};
  return stories;
}
