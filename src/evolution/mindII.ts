/** WorldForge v1.7 — Mind Engine II.
 * Persistent, inspectable multi-step agendas. Plans are not random scripts:
 * priorities come from real needs, remembered experiences, responsibilities,
 * personal values, existing relationships, chosen belief and annual intentions.
 * Every decision can be reconsidered; interruption does not erase an earlier
 * intention. An agent may also prefer living without an explicit agenda.
 */
import type {Agent,World} from './engine';
import type {Household} from './development';
import {cloneDevelopment,lifeStage} from './development';
import {residentIndex,tileCapacity,addResident,removeResident} from './density';
import {traitProfile} from './family';

export const PURPOSES=['survive','recover','learn','explore','connect','care',
  'work','create','reflect'] as const;
export type Purpose=typeof PURPOSES[number];
export const PURPOSE_LABELS:Record<Purpose,string>={
  survive:'Secure food',recover:'Recover strength',learn:'Learn something new',
  explore:'Discover the world',connect:'Deepen a relationship',
  care:'Support family',work:'Contribute to work',
  create:'Develop a craft',reflect:'Explore a belief',
};
export const STEP_KINDS=['prepare','travel','forage','rest','practice','talk',
  'help','work','observe','share','reflect'] as const;
export type StepKind=typeof STEP_KINDS[number];
export const STEP_LABELS:Record<StepKind,string>={
  prepare:'Prepare',travel:'Travel',forage:'Gather provisions',rest:'Recover',
  practice:'Practice',talk:'Talk with someone',help:'Offer help',
  work:'Perform work',observe:'Study surroundings',share:'Share findings',
  reflect:'Reflect',
};
export type DateStamp={year:number;day:number};
export type PlanStep={kind:StepKind;reason:string;needed:number;done:number;
  target?:{x:number;y:number};personId?:number};
export type MortalPlan={id:number;purpose:Purpose;created:DateStamp;
  priority:number;motives:string[];status:'active'|'queued'|'paused';
  cursor:number;steps:PlanStep[];pausedBecause?:string;
  retryAfter?:number;interruptions?:number};
export type PlanOutcome={year:number;day:number;purpose:Purpose;
  outcome:'completed'|'abandoned'|'interrupted';reason:string};
export type ReasonedChoice={year:number;day:number;purpose:Purpose;
  decision:'began'|'paused'|'resumed'|'changed'|'completed';
  explanation:string;alternatives:string[]};
export type EmotionalState={stress:number;hope:number;loneliness:number};
export type Cognition={nextId:number;agenda:MortalPlan[];history:PlanOutcome[];
  decisions:ReasonedChoice[];emotions:EmotionalState;
  lastReview?:DateStamp;today?:{year:number;day:number;action:StepKind|'idle';
    explanation:string};
  route?:{target:number;indices:number[];cursor:number};
  trail:number[];blockedDays:number};

const clamp=(n:number)=>Math.min(100,Math.max(0,n));
const round=(n:number)=>Math.round(n*100)/100;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const time=(w:World,day:number):DateStamp=>({year:w.year,day});
const adult=(a:Agent)=>a.age>=traitProfile(a.ancestry).maturity;
const recentHardship=(a:Agent,year:number)=>a.development?.memories.some(m=>
  m.kind==='hardship'&&year-m.year<8)||false;

export function initialCognition():Cognition{return {nextId:1,agenda:[],
  history:[],decisions:[],emotions:{stress:18,hope:55,loneliness:24},
  trail:[],blockedDays:0};}
export function cloneCognition(c:Cognition):Cognition{return {...c,
  agenda:c.agenda.map(p=>({...p,created:{...p.created},motives:[...p.motives],
    steps:p.steps.map(s=>({...s,target:s.target?{...s.target}:undefined}))})),
  history:c.history.map(h=>({...h})),decisions:c.decisions.map(d=>({...d,
    alternatives:[...d.alternatives]})),emotions:{...c.emotions},
  lastReview:c.lastReview?{...c.lastReview}:undefined,
  today:c.today?{...c.today}:undefined,
  route:c.route?{...c.route,indices:[...c.route.indices]}:undefined,
  trail:[...c.trail]};}
export function validCognition(c:Cognition,w:World):boolean{
  if(!c||!Number.isSafeInteger(c.nextId)||c.nextId<1||
    !Array.isArray(c.agenda)||c.agenda.length>8||
    !Array.isArray(c.history)||c.history.length>14||
    !Array.isArray(c.decisions)||c.decisions.length>18||
    !Array.isArray(c.trail)||c.trail.length>24||
    !Number.isInteger(c.blockedDays)||c.blockedDays<0||c.blockedDays>10)return false;
  const bounded=(v:number)=>Number.isFinite(v)&&v>=0&&v<=100;
  if(!c.emotions||!Object.values(c.emotions).every(bounded))return false;
  const stamp=(s:DateStamp)=>!!s&&Number.isInteger(s.year)&&s.year>=0&&
    s.year<=w.year&&Number.isInteger(s.day)&&s.day>=0&&s.day<=364;
  const position=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&
    x>=0&&y>=0&&x<w.width&&y<w.height;
  const index=(v:number)=>Number.isInteger(v)&&v>=0&&v<w.tiles.length;
  const statement=(s:string,max=160)=>typeof s==='string'&&s.length<=max;
  if(c.lastReview&&!stamp(c.lastReview)||
    c.today&&(!stamp(c.today)||!statement(c.today.explanation)||
      ![...STEP_KINDS,'idle'].includes(c.today.action))||
    c.route&&(!index(c.route.target)||c.route.indices.length>180||
      !c.route.indices.every(index)||!Number.isInteger(c.route.cursor)||
      c.route.cursor<0||c.route.cursor>=c.route.indices.length)||
    !c.trail.every(index))return false;
  const ids=new Set<number>();
  if(!c.agenda.every(p=>{
    if(!p||!Number.isSafeInteger(p.id)||p.id<1||ids.has(p.id)||
      !PURPOSES.includes(p.purpose)||!stamp(p.created)||
      !bounded(p.priority)||!['active','queued','paused'].includes(p.status)||
      !Array.isArray(p.motives)||p.motives.length>5||
      !p.motives.every(m=>statement(m))||
      !Array.isArray(p.steps)||p.steps.length<1||p.steps.length>12||
      !Number.isInteger(p.cursor)||p.cursor<0||p.cursor>=p.steps.length||
      p.pausedBecause!==undefined&&!statement(p.pausedBecause)||
      p.retryAfter!==undefined&&(!Number.isSafeInteger(p.retryAfter)||
        p.retryAfter<0||p.retryAfter>365*10000)||
      p.interruptions!==undefined&&(!Number.isInteger(p.interruptions)||
        p.interruptions<0||p.interruptions>5))return false;
    ids.add(p.id);
    return p.steps.every(s=>s&&STEP_KINDS.includes(s.kind)&&
      statement(s.reason)&&Number.isInteger(s.needed)&&s.needed>=1&&s.needed<=60&&
      Number.isInteger(s.done)&&s.done>=0&&s.done<=s.needed&&
      (!s.target||position(s.target.x,s.target.y))&&
      (s.personId===undefined||Number.isSafeInteger(s.personId)&&s.personId>0));
  }))return false;
  if(c.agenda.filter(p=>p.status==='active').length>1)return false;
  if(!c.history.every(h=>h&&stamp(h)&&PURPOSES.includes(h.purpose)&&
    ['completed','abandoned','interrupted'].includes(h.outcome)&&
    statement(h.reason)))return false;
  if(!c.decisions.every(d=>d&&stamp(d)&&PURPOSES.includes(d.purpose)&&
    ['began','paused','resumed','changed','completed'].includes(d.decision)&&
    statement(d.explanation,240)&&Array.isArray(d.alternatives)&&
    d.alternatives.length<=5&&d.alternatives.every(x=>statement(x))))return false;
  return true;
}

type MindContext={live:Map<number,Agent>;homes:Map<number,Household>;
  dependents:Map<number,number>;
  workplaces:Map<number,World['settlements'][number]>};
/** Scratch acceleration for sequential calendar days. This is never saved;
 * rebuilding it between different playback calls yields identical results. */
export type DayContext={occupied:Map<number,number[]>;capacities:Uint8Array;
  bridges:Set<number>;homes:Map<number,Household>;
  dependents:Map<number,number>;
  workplaces:Map<number,World['settlements'][number]>;
  /** Owned copies within one advanceWorldDays call. Never persisted. */
  ownedAgents:Map<number,Agent>};
export function createDayContext(w:World):DayContext{
  const dependents=new Map<number,number>();
  for(const a of w.agents)if(a.development?.householdId&&!adult(a)){
    const id=a.development.householdId;
    dependents.set(id,(dependents.get(id)??0)+1);
  }
  return {occupied:residentIndex(w.agents,w.width),capacities:tileCapacity(w),
    bridges:new Set(w.transport?.bridges.filter(b=>b.condition>25)
      .map(b=>b.index)??[]),
    homes:new Map((w.households??[]).map(h=>[h.id,h])),dependents,
    workplaces:new Map(w.settlements.map(s=>[s.id,s])),
    ownedAgents:new Map()};
}
type Motivation={purpose:Purpose;score:number;reasons:string[];
  target?:{x:number;y:number};personId?:number};
function motives(w:World,a:Agent,context:MindContext):Motivation[]{
  const {live,homes,dependents,workplaces}=context;
  const d=a.development,life=a.dailyLife,health=a.health,energy=a.energy;
  const tired=life?.fatigue??15,company=life?.socialNeed??25;
  const feelings=a.cognition?.emotions;
  const stress=feelings?.stress??20,hope=feelings?.hope??55;
  const loneliness=feelings?.loneliness??25;
  const resilience=d?.resilience??50,discovery=d?.values.discovery??50;
  const stage=lifeStage(a);
  const duty=d?.values.community??50,craft=d?.skills.craft??0;
  const memory=recentHardship(a,w.year);
  const household=homes.get(d?.householdId??-1);
  const dependentCount=dependents.get(household?.id??-1)??0;
  const contact=[a.partnerId,...(d?.friends??[]),d?.mentorId]
    .filter((id):id is number=>!!id&&live.has(id));
  const nearest=contact.map(id=>live.get(id)!).sort((x,y)=>
    distance(a,x)-distance(a,y))[0];
  const target=a.mind?.target;
  const workplace=a.work?workplaces.get(a.work.settlementId):undefined;
  return [
    {purpose:'survive',score:(energy<65?(65-energy)*2+39:5)+
      (memory?12:0),
      reasons:['Energy '+Math.round(energy)+'/100',memory?
        'Remembers past hardship':'Needs dependable provisions']},
    {purpose:'recover',score:tired*.65+(100-health)*.7+
      (100-resilience)*.12+stress*.25,
      reasons:['Fatigue '+Math.round(tired)+'/100',
        'Health '+Math.round(health)+'/100',
        'Stress '+Math.round(stress)+'/100']},
    {purpose:'care',score:dependentCount?39+duty*.35+dependentCount*5:6,
      reasons:['Household dependents '+dependentCount,
        'Community value '+Math.round(duty)+'/100'],target:household?.home},
    {purpose:'connect',score:company*.65+loneliness*.25+(nearest?23:0)+
      a.genes.social*10+
      (d?.memories.some(m=>m.kind==='loss'&&w.year-m.year<5)?13:0),
      reasons:['Need for company '+Math.round(company)+'/100',
        nearest?'Has someone worth visiting':'Wants a new connection',
        'Loneliness '+Math.round(loneliness)+'/100'],
      target:nearest?{x:nearest.x,y:nearest.y}:undefined,
      personId:nearest?.id},
    {purpose:'learn',score:25+discovery*.59+hope*.065+(d?.mentorId?13:0)+
      (stage==='adolescent'?23:0)+
      ((d?.skills.knowledge??0)<8?5:0)+
      (a.mind?.goal==='vocation'?8:0),
      reasons:['Discovery value '+Math.round(discovery)+'/100',
        d?.mentorId?'A mentor can help':'Learning from experience'],
      personId:d?.mentorId},
    {purpose:'explore',score:12+discovery*.62+a.genes.curiosity*13+
      (a.mind?.goal==='explore'||a.mind?.goal==='venture'?11:0)-
      tired*.25-stress*.12+hope*.12-
      (stage==='adolescent'?20:0)+(energy>88?6:0),
      reasons:['Curiosity '+a.genes.curiosity.toFixed(2),
        'Discovery value '+Math.round(discovery)+'/100',
        target?'A destination is in mind':'Wants to find new ground',
        'Hope '+Math.round(hope)+'/100'],target},
    {purpose:'work',score:a.work?35+duty*.42:4,
      reasons:[a.work?'Accepted work as '+a.work.job:'No current employer',
        'Community value '+Math.round(duty)+'/100'],
      target:workplace?{x:workplace.x,y:workplace.y}:undefined},
    {purpose:'create',score:18+craft*.6+
      (d?.career==='artisan'?35:0)+(d?.values.independence??50)*.2,
      reasons:['Craft ability '+Math.round(craft)+'/100',
        d?.career==='artisan'?'Chosen artisan path':'Personal expression']},
    {purpose:'reflect',score:a.belief?28+a.belief.conviction*.5:8,
      reasons:[a.belief?'A chosen faith':'Still forming personal beliefs',
        'Tradition value '+Math.round(d?.values.tradition??50)+'/100']},
  ];
}

const step=(kind:StepKind,reason:string,needed=2,
  target?:{x:number;y:number},personId?:number):PlanStep=>({kind,reason,
    needed,done:0,...(target?{target:{...target}}:{}),
    ...(personId?{personId}:{})});
function itinerary(m:Motivation,context:MindContext,a:Agent):PlanStep[]{
  const home=context.homes.get(a.development?.householdId??-1)?.home;
  switch(m.purpose){
    case 'survive':return [step('forage','Obtain actual provisions.',3),
      step('rest','Recover enough strength to continue.',3),
      step('reflect','Review whether basic needs are secure.')];
    case 'recover':return [step('rest','Put recovery ahead of other commitments.',4),
      step('reflect','Consider the physical and emotional outcome.',2)];
    case 'learn':return [
      ...(m.personId?
        [step('travel','Go where the mentor can actually be met.',1,{
          x:context.live.get(m.personId)?.x??a.x,
          y:context.live.get(m.personId)?.y??a.y},m.personId),
          step('talk','Ask a trusted mentor for guidance.',2,undefined,m.personId)]:[]),
      step('practice','Practice a real skill over multiple days.',5),
      step('observe','Apply a lesson to the immediate environment.',3),
      step('share','Pass on a useful experience.',2)];
    case 'explore':return [step('prepare','Gather courage and check supplies.',3),
      ...(m.target?[step('travel','Follow a chosen route.',1,m.target)]:[]),
      step('observe','Study an unfamiliar place firsthand.',4),
      ...(home&&m.target&&distance(home,m.target)>3?
        [step('travel','Return to familiar shelter.',1,home)]:[]),
      step('share','Tell someone what was learned.',2),
      step('reflect','Decide what the journey changed.',2)];
    case 'connect':return [
      ...(m.target?[step('travel','Meet a person rather than speaking remotely.',1,
        m.target,m.personId)]:[]),
      step('talk','Listen and exchange personal ideas.',3,undefined,m.personId),
      step('help','Offer practical support where possible.',2,undefined,m.personId),
      step('reflect','Think about the relationship.',2)];
    case 'care':return [
      ...(home?[step('travel','Return to family or household.',1,home)]:[]),
      step('help','Provide care to someone dependent.',4),
      step('rest','Rest after fulfilling family duties.',2)];
    case 'work':return [
      ...(m.target?[step('travel','Reach the workplace.',1,m.target)]:[]),
      step('work','Contribute effort in a chosen profession.',5),
      step('rest','Make time to recover from labor.',2)];
    case 'create':return [step('prepare','Collect thoughts and materials.',3),
      step('practice','Improve craft through repetition.',5),
      step('share','Show the result to another person.',2)];
    case 'reflect':return [step('reflect','Consider an independently chosen belief.',3),
      step('talk','Seek a different perspective.',2),
      step('reflect','Reconsider the personal meaning.',2)];
  }
}
function record(c:Cognition,at:DateStamp,p:MortalPlan,
  decision:ReasonedChoice['decision'],explanation:string,
  alternatives:string[]=[]){
  c.decisions.push({...at,purpose:p.purpose,decision,explanation,
    alternatives:alternatives.slice(0,5)});
  if(c.decisions.length>18)c.decisions=c.decisions.slice(-18);
}
function archive(c:Cognition,at:DateStamp,p:MortalPlan,
  outcome:PlanOutcome['outcome'],reason:string){
  c.history.push({...at,purpose:p.purpose,outcome,reason});
  if(c.history.length>14)c.history=c.history.slice(-14);
}
function emotions(a:Agent):EmotionalState{
  const d=a.development,life=a.dailyLife;
  const loneliness=clamp((life?.socialNeed??30)*.86+
    (d?.friends.length?0:13));
  const stress=clamp((100-a.energy)*.25+(100-a.health)*.31+
    (life?.fatigue??15)*.29+loneliness*.11+
    (life?.encounters.at(-1)?.kind==='disagreement'?5:0));
  const hope=clamp((life?.morale??60)*.56+(d?.resilience??50)*.28+
    (d?.values.discovery??50)*.15+(d?.friends.length??0)*2-stress*.16);
  return {stress:round(stress),hope:round(hope),loneliness:round(loneliness)};
}
function capacity(a:Agent,c:Cognition):number{
  if(['infant','child'].includes(lifeStage(a)))return 0;
  const d=a.development;
  const independent=(d?.values.independence??50)>66&&
    a.energy>72&&c.emotions.stress<30;
  if(independent&&(a.id*7+a.age)%4===0)return 0;
  const ambition=(d?.values.discovery??50)*.025+
    (d?.skills.knowledge??0)*.05+a.genes.curiosity*.85+
    (d?.values.community??50)*.01;
  return Math.max(1,Math.min(8,Math.floor(ambition)));
}
function chooseNext(c:Cognition,at:DateStamp):void{
  if(c.agenda.some(p=>p.status==='active'))return;
  const next=c.agenda.filter(p=>p.status==='queued').sort((a,b)=>
    b.priority-a.priority||a.id-b.id)[0];
  if(next){next.status='active';next.pausedBecause=undefined;
    c.route=undefined;c.blockedDays=0;
    record(c,at,next,'resumed','Returned to this intention after reassessing other needs.');}
}
function urgency(a:Agent):string|undefined{
  if(a.health<38)return 'Health is dangerously low.';
  if(a.energy<43)return 'Immediate hunger outranks the earlier plan.';
  if((a.dailyLife?.fatigue??0)>85)return 'Exhaustion requires a break.';
  if((a.cognition?.emotions.stress??0)>86)
    return 'Emotional strain calls for rest and reconsideration.';
}
const absoluteDay=(year:number,day:number)=>year*365+day;
function pause(c:Cognition,p:MortalPlan,at:DateStamp,reason:string,days=12){
  p.status='paused';p.pausedBecause=reason;
  p.retryAfter=absoluteDay(at.year,at.day)+days;
  p.interruptions=Math.min(5,(p.interruptions??0)+1);
  p.priority=round(Math.max(0,p.priority-(days>=12?8:2)));
  record(c,at,p,'paused',reason+' Earlier steps remain remembered.');
  archive(c,at,p,'interrupted',reason);
  c.route=undefined;c.blockedDays=0;
}
function complete(w:World,a:Agent,p:MortalPlan,day:number):void{
  const c=a.cognition!,at=time(w,day);
  archive(c,at,p,'completed','Finished '+p.steps.length+
    ' deliberate steps: '+p.motives.join('; ')+'.');
  record(c,at,p,'completed','The planned sequence was completed.');
  c.agenda=c.agenda.filter(entry=>entry.id!==p.id);
  c.route=undefined;c.blockedDays=0;chooseNext(c,at);
}

/** Reconsider without destroying old intentions. No external neural service is
 * invoked. Different lives produce different plans, with evidence retained. */
export function reviewMind(w:World,a:Agent,day:number,
  context:MindContext):void{
  if(!a.development)return;
  const c=a.cognition??(a.cognition=initialCognition()),at=time(w,day);
  c.emotions=emotions(a);
  const isUrgent=!!urgency(a);
  const reviewDue=day%7===1||!c.agenda.length||
    isUrgent&&c.agenda.some(p=>p.status==='active'&&
      !['survive','recover'].includes(p.purpose));
  if(!reviewDue||c.lastReview?.year===at.year&&
    c.lastReview.day===at.day)return;
  c.lastReview=at;
  for(const p of [...c.agenda]){
    const required=p.steps.some(s=>s.personId&&!context.live.has(s.personId));
    if(required&&['connect','care'].includes(p.purpose)){
      archive(c,at,p,'abandoned','The person they hoped to meet is no longer here.');
      record(c,at,p,'changed','A relationship changed; this goal needs a new path.');
      c.agenda=c.agenda.filter(q=>q.id!==p.id);
    }
    if(p.purpose==='reflect'&&!a.belief){
      archive(c,at,p,'abandoned','Their convictions changed.');
      c.agenda=c.agenda.filter(q=>q.id!==p.id);
    }
  }
  const urgent=urgency(a);
  const active=c.agenda.find(p=>p.status==='active');
  if(urgent&&active&&active.purpose!=='survive'&&active.purpose!=='recover'){
    pause(c,active,at,urgent,7);
  }
  const items=motives(w,a,context).sort((x,y)=>y.score-x.score);
  const current=c.agenda.find(p=>p.status==='active');
  const most=items[0];
  if(!urgent&&current&&most&&current.purpose!==most.purpose&&
    most.score>current.priority+27&&
    (absoluteDay(at.year,at.day)-absoluteDay(
      current.created.year,current.created.day))>=7){
    pause(c,current,at,'A new personal priority outweighed the earlier intention.',10);
  }
  const limit=capacity(a,c);
  if(c.agenda.length<limit||urgent&&c.agenda.length<8){
    const existing=new Set(c.agenda.map(p=>p.purpose));
    const wanted=urgent?items.find(m=>m.purpose===
      (a.energy<43?'survive':'recover')):
      items.find(m=>m.score>=42&&!existing.has(m.purpose)&&
        (m.purpose!=='care'||adult(a)));
    if(wanted&&!existing.has(wanted.purpose)){
      const p:MortalPlan={id:c.nextId++,purpose:wanted.purpose,created:at,
        priority:round(clamp(wanted.score)),motives:wanted.reasons.slice(0,5),
        status:'queued',cursor:0,steps:itinerary(wanted,context,a)};
      c.agenda.push(p);
      const selected=c.agenda.find(q=>q.status==='active');
      if(urgent&&selected&&p.priority>selected.priority){
        pause(c,selected,at,urgent,7);
      }
      record(c,at,p,'began',
        'Chose '+PURPOSE_LABELS[p.purpose].toLowerCase()+' because '+
          p.motives.join('; ')+'.',items.filter(m=>m.purpose!==p.purpose)
          .slice(0,3).map(m=>PURPOSE_LABELS[m.purpose]+' '+Math.round(m.score)));
    }
  }
  // Recovery can restore a paused plan after the urgent need has passed.
  if(!urgent)for(const p of [...c.agenda])if(p.status==='paused'&&
    absoluteDay(at.year,at.day)>=(p.retryAfter??0)){
    if((p.interruptions??0)>=5){
      archive(c,at,p,'abandoned','Repeated obstacles made this plan impractical.');
      record(c,at,p,'changed','Let go of a plan after repeated interruptions.');
      c.agenda=c.agenda.filter(q=>q.id!==p.id);continue;
    }
    p.status='queued';p.pausedBecause=undefined;p.retryAfter=undefined;
  }
  chooseNext(c,at);
}

const neighbors=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]] as const;
/** Bounded A* with occupancy, bridge and corner checks. Each route contains
 * only physically adjacent land or intact bridge tiles; no water teleporting. */
export function findMortalRoute(w:World,a:Agent,target:{x:number;y:number},
  occupied:Map<number,number[]>,capacities:ArrayLike<number>,
  bridge:Set<number>,limit=300):number[]{
  const start=a.y*w.width+a.x,goal=target.y*w.width+target.x;
  if(start===goal)return [start];
  const walkable=(x:number,y:number)=>{
    if(x<0||y<0||x>=w.width||y>=w.height)return false;
    const index=y*w.width+x;
    if(w.tiles[index].biome==='water'&&!bridge.has(index))return false;
    // Capacity counts are physical occupancy, never camera-dependent.
    return index===goal||(occupied.get(index)?.length??0)<capacities[index];
  };
  const open=[start],scores=new Map<number,number>([[start,0]]);
  const previous=new Map<number,number>();
  const closed=new Set<number>();
  const heuristic=(index:number)=>Math.max(
    Math.abs(index%w.width-target.x),
    Math.abs(Math.floor(index/w.width)-target.y));
  let bestReached=start,bestDistance=heuristic(start);
  const trace=(destination:number)=>{
    const route=[destination];let p=destination;
    while(previous.has(p)){p=previous.get(p)!;route.push(p);}
    route.reverse();return route.length<=180?route:route.slice(0,180);
  };
  let visits=0;
  while(open.length&&visits++<limit){
    let chosen=0,best=Infinity;
    for(let i=0;i<open.length;i++){
      const idx=open[i],f=(scores.get(idx)??Infinity)+heuristic(idx);
      if(f<best){best=f;chosen=i;}
    }
    const current=open.splice(chosen,1)[0];
    if(current===goal)return trace(goal);
    const remaining=heuristic(current);
    if(remaining<bestDistance){bestDistance=remaining;bestReached=current;}
    closed.add(current);
    const cx=current%w.width,cy=Math.floor(current/w.width);
    for(const [dx,dy] of neighbors){
      const x=cx+dx,y=cy+dy,index=y*w.width+x;
      if(!walkable(x,y)||closed.has(index))continue;
      if(dx&&dy&&!walkable(cx+dx,cy)&&!walkable(cx,cy+dy))continue;
      const tentative=(scores.get(current)??0)+(dx&&dy?1.414:1);
      if(tentative>=(scores.get(index)??Infinity))continue;
      scores.set(index,tentative);previous.set(index,current);
      if(!open.includes(index))open.push(index);
    }
  }
  // On vast maps a person first chooses a reachable intermediate segment.
  // They can keep extending that route over subsequent days without a global
  // 100,000-cell search. If nowhere nearer is reachable, they genuinely stop.
  return bestDistance<heuristic(start)-1?trace(bestReached):[];
}

/** Called for each calendar day. Only participants with actual plans are
 * edited, and planning/route calculations are memoized within their agenda.
 * Weekly scheduling and yearly economics still have separate responsibilities.
 */
export function advanceMindDay(previous:World,day:number,
  dayContext:DayContext=createDayContext(previous)):World{
  if(!previous.agents.length)return previous;
  // Current time is stored in the passed day, not read from a stale calendar.
  const scheduled=new Set<number>();
  const agents=previous.agents.map(old=>{
    const active=old.cognition?.agenda.some(p=>p.status==='active');
    const due=day%7===1||!!active||!!urgency(old);
    if(due&&old.development&&!old.work?.tradeId)scheduled.add(old.id);
    if(dayContext.ownedAgents.get(old.id)===old)return old;
    const copy={...old,cognition:old.cognition?cloneCognition(old.cognition):undefined};
    dayContext.ownedAgents.set(old.id,copy);
    return copy;
  });
  let w:World={...previous,agents};
  // Rebuild only the mutable occupancy index. Terrain/capacity are immutable
  // during a calendar day; the economy itself only updates annually.
  const {occupied,capacities,bridges,homes,dependents,workplaces}=dayContext;
  const byId=new Map(agents.map(a=>[a.id,a]));
  const context:MindContext={live:byId,homes,dependents,workplaces};
  let tiles=previous.tiles;
  for(const a of agents){
    if(!scheduled.has(a.id))continue;
    reviewMind(w,a,day,context);
    const c=a.cognition!,active=c.agenda.find(p=>p.status==='active');
    if(!active){c.today={year:w.year,day,action:'idle',
      explanation:'No deliberate plan is being followed today.'};continue;}
    const step=active.steps[active.cursor];
    let progressed=false;
    const targetPerson=step.personId?byId.get(step.personId):undefined;
    const target=targetPerson&&step.kind==='travel'?targetPerson:step.target;
    if(step.kind==='travel'){
      if(!target){progressed=true;c.route=undefined;}
      else if(distance(a,target)<=1){progressed=true;c.route=undefined;}
      else if(day%3===a.id%3){
        const desired=target.y*w.width+target.x;
        const route=c.route;
        if(!route||route.target!==desired||
          route.indices[route.cursor]!==a.y*w.width+a.x||
          route.cursor>=route.indices.length-1){
          const indices=findMortalRoute(w,a,target,occupied,capacities,bridges);
          c.route=indices.length>1?{target:desired,indices,cursor:0}:undefined;
        }
        const next=c.route?.indices[c.route.cursor+1];
        if(next!==undefined&&
          (occupied.get(next)?.length??0)<capacities[next]&&
          (w.tiles[next].biome!=='water'||bridges.has(next))){
          const old=a.y*w.width+a.x;
          removeResident(occupied,old,a.id);addResident(occupied,next,a.id);
          a.x=next%w.width;a.y=Math.floor(next/w.width);
          c.route!.cursor++;c.blockedDays=0;
          c.trail.push(next);if(c.trail.length>24)c.trail.shift();
          progressed=distance(a,target)<=1;
        }else{
          c.blockedDays=Math.min(10,c.blockedDays+1);
          c.route=undefined;
          if(c.blockedDays>=5){
            pause(c,active,time(w,day),
              'A blocked route interrupted travel; seeking a safer path.',21);
            chooseNext(c,time(w,day));
          }
        }
      }
    }else if(step.kind==='forage'){
      const index=a.y*w.width+a.x,food=tiles[index].food;
      if(food>=.18){
        if(tiles===previous.tiles)tiles=[...previous.tiles];
        tiles[index]={...tiles[index],food:round(Math.max(0,food-.14))};
        a.energy=round(clamp(a.energy+.65));progressed=true;
      }
    }else if(step.kind==='rest'){
      a.energy=round(clamp(a.energy+.12));
      if(a.dailyLife){a.dailyLife={...a.dailyLife,
        fatigue:round(clamp(a.dailyLife.fatigue-.7))};}
      progressed=true;
    }else if(step.kind==='practice'||step.kind==='observe'||
      step.kind==='work'||step.kind==='help'){
      if(!a.development)continue;
      a.development=cloneDevelopment(a.development);
      const skill=step.kind==='practice'?'knowledge':
        step.kind==='observe'?'navigation':step.kind==='help'?'care':
        a.work?.job==='farmer'?'foraging':'craft';
      a.development.skills[skill]=round(clamp(a.development.skills[skill]+.035));
      if(step.kind==='observe'){
        const here=w.tiles[a.y*w.width+a.x].biome;
        if(!a.development.knownBiomes.includes(here))
          a.development.knownBiomes.push(here);
      }
      if(step.kind==='help'&&active.purpose==='care'){
        const house=homes.get(a.development.householdId??-1);
        const child=house?.members.map(id=>byId.get(id))
          .find(person=>person&&person.id!==a.id&&!adult(person)&&
            distance(a,person)<=2&&person.energy<90);
        if(child&&a.energy>50){
          a.energy=round(clamp(a.energy-.28));
          child.energy=round(clamp(child.energy+.28));
        }
        progressed=!!child;
      }else progressed=true;
    }else if(step.kind==='talk'||step.kind==='share'){
      // Social exchanges remain physical and consensual. Weekly meetings
      // handle friendships; these steps never fabricate an absent listener.
      let someone=targetPerson&&distance(a,targetPerson)<=2?targetPerson:undefined;
      if(!someone)for(let dy=-1;dy<=1&&!someone;dy++)
        for(let dx=-1;dx<=1&&!someone;dx++){
          const x=a.x+dx,y=a.y+dy;
          if(x<0||y<0||x>=w.width||y>=w.height)continue;
          for(const id of occupied.get(y*w.width+x)??[]){
            const other=byId.get(id);
            if(!other||other.id===a.id||!other.development||
              a.development!.languages[other.species]<12||
              other.development.trust<26)continue;
            someone=other;break;
          }
        }
      progressed=!!someone;
      if(someone&&a.dailyLife){a.dailyLife={...a.dailyLife,
        morale:round(clamp(a.dailyLife.morale+.08)),
        socialNeed:round(clamp(a.dailyLife.socialNeed-.25))};}
    }else if(step.kind==='reflect'){
      if(a.dailyLife){a.dailyLife={...a.dailyLife,
        morale:round(clamp(a.dailyLife.morale+.14))};}
      progressed=true;
    }else progressed=true;
    const explanation=progressed?step.reason:step.kind==='travel'?
      'Following a safe route one tile at a time.':
      step.kind==='talk'||step.kind==='share'?
        'Hoping to meet a willing person nearby.':
        'Waiting for the conditions this step requires.';
    c.today={year:w.year,day,action:step.kind,explanation};
    if(!progressed&&step.kind!=='travel'){
      c.blockedDays=Math.min(10,c.blockedDays+1);
      if(c.blockedDays>=10){
        pause(c,active,time(w,day),
          'Could not complete '+STEP_LABELS[step.kind].toLowerCase()+
          ' under the current circumstances.',14);
        chooseNext(c,time(w,day));
      }
    }
    if(progressed){step.done++;c.blockedDays=0;
      if(step.done>=step.needed){active.cursor++;c.route=undefined;
        if(active.cursor>=active.steps.length)complete(w,a,active,day);}
    }
    if(!c.trail.length)c.trail=[a.y*w.width+a.x];
    else if(c.trail.at(-1)!==a.y*w.width+a.x){
      c.trail.push(a.y*w.width+a.x);if(c.trail.length>24)c.trail.shift();
    }
  }
  if(tiles!==previous.tiles)w={...w,tiles};
  return w;
}
