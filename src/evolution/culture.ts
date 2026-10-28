/** WorldForge v1.5 — mortal-made faith and civic government.
 * Neither species nor the player assigns a religion or a ruling system.
 * Individuals acquire convictions through experiences and conversation;
 * settlements elect leaders and fund priorities from real community supplies.
 */
import type {Agent,Settlement,World} from './engine';
import {traitProfile} from './family';
import {appendLifeMoment} from './identity';
import {residentIndex} from './density';
import {knows} from './knowledge';
import type {Value} from './development';

export const FAITH_THEMES=['nature','ancestors','stars','craft','renewal',
  'harmony','mystery'] as const;
export type FaithTheme=typeof FAITH_THEMES[number];
export const GOVERNMENT_KINDS=['assembly','council','elders','chiefdom'] as const;
export type GovernmentKind=typeof GOVERNMENT_KINDS[number];
export const CIVIC_POLICIES=['mutual_aid','learning','autonomy','tradition'] as const;
export type CivicPolicy=typeof CIVIC_POLICIES[number];
export const GOVERNMENT_LABELS:Record<GovernmentKind,string>={
  assembly:'Open Assembly',council:'Citizen Council',
  elders:'Circle of Elders',chiefdom:'Local Chiefdom',
};
export const POLICY_LABELS:Record<CivicPolicy,string>={
  mutual_aid:'Mutual Aid',learning:'Public Learning',
  autonomy:'Personal Liberty',tradition:'Cultural Traditions',
};
export const FAITH_LABELS:Record<FaithTheme,string>={
  nature:'Living Earth',ancestors:'Ancestors',stars:'Celestial Paths',
  craft:'Sacred Craft',renewal:'Renewal',harmony:'Kinship',mystery:'The Unknown',
};
export type Belief={faithId:number;conviction:number;since:number;teacherId?:number};
export type Faith={id:number;name:string;theme:FaithTheme;founderId:number;
  founded:number;tenet:Value;tolerance:number};
export type Government={settlementId:number;kind:GovernmentKind;
  leaderId:number;formed:number;elected:number;policy:CivicPolicy;
  legitimacy:number;unrest:number;turnout:number};
export type CultureMoment={year:number;kind:'faith'|'election'|'reform'|'dissent';
  description:string;faithId?:number;settlementId?:number};
export type CultureState={faiths:Faith[];nextFaithId:number;
  governments:Government[];history:CultureMoment[]};

const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,n));
const round=(n:number)=>Math.round(n*100)/100;
const near=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const adult=(a:Agent)=>a.age>=traitProfile(a.ancestry).maturity;
const state=():CultureState=>({faiths:[],nextFaithId:1,governments:[],history:[]});
export function cloneCulture(c:CultureState):CultureState{
  return {faiths:c.faiths.map(f=>({...f})),nextFaithId:c.nextFaithId,
    governments:c.governments.map(g=>({...g})),
    history:c.history.map(m=>({...m}))};
}
export function faithOf(w:World,a:Pick<Agent,'belief'>):Faith|undefined{
  return w.culture?.faiths.find(f=>f.id===a.belief?.faithId);
}
export function governmentOf(w:World,settlementId:number):Government|undefined{
  return w.culture?.governments.find(g=>g.settlementId===settlementId);
}
function record(w:World,kind:CultureMoment['kind'],description:string,
  faithId?:number,settlementId?:number):void{
  const history=w.culture!.history;
  history.push({year:w.year,kind,description,
    ...(faithId?{faithId}:{}),...(settlementId?{settlementId}:{})});
  if(history.length>180)w.culture!.history=history.slice(-180);
  w.events.push({id:w.nextEventId++,year:w.year,type:'culture',message:description});
  if(w.events.length>90)w.events=w.events.slice(-90);
}
const names:Record<FaithTheme,string>={
  nature:'Greenward Covenant',ancestors:'Chorus of Ancestors',
  stars:'Path of Seven Lights',craft:'Keepers of the Ember Anvil',
  renewal:'Ash and Dawn',harmony:'Circle of Many Voices',
  mystery:'Witnesses of the Unseen',
};
const tenets:Record<FaithTheme,Value>={
  nature:'tradition',ancestors:'tradition',stars:'discovery',craft:'discovery',
  renewal:'independence',harmony:'community',mystery:'discovery',
};
function themeFor(w:World,a:Agent):FaithTheme{
  const d=a.development!,biome=w.tiles[a.y*w.width+a.x].biome;
  if(a.whispers?.some(v=>v.theme==='faith'&&v.response!=='resisted'))return 'mystery';
  if(a.artifacts?.length||knows(a,'navigation'))return 'stars';
  if(d.memories.some(m=>m.kind==='hardship'))return 'renewal';
  if(knows(a,'stonecraft')||knows(a,'metallurgy'))return 'craft';
  if(biome==='forest'&&d.values.tradition>=48)return 'nature';
  if(d.values.community>=59)return 'harmony';
  return d.values.tradition>=d.values.discovery?'ancestors':'stars';
}
function hearFaith(w:World,a:Agent,from:Agent,faith:Faith,rand:()=>number,
  records:Map<number,World['lineage'][number]>):boolean{
  const d=a.development!;
  if(d.languages[from.species]<12||a.belief?.faithId===faith.id)return false;
  const appeal=(d.values[faith.tenet]+d.trust+from.belief!.conviction)/300;
  const independence=d.values.independence/100;
  const tolerance=faith.tolerance/100;
  const changing=!!a.belief;
  const chance=(changing?.10:.34)*appeal*(1-independence*.4)*
    (changing?.65:1)*(tolerance*.4+.6);
  if(rand()>chance)return false;
  a.belief={faithId:faith.id,conviction:round(clamp(38+appeal*25)),
    since:w.year,teacherId:from.id};
  appendLifeMoment(w,a.id,{year:w.year,kind:'discovery',
    text:'Chose to follow '+faith.name+' after talking with another person.',
    relatedIds:[from.id]},records);
  return true;
}
function evolveFaiths(w:World,rand:()=>number,
  locals:Map<number,number[]>,people:Map<number,Agent>,
  residents:Map<number,Agent[]>,records:Map<number,World['lineage'][number]>):void{
  const c=w.culture!,faiths=new Map(c.faiths.map(f=>[f.id,f]));
  // Founders are individuals with lived experiences, not racial templates.
  // Nearby people must exist, but they aren't forced to become believers.
  if(w.year>=12&&w.year%4===0&&c.faiths.length<100){
    for(const s of w.settlements){
      if(c.faiths.length>=100)break;
      const community=(residents.get(s.id)??[]).filter(adult);
      if(community.length<5||community.some(a=>a.belief&&
        (a.belief.conviction??0)>58))continue;
      const likely=community.filter(a=>!a.belief&&a.age>=20&&
        a.development&&a.development.memories.length>=1&&
        a.development.values.tradition+a.development.values.discovery>=94&&
        (a.development.skills.knowledge>=2||
          a.development.values.community>=50));
      if(!likely.length)continue;
      const founder=likely[(s.id+w.year)%likely.length];
      if(rand()>.21)continue;
      const theme=themeFor(w,founder),id=c.nextFaithId++;
      const faith:Faith={id,name:names[theme]+(c.faiths.some(f=>f.name===names[theme])?
        ' of '+s.name:''),theme,founderId:founder.id,founded:w.year,
        tenet:tenets[theme],tolerance:round(clamp(
          founder.development!.empathy*.65+founder.development!.values.independence*.35))};
      c.faiths.push(faith);faiths.set(id,faith);
      founder.belief={faithId:id,conviction:72,since:w.year};
      appendLifeMoment(w,founder.id,{year:w.year,kind:'founding',
        text:'Founded '+faith.name+' after reflecting on lived experiences.'},records);
      record(w,'faith',founder.id+' founded '+faith.name+' in '+s.name+'.',id,s.id);
    }
  }
  // Faith spreads through actual contact and shared language. Households,
  // friends and mentors can teach; independent minds can decline or change.
  for(const a of w.agents){
    const d=a.development;
    if(!d||a.age<traitProfile(a.ancestry).maturity*.48||
      (w.year+a.id)%3!==0)continue;
    const closeIds=[...(a.parents??[]),...d.caregiverIds,
      ...(a.partnerId?[a.partnerId]:[]),...(d.mentorId?[d.mentorId]:[]),
      ...d.friends];
    let teacher:Agent|undefined;
    for(const id of closeIds){
      const other=people.get(id);
      if(other?.belief&&near(a,other)<=4&&faiths.has(other.belief.faithId)){
        teacher=other;break;
      }
    }
    if(!teacher){
      for(let dy=-2;dy<=2&&!teacher;dy++)for(let dx=-2;dx<=2&&!teacher;dx++){
        const x=a.x+dx,y=a.y+dy;
        if(x<0||y<0||x>=w.width||y>=w.height)continue;
        for(const id of locals.get(y*w.width+x)??[]){
          const other=people.get(id);
          if(other?.belief&&other.id!==a.id&&faiths.has(other.belief.faithId)){
            teacher=other;break;
          }
        }
      }
    }
    if(!teacher?.belief)continue;
    const faith=faiths.get(teacher.belief.faithId)!;
    if(a.belief?.faithId===faith.id){
      a.belief.conviction=round(clamp(a.belief.conviction+.1));continue;
    }
    hearFaith(w,a,teacher,faith,rand,records);
  }
  // Neighbors from different traditions can learn respect or encounter
  // friction. Tolerance and lived empathy matter more than faith labels.
  if(w.year%6===0){
    for(const a of w.agents){
      if(!a.belief||!a.development||a.id%4!==0||!adult(a))continue;
      const ours=faiths.get(a.belief.faithId);if(!ours)continue;
      let other:Agent|undefined;
      for(let dy=-1;dy<=1&&!other;dy++)for(let dx=-1;dx<=1&&!other;dx++){
        const x=a.x+dx,y=a.y+dy;
        if(x<0||y<0||x>=w.width||y>=w.height)continue;
        other=(locals.get(y*w.width+x)??[]).map(id=>people.get(id)).find(b=>
          b&&b.id!==a.id&&b.belief&&b.belief.faithId!==a.belief!.faithId);
      }
      if(!other?.belief||!other.development)continue;
      const theirs=faiths.get(other.belief.faithId);if(!theirs)continue;
      const openness=(ours.tolerance+theirs.tolerance+
        a.development.empathy+other.development.empathy)/4;
      if(openness>58&&rand()<.28){
        a.development.trust=round(clamp(a.development.trust+.22));
        a.development.skills.diplomacy=round(clamp(a.development.skills.diplomacy+.1));
      }else if(openness<44&&rand()<.22){
        a.development.trust=round(clamp(a.development.trust-.2));
        a.development.values.independence=round(clamp(
          a.development.values.independence+.08));
        const memories=a.development.memories;
        if(!memories.some(m=>m.otherId===other!.id&&m.kind==='hardship'&&
          w.year-m.year<12)){
          memories.push({year:w.year,kind:'hardship',otherId:other.id,
            detail:'Disagreed with a neighbor over beliefs.'});
          if(memories.length>18)a.development.memories=[memories[0],...memories.slice(-17)];
        }
      }
    }
  }
  // Convictions can soften or strengthen after lived experiences. Different
  // beliefs may create friction without defining anyone as good or evil.
  if(w.year%5===0){
    for(const a of w.agents){
      if(!a.belief||!a.development)continue;
      const faith=faiths.get(a.belief.faithId);
      if(!faith)continue;
      const match=a.development.values[faith.tenet]-a.development.values.independence;
      const hardship=a.development.memories.some(m=>m.kind==='hardship'&&
        m.year>=w.year-5);
      a.belief.conviction=round(clamp(a.belief.conviction+
        (match>=0?.8:-.6)-(hardship?.5:0)));
      if(a.belief.conviction<15&&rand()<.32){
        appendLifeMoment(w,a.id,{year:w.year,kind:'discovery',
          text:'Questioned and left '+faith.name+'.'},records);
        a.belief=undefined;
      }
    }
  }
}

const policyScore=(a:Agent,p:CivicPolicy)=>{
  const d=a.development!;
  return p==='mutual_aid'?d.values.community*.65+d.empathy*.35:
    p==='learning'?d.values.discovery*.7+d.skills.knowledge*.3:
    p==='autonomy'?d.values.independence*.7+d.trust*.3:
    d.values.tradition*.75+(a.belief?.conviction??45)*.25;
};
function elect(w:World,s:Settlement,adults:Agent[],prior:Government|undefined):Government{
  const voters=adults.slice(0,160);
  const mean=(f:(a:Agent)=>number)=>voters.reduce((n,a)=>n+f(a),0)/voters.length;
  const community=mean(a=>a.development!.values.community);
  const tradition=mean(a=>a.development!.values.tradition);
  const independence=mean(a=>a.development!.values.independence);
  const kind:GovernmentKind=independence>61&&community>49?'assembly':
    community>57?'council':tradition>58?'elders':'chiefdom';
  const ordered=[...voters].sort((a,b)=>{
    const score=(x:Agent)=>(x.development?.skills.diplomacy??0)*.5+
      (x.development?.trust??0)*.3+(x.development?.values.community??0)*.2+
      (kind==='elders'?x.age*.12:0);
    return score(b)-score(a)||a.id-b.id;
  });
  const candidates=ordered.slice(0,Math.min(5,ordered.length));
  const votes=new Map(candidates.map(c=>[c.id,0]));
  for(const voter of voters){
    let best=candidates[0],value=-Infinity;
    for(const candidate of candidates){
      const d=voter.development!,cd=candidate.development!;
      const choice=(100-Math.abs(d.values.community-cd.values.community))* .38+
        (100-Math.abs(d.values.independence-cd.values.independence))*.3+
        cd.skills.diplomacy*.24+(voter.id===candidate.id?12:0)+
        (kind==='elders'?candidate.age*.08:0);
      if(choice>value){value=choice;best=candidate;}
    }
    votes.set(best.id,(votes.get(best.id)??0)+1);
  }
  const winner=candidates.slice().sort((a,b)=>
    (votes.get(b.id)??0)-(votes.get(a.id)??0)||a.id-b.id)[0];
  const policy=CIVIC_POLICIES.slice().sort((a,b)=>
    mean(v=>policyScore(v,b))-mean(v=>policyScore(v,a)))[0];
  const legitimacy=round(clamp(37+((votes.get(winner.id)??0)/voters.length)*52+
    (community-50)*.2));
  const government:Government={settlementId:s.id,kind,leaderId:winner.id,
    formed:prior?.formed??w.year,elected:w.year,policy,legitimacy,
    unrest:round(clamp((prior?.unrest??8)*.6)),turnout:voters.length};
  if(!prior||prior.leaderId!==winner.id||prior.kind!==kind||prior.policy!==policy){
    record(w,prior?'reform':'election',s.name+' chose a '+GOVERNMENT_LABELS[kind]+
      ', led by citizen #'+winner.id+', prioritizing '+POLICY_LABELS[policy]+'.',
    undefined,s.id);
    appendLifeMoment(w,winner.id,{year:w.year,kind:'founding',
      text:'Chosen to lead '+s.name+' as '+GOVERNMENT_LABELS[kind]+'.'});
  }
  return government;
}
function applyPolicy(w:World,s:Settlement,g:Government,adults:Agent[]):void{
  const treasury=s.economy;
  if(!treasury)return;
  // Rotate attendance so a few residents nearest one map edge don't receive
  // every lesson and civic benefit throughout their entire lives.
  const offset=(w.year+s.id)%adults.length;
  const participants=[...adults.slice(offset),...adults.slice(0,offset)].slice(0,16);
  const budget=treasury.coins;
  if(g.policy==='mutual_aid'&&budget>=.6&&treasury.food>=1){
    const hungry=adults.filter(a=>a.energy<80||a.health<75).sort((a,b)=>
      (a.energy+a.health)-(b.energy+b.health))[0];
    if(hungry){treasury.coins=round(budget-.6);
      treasury.food=round(treasury.food-1);
      hungry.energy=clamp(hungry.energy+4);
      hungry.health=clamp(hungry.health+1);}
  }else if(g.policy==='learning'&&budget>=.5&&participants.length){
    treasury.coins=round(budget-.5);
    for(const a of participants.slice(0,3))if(a.development)
      a.development.skills.knowledge=round(clamp(a.development.skills.knowledge+.22));
  }else if(g.policy==='tradition'&&budget>=.4){
    treasury.coins=round(budget-.4);
    for(const a of participants)if(a.development){
      a.development.values.tradition=round(clamp(a.development.values.tradition+.06));
      if(a.belief)a.belief.conviction=round(clamp(a.belief.conviction+.08));
    }
  }else if(g.policy==='autonomy'){
    for(const a of participants)if(a.development)
      a.development.values.independence=round(clamp(a.development.values.independence+.06));
  }
}
function evolveGovernments(w:World,residents:Map<number,Agent[]>):void{
  const c=w.culture!,existing=new Map(c.governments.map(g=>[g.settlementId,g]));
  const next:Government[]=[];
  for(const s of w.settlements){
    const adults=(residents.get(s.id)??[]).filter(a=>adult(a)&&a.development);
    if(adults.length<4)continue;
    const prior=existing.get(s.id);
    if(!prior&&w.year<15)continue;
    const alive=adults.some(a=>a.id===prior?.leaderId);
    const overdue=!!prior&&(w.year-prior.elected>=8||prior.unrest>=68);
    const government=!prior||!alive||overdue?elect(w,s,adults,prior):prior;
    if(prior&&government===prior){
      const support=adults.slice(0,100).reduce((sum,a)=>sum+
        policyScore(a,government.policy),0)/Math.min(100,adults.length);
      government.unrest=round(clamp(government.unrest+
        (support<48?2:support>61?-1:.2)+
        (government.legitimacy<55?.5:0)));
      if(government.unrest>55&&w.year%5===0)
        record(w,'dissent',s.name+' residents debated the current government.',
          undefined,s.id);
    }
    applyPolicy(w,s,government,adults);
    next.push(government);
  }
  c.governments=next;
}

export function advanceCulture(w:World,rand:()=>number):void{
  w.culture??=state();
  if(w.agents.length===0)return;
  const people=new Map(w.agents.map(a=>[a.id,a]));
  const locals=residentIndex(w.agents,w.width);
  const residents=new Map<number,Agent[]>();
  for(const s of w.settlements){
    const nearby:Agent[]=[];
    for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
      const x=s.x+dx,y=s.y+dy;
      if(x<0||y<0||x>=w.width||y>=w.height)continue;
      for(const id of locals.get(y*w.width+x)??[]){
        const a=people.get(id);if(a)nearby.push(a);
      }
    }
    residents.set(s.id,nearby);
  }
  const records=new Map(w.lineage.map(r=>[r.id,r]));
  evolveFaiths(w,rand,locals,people,residents,records);
  evolveGovernments(w,residents);
}

export function validCulture(w:World):boolean{
  if(w.culture===undefined)return w.agents.every(a=>a.belief===undefined);
  const c=w.culture,ids=new Set<number>(),towns=new Set<number>();
  const validId=(n:number)=>Number.isSafeInteger(n)&&n>0;
  if(!c||!validId(c.nextFaithId)||!Array.isArray(c.faiths)||
    c.faiths.length>100||!Array.isArray(c.governments)||
    c.governments.length>w.settlements.length||
    !Array.isArray(c.history)||c.history.length>180)return false;
  for(const f of c.faiths){
    if(!f||!validId(f.id)||ids.has(f.id)||f.id>=c.nextFaithId||
      typeof f.name!=='string'||f.name.length<3||f.name.length>100||
      !FAITH_THEMES.includes(f.theme)||!validId(f.founderId)||
      !Number.isInteger(f.founded)||f.founded<0||f.founded>w.year||
      !['community','independence','tradition','discovery'].includes(f.tenet)||
      !Number.isFinite(f.tolerance)||f.tolerance<0||f.tolerance>100)return false;
    ids.add(f.id);
  }
  for(const a of w.agents){
    const b=a.belief;
    if(b===undefined)continue;
    if(!b||!ids.has(b.faithId)||!Number.isFinite(b.conviction)||
      b.conviction<0||b.conviction>100||!Number.isInteger(b.since)||
      b.since<0||b.since>w.year||
      (b.teacherId!==undefined&&!validId(b.teacherId)))return false;
  }
  for(const g of c.governments){
    if(!g||!validId(g.settlementId)||towns.has(g.settlementId)||
      !w.settlements.some(s=>s.id===g.settlementId)||
      !GOVERNMENT_KINDS.includes(g.kind)||!validId(g.leaderId)||
      !Number.isInteger(g.formed)||g.formed<0||g.formed>w.year||
      !Number.isInteger(g.elected)||g.elected<g.formed||g.elected>w.year||
      !CIVIC_POLICIES.includes(g.policy)||!Number.isFinite(g.legitimacy)||
      g.legitimacy<0||g.legitimacy>100||!Number.isFinite(g.unrest)||
      g.unrest<0||g.unrest>100||!Number.isInteger(g.turnout)||
      g.turnout<1||g.turnout>160)return false;
    towns.add(g.settlementId);
  }
  return c.history.every(e=>e&&Number.isInteger(e.year)&&e.year>=0&&
    e.year<=w.year&&['faith','election','reform','dissent'].includes(e.kind)&&
    typeof e.description==='string'&&e.description.length<=220&&
    (e.faithId===undefined||validId(e.faithId))&&
    (e.settlementId===undefined||validId(e.settlementId)));
}
