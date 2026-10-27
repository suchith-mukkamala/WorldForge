/** WorldForge v1.0 — voluntary worker guilds and settlement diplomacy.
 * Institutions emerge from agents' social choices and verified trade history.
 */
import type {Agent,Settlement,World} from './engine';
import {traitProfile} from './family';
import type {Job} from './economy';
import {JOBS} from './economy';

export type Guild={id:number;settlementId:number;job:Job;founderId:number;
  leaderId:number;formed:number;members:number[];treasury:number;
  expertise:number;inactiveYears:number};
export type AccordKind='trade'|'aid'|'embargo';
export type Accord={a:number;b:number;kind:AccordKind;since:number;
  support:number;until?:number};
export type Institutions={guilds:Guild[];nextGuildId:number;accords:Accord[]};
// At most one guild per settlement and role; this is a natural structural
// bound from the settlement model, not a population ceiling.
const MAX_GUILDS=54*6;

const near=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const round=(n:number)=>Math.round(n*100)/100;
const skillFor=(job:Job)=>job==='farmer'||job==='woodcutter'?'foraging':
  job==='trader'?'diplomacy':'craft';
const score=(a:Agent,job:Job)=>
  (a.development?.skills[skillFor(job)]??0)+
  (a.development?.skills.diplomacy??0)*.4+
  (a.development?.values.community??50)*.2;

export function prepareInstitutions(w:World):void{
  w.institutions??={guilds:[],nextGuildId:1,accords:[]};
}
export function cloneInstitutions(i:Institutions):Institutions{
  return {guilds:i.guilds.map(g=>({...g,members:[...g.members]})),
    nextGuildId:i.nextGuildId,accords:i.accords.map(a=>({...a}))};
}
export function accordBetween(w:World,a:number,b:number):Accord|undefined{
  const lo=Math.min(a,b),hi=Math.max(a,b);
  return w.institutions?.accords.find(v=>v.a===lo&&v.b===hi);
}
export function guildOf(w:World,personId:number):Guild|undefined{
  return w.institutions?.guilds.find(g=>g.members.includes(personId));
}
function event(w:World,type:'guild'|'diplomacy',message:string):void{
  w.events.push({id:w.nextEventId++,year:w.year,type,message});
  if(w.events.length>90)w.events=w.events.slice(-90);
}
function workerGroups(w:World):Map<string,Agent[]>{
  const grouped=new Map<string,Agent[]>(),towns=new Map(w.settlements.map(s=>[s.id,s]));
  for(const a of w.agents){
    const work=a.work,s=towns.get(work?.settlementId??-1);
    if(!work||!s||near(a,s)>7||
      a.age<traitProfile(a.ancestry).maturity||
      a.energy<45||a.health<45||
      (a.development?.values.community??50)<49||
      (a.development?.values.independence??50)>=76)continue;
    const key=s.id+':'+work.job,group=grouped.get(key)??[];
    group.push(a);grouped.set(key,group);
  }
  return grouped;
}

function evolveGuilds(w:World):void{
  const i=w.institutions!,settlements=new Map(w.settlements.map(s=>[s.id,s]));
  const membersById=new Map(w.agents.map(a=>[a.id,a]));
  const groups=workerGroups(w);
  const surviving:Guild[]=[];
  for(const g of i.guilds){
    const s=settlements.get(g.settlementId);
    if(!s)continue;
    const workers=groups.get(s.id+':'+g.job)??[];
    const willing=new Set(workers.map(a=>a.id));
    // An experienced founder's invitation matters, but membership is a
    // personal choice. Workers can leave as goals and values change.
    g.members=workers.filter(a=>willing.has(a.id)).map(a=>a.id).slice(0,120);
    g.inactiveYears=g.members.length>=2?0:g.inactiveYears+1;
    if(g.inactiveYears>=12){
      event(w,'guild','The '+g.job+' guild in '+s.name+' dissolved.');continue;
    }
    const candidates=g.members.map(id=>membersById.get(id)!).filter(Boolean);
    if(candidates.length){
      candidates.sort((a,b)=>score(b,g.job)-score(a,g.job)||a.id-b.id);
      g.leaderId=candidates[0].id;
      g.expertise=Math.min(100,round(g.expertise+candidates.length*.07));
      for(const a of candidates){
        const skill=skillFor(g.job);
        if(a.development)
          a.development.skills[skill]=Math.min(100,round(
            a.development.skills[skill]+.08+g.expertise*.0005));
      }
      if(s.economy&&s.economy.coins>=12){
        const grant=Math.min(1,round(candidates.length*.12));
        s.economy.coins=round(s.economy.coins-grant);
        g.treasury=Math.min(300,round(g.treasury+grant));
      }
      if(g.treasury>=2&&w.year%5===0){
        g.treasury=round(g.treasury-2);
        g.expertise=Math.min(100,round(g.expertise+1.5));
      }
    }
    surviving.push(g);
  }
  i.guilds=surviving;
  if(w.year<12||i.guilds.length>=MAX_GUILDS)return;
  for(const s of w.settlements){
    for(const job of JOBS){
      if(i.guilds.length>=MAX_GUILDS)break;
      if(i.guilds.some(g=>g.settlementId===s.id&&g.job===job))continue;
      const voters=groups.get(s.id+':'+job)??[];
      if(voters.length<3)continue;
      voters.sort((a,b)=>score(b,job)-score(a,job)||a.id-b.id);
      const founder=voters[0];
      i.guilds.push({id:i.nextGuildId++,settlementId:s.id,job,
        founderId:founder.id,leaderId:founder.id,formed:w.year,
        members:voters.slice(0,120).map(a=>a.id),treasury:0,
        expertise:12,inactiveYears:0});
      event(w,'guild',s.name+' workers founded a '+job+' guild, led by '+
        'citizen #'+founder.id+'.');
    }
  }
}

/** Shared preferences determine whether trust results in a political accord.
 * Traders cannot create an alliance simply by filling a transaction counter.
 */
function communitySupport(w:World,s:Settlement):number{
  const people=w.agents.filter(a=>near(a,s)<=6&&
    a.age>=traitProfile(a.ancestry).maturity);
  if(!people.length)return 45;
  return people.reduce((n,a)=>n+
    (a.development?.values.community??50)*.75+
    (100-(a.development?.values.independence??50))*.25,0)/people.length;
}
function evolveAccords(w:World):void{
  const i=w.institutions!,byId=new Map(w.settlements.map(s=>[s.id,s]));
  const supportById=new Map(w.settlements.map(s=>[s.id,communitySupport(w,s)]));
  const next:Accord[]=[];
  for(const r of w.tradeRelations??[]){
    const a=byId.get(r.a),b=byId.get(r.b);
    if(!a||!b)continue;
    const support=round(((supportById.get(a.id)??45)+
      (supportById.get(b.id)??45))/2);
    const kind:AccordKind|undefined=(r.disputeUntil??0)>w.year?'embargo':
      r.completed>=7&&r.trust>=75&&support>=54?'aid':
      r.completed>=4&&r.trust>=59&&support>=48?'trade':undefined;
    if(!kind)continue;
    const prior=i.accords.find(v=>v.a===r.a&&v.b===r.b);
    next.push({a:r.a,b:r.b,kind,since:prior?.kind===kind?prior.since:w.year,
      support,until:kind==='embargo'?r.disputeUntil:undefined});
    if(prior?.kind!==kind){
      event(w,'diplomacy',a.name+' and '+b.name+
        (kind==='embargo'?' declared a trade embargo.':
          kind==='aid'?' entered a mutual-aid pact.':' signed a trade accord.'));
    }
  }
  i.accords=next.slice(0,500);
}

export function advanceInstitutions(w:World):void{
  prepareInstitutions(w);evolveGuilds(w);evolveAccords(w);
}

export function validInstitutions(w:World):boolean{
  if(w.institutions===undefined)return true;
  const i=w.institutions;
  if(!i||!Number.isSafeInteger(i.nextGuildId)||i.nextGuildId<1||
    !Array.isArray(i.guilds)||i.guilds.length>MAX_GUILDS||
    !Array.isArray(i.accords)||i.accords.length>500)return false;
  const ids=new Set<number>(),guildPairs=new Set<string>(),accordPairs=new Set<string>();
  for(const g of i.guilds){
    if(!g||!Number.isSafeInteger(g.id)||g.id<1||ids.has(g.id)||
      !Number.isSafeInteger(g.settlementId)||g.settlementId<1||
      !JOBS.includes(g.job)||!Number.isSafeInteger(g.founderId)||g.founderId<1||
      !Number.isSafeInteger(g.leaderId)||g.leaderId<1||
      !Number.isInteger(g.formed)||g.formed<0||g.formed>w.year||
      !Array.isArray(g.members)||g.members.length>120||
      new Set(g.members).size!==g.members.length||
      !g.members.every(id=>Number.isSafeInteger(id)&&id>0)||
      !Number.isFinite(g.treasury)||g.treasury<0||g.treasury>300||
      !Number.isFinite(g.expertise)||g.expertise<0||g.expertise>100||
      !Number.isInteger(g.inactiveYears)||g.inactiveYears<0||
      g.inactiveYears>12)return false;
    const pair=g.settlementId+':'+g.job;
    if(guildPairs.has(pair))return false;
    guildPairs.add(pair);ids.add(g.id);
  }
  for(const a of i.accords){
    if(!a||!Number.isSafeInteger(a.a)||!Number.isSafeInteger(a.b)||
      a.a<1||a.b<=a.a||!['trade','aid','embargo'].includes(a.kind)||
      !Number.isInteger(a.since)||a.since<0||a.since>w.year||
      !Number.isFinite(a.support)||a.support<0||a.support>100||
      (a.until!==undefined&&(!Number.isInteger(a.until)||
        a.until<a.since||a.until>w.year+18)))return false;
    const pair=a.a+':'+a.b;if(accordPairs.has(pair))return false;
    accordPairs.add(pair);
  }
  return true;
}
