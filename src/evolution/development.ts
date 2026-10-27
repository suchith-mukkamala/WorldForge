/** Evolution Lab v0.5 — social development from observed experience.
 * A child is never assigned a destiny, alignment or moral label. Childhood
 * changes skills, relationships, values and opportunity, not free will.
 */
import {traitProfile} from './family';
import {appendLifeMoment} from './identity';
import {divineFactor,mortalWhisper} from './divine';
import type {Agent,Biome,Species,World} from './engine';

export type LifeStage='infant'|'child'|'adolescent'|'adult'|'elder';
export const LIFE_STAGES:LifeStage[]=['infant','child','adolescent','adult','elder'];
export type Skill='foraging'|'navigation'|'craft'|'knowledge'|'care'|'diplomacy';
export const SKILLS:Skill[]=['foraging','navigation','craft','knowledge','care','diplomacy'];
export type Value='community'|'independence'|'tradition'|'discovery';
export const VALUES:Value[]=['community','independence','tradition','discovery'];
export type Career='forager'|'scout'|'artisan'|'scholar'|'healer'|'guardian'|'trader';
export const CAREERS:Career[]=['forager','scout','artisan','scholar','healer','guardian','trader'];
export type MemoryKind='care'|'hardship'|'friendship'|'mentorship'|'adoption'|
  'discovery'|'independence'|'career'|'loss';
export const MEMORY_KINDS:MemoryKind[]=['care','hardship','friendship','mentorship',
  'adoption','discovery','independence','career','loss'];
export type SocialMemory={year:number;kind:MemoryKind;otherId?:number;detail:string};
export type Development={householdId?:number;caregiverIds:number[];
  adoptedBy?:number;friends:number[];mentorId?:number;career?:Career;
  leftHomeYear?:number;skills:Record<Skill,number>;values:Record<Value,number>;
  trust:number;empathy:number;resilience:number;
  languages:Record<Species,number>;knownBiomes:Biome[];memories:SocialMemory[];
  yearsCared:number;yearsWithoutCare:number;yearsTaught:number};
export type Household={id:number;formed:number;home:{x:number;y:number};
  members:number[];caregivers:number[];culture:Species;
  residence?:{settlementId:number;buildingId:number}};
export type CareOutcome={providerId?:number;shelter:boolean;protected:boolean};

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const round=(n:number)=>Math.round(n*100)/100;
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const adult=(a:Agent)=>a.age>=traitProfile(a.ancestry).maturity;
export function lifeStage(a:Agent):LifeStage{
  const p=traitProfile(a.ancestry);
  if(a.age<Math.max(2,p.maturity*.13))return 'infant';
  if(a.age<p.maturity*.63)return 'child';
  if(a.age<p.maturity)return 'adolescent';
  if(a.age>=p.lifespan*.78)return 'elder';
  return 'adult';
}
export function initialDevelopment(a:Agent,biome:Biome):Development{
  const skills=Object.fromEntries(SKILLS.map(k=>[k,0])) as Record<Skill,number>;
  const values:Record<Value,number>={community:round(45+a.genes.social*8),
    independence:round(44+a.genes.curiosity*6),
    tradition:50,discovery:round(43+a.genes.curiosity*10)};
  return {caregiverIds:a.parents?[...a.parents]:[],friends:[],skills,values,
    trust:round(45+a.genes.social*9),empathy:round(45+a.genes.social*8),
    resilience:round(43+a.genes.vigor*10),
    languages:{human:a.species==='human'?70:0,elf:a.species==='elf'?70:0,
      dwarf:a.species==='dwarf'?70:0,demon:a.species==='demon'?70:0},
    knownBiomes:[biome],memories:[],yearsCared:0,yearsWithoutCare:0,
    yearsTaught:0};
}
export function cloneDevelopment(d:Development):Development{
  return {...d,caregiverIds:[...d.caregiverIds],friends:[...d.friends],
    skills:{...d.skills},values:{...d.values},languages:{...d.languages},
    knownBiomes:[...d.knownBiomes],memories:d.memories.map(m=>({...m}))};
}
function remember(a:Agent,kind:MemoryKind,year:number,detail:string,otherId?:number){
  const d=a.development!;
  const recent=d.memories.at(-1);
  // Avoid narrating the same continuous condition every year.
  if(recent?.kind===kind&&recent.otherId===otherId&&year-recent.year<5)return;
  if(kind==='loss'&&d.memories.some(m=>m.kind==='loss'&&m.otherId===otherId))return;
  d.memories.push({year,kind,detail,...(otherId?{otherId}:{})});
  if(d.memories.length>18)d.memories=[d.memories[0],...d.memories.slice(-17)];
}
function news(w:World,message:string){
  w.events.push({id:w.nextEventId++,year:w.year,type:'milestone',message});
  if(w.events.length>90)w.events=w.events.slice(-90);
}
function makeHousehold(w:World,a:Agent):Household{
  const id=w.nextHouseholdId??1;
  w.nextHouseholdId=id+1;
  return {id,formed:w.year,home:{x:a.x,y:a.y},
    members:[],caregivers:[],culture:a.species};
}

/** Supports v0.3/v0.4 saves without inventing unobserved childhood memories. */
export function prepareDevelopment(w:World):void{
  w.households??=[];
  w.nextHouseholdId??=Math.max(1,...w.households.map(h=>h.id+1));
  const byId=new Map(w.agents.map(a=>[a.id,a]));
  const householdById=new Map(w.households.map(h=>[h.id,h]));
  for(const a of w.agents){
    a.development??=initialDevelopment(a,w.tiles[a.y*w.width+a.x].biome);
  }
  // Dependents join living family; adult bonds share a household. Remaining
  // adults form one-person homes until they choose to share them.
  for(const a of w.agents){
    const d=a.development!;
    if(d.householdId&&householdById.has(d.householdId))continue;
    const relative=lifeStage(a)==='adult'||lifeStage(a)==='elder'?
      byId.get(a.partnerId??-1):
      [...d.caregiverIds,...(a.parents??[])].map(id=>byId.get(id)).find(Boolean);
    const shared=relative?.development?.householdId;
    if(shared&&householdById.has(shared))d.householdId=shared;
    else {const h=makeHousehold(w,a);w.households.push(h);
      householdById.set(h.id,h);d.householdId=h.id;}
  }
  for(const bond of w.bonds){
    if(bond.stage!=='partner')continue;
    const a=byId.get(bond.a),b=byId.get(bond.b);
    if(!a||!b||!a.development?.householdId||!b.development?.householdId)continue;
    const preferred=Math.min(a.development.householdId,b.development.householdId);
    a.development.householdId=preferred;
    b.development.householdId=preferred;
  }
  for(const a of w.agents){
    if(lifeStage(a)==='adult'||lifeStage(a)==='elder')continue;
    const caregiver=[...(a.parents??[]),...a.development!.caregiverIds]
      .map(id=>byId.get(id)).find(p=>p?.development?.householdId);
    if(caregiver&&a.development!.leftHomeYear===undefined)
      a.development!.householdId=caregiver.development!.householdId;
  }
  rebuildHouseholds(w);
}
function rebuildHouseholds(w:World):void{
  const byId=new Map(w.agents.map(a=>[a.id,a]));
  for(const h of w.households??[]){h.members=[];h.caregivers=[];}
  const byHouse=new Map((w.households??[]).map(h=>[h.id,h]));
  for(const a of w.agents){
    const h=byHouse.get(a.development?.householdId??-1);
    if(!h)continue;
    h.members.push(a.id);
    if(adult(a))h.caregivers.push(a.id);
  }
  w.households=w.households?.filter(h=>h.members.length>0)??[];
  // Completed residences are permanent homes. Households without a house
  // still travel with living caregivers as they did before v0.7.
  for(const h of w.households){
    const owned=h.residence&&w.settlements.find(s=>s.id===h.residence?.settlementId)
      ?.infrastructure?.buildings.find(b=>b.id===h.residence?.buildingId&&
        b.stage==='complete');
    if(owned){h.home={x:owned.x,y:owned.y};continue;}
    if(h.residence)h.residence=undefined;
    const leader=byId.get(h.caregivers[0]??h.members[0]);
    if(leader&&dist(h.home,leader)>5)h.home={x:leader.x,y:leader.y};
  }
}

/** Real energy support and nearby shelter/protection for dependents. */
export function helpDependent(w:World,a:Agent,occupied:Map<number,number>,
  people:Map<number,Agent>):CareOutcome{
  const stage=lifeStage(a),young=stage==='infant'||stage==='child'||stage==='adolescent';
  const shelter=w.settlements.some(s=>dist(s,a)<=5);
  if(!young)return {shelter,protected:false};
  const d=a.development!,relatives=new Set([...d.caregiverIds,...(a.parents??[])]);
  let choice:Agent|undefined,priority=-Infinity;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const x=a.x+dx,y=a.y+dy;
    if(x<0||y<0||x>=w.width||y>=w.height)continue;
    const id=occupied.get(y*w.width+x),helper=id===undefined?undefined:people.get(id);
    if(!helper||helper.id===a.id||!adult(helper)||helper.energy<58)continue;
    const related=relatives.has(helper.id);
    if(!related&&helper.genes.social*divineFactor(helper,'social',w.year)<.85)continue;
    const score=(related?20:0)+(helper.development?.householdId===d.householdId?7:0)+
      helper.genes.social*3-dist(helper,a)*2;
    if(score>priority){priority=score;choice=helper;}
  }
  if(choice){
    const maxAid=stage==='infant'?10:stage==='child'?7:4;
    const aid=Math.max(0,Math.min(maxAid,choice.energy-58,78-a.energy));
    if(aid>0){a.energy=round(clamp(a.energy+aid));
      choice.energy=round(clamp(choice.energy-aid));}
  }
  return {providerId:choice?.id,shelter:shelter||!!choice&&
    choice.development?.householdId===d.householdId&&dist(choice,a)<=2,
    protected:!!choice&&dist(choice,a)<=2};
}

const CAREER_SKILLS:Record<Career,Skill[]>={
  forager:['foraging','care'],scout:['navigation','foraging'],
  artisan:['craft','knowledge'],scholar:['knowledge','navigation'],
  healer:['care','knowledge'],guardian:['foraging','diplomacy'],
  trader:['diplomacy','navigation'],
};
export const CAREER_LABELS:Record<Career,string>={
  forager:'Forager',scout:'Scout',artisan:'Artisan',scholar:'Scholar',
  healer:'Healer',guardian:'Guardian',trader:'Trader',
};
export function guidingBelief(d:Development):string{
  const strongest=VALUES.reduce((best,v)=>d.values[v]>d.values[best]?v:best,'community');
  return {community:'People flourish when they support each other.',
    independence:'Every person should be free to choose their own path.',
    tradition:'The wisdom of earlier generations deserves respect.',
    discovery:'Experience and discovery can change what we believe.'}[strongest];
}
function chooseCareer(d:Development):Career{
  let best:Career='forager',score=-Infinity;
  for(const career of CAREERS){
    const [first,second]=CAREER_SKILLS[career];
    const merit=d.skills[first]*1.3+d.skills[second]*.7+
      (career==='forager'?3:0)+
      (career==='scout'?(d.values.discovery-50)*.12:0)+
      (career==='healer'?(d.empathy-50)*.09:0)+
      (career==='trader'?(d.values.community-50)*.07:0);
    if(merit>score){score=merit;best=career;}
  }
  return best;
}
function addSkill(d:Development,k:Skill,amount:number){
  d.skills[k]=round(clamp(d.skills[k]+amount));
}

/** Called after births: relationships, adoption, learning and independent lives. */
export function developSociety(w:World,care:Map<number,CareOutcome>,
  rand:()=>number):void{
  prepareDevelopment(w);
  const meetingPlaces=w.settlements.flatMap(s=>s.infrastructure?.buildings.filter(b=>
    b.type==='communal'&&b.stage==='complete')??[]);
  const byId=new Map(w.agents.map(a=>[a.id,a]));
  const houses=new Map(w.households!.map(h=>[h.id,h]));
  const occupied=new Map(w.agents.map(a=>[a.y*w.width+a.x,a]));
  const deceased=new Set(w.lineage.filter(r=>r.died!==undefined).map(r=>r.id));
  for(const a of w.agents){
    const d=a.development!,stage=lifeStage(a);
    const learning=divineFactor(a,'intelligence',w.year)*
      divineFactor(a,'skill_growth',w.year);
    const omen=mortalWhisper(a,w.year);
    if(omen){
      const theme=omen.interpretedAs;
      const subject=theme==='exploration'?'navigation':
        theme==='learning'?'knowledge':theme==='leadership'?'diplomacy':
        theme==='cooperation'?'care':theme==='faith'?'knowledge':'craft';
      addSkill(d,subject,.40*learning);
      const ideal=theme==='cooperation'?'community':
        theme==='faith'?'tradition':theme==='leadership'?'independence':'discovery';
      d.values[ideal]=round(clamp(d.values[ideal]+.12));
    }
    for(const id of [...d.caregiverIds,...d.friends]){
      if(byId.has(id)||!deceased.has(id)||
        d.memories.some(m=>m.kind==='loss'&&m.otherId===id))continue;
      const close=d.caregiverIds.includes(id);
      remember(a,'loss',w.year,close?'Lost a familiar caregiver.':'Lost a friend.',id);
      d.trust=round(clamp(d.trust-(close?1.1:.4)));
      d.resilience=round(clamp(d.resilience+.3));
    }
    const here=w.tiles[a.y*w.width+a.x].biome;
    if(!d.knownBiomes.includes(here)){
      d.knownBiomes.push(here);addSkill(d,'navigation',2);
      d.values.discovery=round(clamp(d.values.discovery+1.5));
      remember(a,'discovery',w.year,'Explored unfamiliar '+here+' terrain.');
    }
    if(stage==='infant'||stage==='child'||stage==='adolescent'){
      const observed=care.get(a.id),provider=byId.get(observed?.providerId??-1);
      if(provider){
        d.yearsCared++;
        d.trust=round(clamp(d.trust+.55));
        d.empathy=round(clamp(d.empathy+.3));
        d.values.community=round(clamp(d.values.community+.28));
        addSkill(d,'care',.12);
        if(d.yearsCared===1)remember(a,'care',w.year,
          'Received support from a nearby adult.',provider.id);
        if(!d.caregiverIds.includes(provider.id)&&d.caregiverIds.length<4)
          d.caregiverIds.push(provider.id);
        const language=provider.species;
        d.languages[language]=round(clamp(d.languages[language]+2.4));
        if(!d.adoptedBy&&(!a.parents?.some(id=>byId.has(id))||
          d.yearsWithoutCare>=4)&&
          provider.genes.social*divineFactor(provider,'social',w.year)>.95&&rand()<.20){
          d.adoptedBy=provider.id;d.householdId=provider.development?.householdId;
          d.values.tradition=round(clamp(d.values.tradition+4));
          remember(a,'adoption',w.year,'Welcomed into a new household.',provider.id);
          appendLifeMoment(w,a.id,{year:w.year,kind:'adoption',
            text:'Was adopted by a member of another household.',relatedIds:[provider.id]});
          news(w,'A young person found an adoptive caregiver.');
        }
      }else if(a.born!==w.year){
        d.yearsWithoutCare++;
        d.trust=round(clamp(d.trust-.55));
        d.resilience=round(clamp(d.resilience+.35));
        d.values.independence=round(clamp(d.values.independence+.35));
        if(d.yearsWithoutCare===3)remember(a,'hardship',w.year,
          'Endured several years without nearby adult support.');
      }
      if(observed?.shelter)d.values.community=round(clamp(d.values.community+.07));
      else if(stage==='infant')d.resilience=round(clamp(d.resilience-.16));
      // Instruction comes from lived contact rather than ancestry alone.
      let mentor=byId.get(d.mentorId??-1);
      if(!mentor||!adult(mentor)||dist(a,mentor)>3){
        mentor=undefined;
        const community=meetingPlaces.some(place=>dist(place,a)<=5);
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
          const x=a.x+dx,y=a.y+dy;
          if(x<0||y<0||x>=w.width||y>=w.height)continue;
          const b=occupied.get(y*w.width+x);
          if(!b||b.id===a.id||!adult(b)||
            b.genes.social*divineFactor(b,'social',w.year)<(community?.77:.87))continue;
          if(!mentor||dist(a,b)<dist(a,mentor))mentor=b;
        }
        if(mentor&&d.mentorId!==mentor.id){
          d.mentorId=mentor.id;
          remember(a,'mentorship',w.year,'Began learning from a local mentor.',mentor.id);
          appendLifeMoment(w,a.id,{year:w.year,kind:'mentorship',
            text:'Began an apprenticeship.',relatedIds:[mentor.id]});
        }
      }
      if(mentor){
        d.yearsTaught++;
        const subjects=CAREER_SKILLS[mentor.development?.career??'forager'];
        addSkill(d,subjects[0],1.2*learning);addSkill(d,subjects[1],.65*learning);
        addSkill(d,'knowledge',.25*learning);
        d.languages[mentor.species]=round(clamp(d.languages[mentor.species]+1.5));
      }
      // Exploration and ordinary practice also teach children with no mentor.
      addSkill(d,'foraging',(observed?.providerId?1:.55)*learning);
      if(a.mind?.goal==='explore'||a.mind?.goal==='venture')
        addSkill(d,'navigation',.6*learning);
    }else{
      if(!d.career){
        d.career=chooseCareer(d);
        remember(a,'career',w.year,'Chose the path of '+CAREER_LABELS[d.career]+'.');
        appendLifeMoment(w,a.id,{year:w.year,kind:'career',
          text:'Began working as a '+CAREER_LABELS[d.career].toLowerCase()+'.'});
      }
      const focus=CAREER_SKILLS[d.career];
      addSkill(d,focus[0],(a.mind?.goal==='vocation'?1.1:.52)*learning);
      addSkill(d,focus[1],(a.mind?.goal==='vocation'?.50:.25)*learning);
      if(a.mind?.goal==='venture')addSkill(d,'navigation',.55*learning);
      const parents=(a.parents??[]).map(id=>byId.get(id)).filter(Boolean) as Agent[];
      if(d.leftHomeYear===undefined&&a.age>=traitProfile(a.ancestry).maturity+2&&
        parents.some(p=>p.development?.householdId===d.householdId)&&
        (d.values.independence>55||rand()<.055)){
        const home=makeHousehold(w,a);w.households!.push(home);
        houses.set(home.id,home);d.householdId=home.id;d.leftHomeYear=w.year;
        remember(a,'independence',w.year,'Left the childhood household to build a life.');
        appendLifeMoment(w,a.id,{year:w.year,kind:'independence',
          text:'Left the household in which they were raised.'});
      }
    }
  }
  // Local friendships arise through repeated proximity; peers of different
  // species can learn from one another, independent of parentage.
  for(const a of w.agents){
    const d=a.development!;
    if(d.friends.length>=4||rand()>.14*a.genes.social)continue;
    let peer:Agent|undefined;
    for(let dy=-2;dy<=2&&!peer;dy++)for(let dx=-2;dx<=2;dx++){
      const x=a.x+dx,y=a.y+dy;
      if(x<0||y<0||x>=w.width||y>=w.height)continue;
      const b=occupied.get(y*w.width+x);
      if(!b||b.id===a.id||d.friends.includes(b.id)||
        b.development!.friends.length>=4||
        Math.abs(b.age/traitProfile(b.ancestry).maturity-
          a.age/traitProfile(a.ancestry).maturity)>1.2)continue;
      peer=b;break;
    }
    if(!peer)continue;
    d.friends.push(peer.id);peer.development!.friends.push(a.id);
    d.values.community=round(clamp(d.values.community+.8));
    peer.development!.values.community=round(clamp(peer.development!.values.community+.8));
    remember(a,'friendship',w.year,'Formed a friendship.',peer.id);
    remember(peer,'friendship',w.year,'Formed a friendship.',a.id);
  }
  rebuildHouseholds(w);
}
