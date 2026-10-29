/** WorldForge v1.6 — weekly mortal routines and face-to-face social choices.
 * A single deterministic week is processed at its calendar boundary, whether
 * the player advances seven days at once or watches each individual day.
 * Ordinary shifts do not mint economic goods: annual work owns production.
 */
import type {Agent,World} from './engine';
import {cloneDevelopment,lifeStage} from './development';
import {activeTraitBonus,activeTraitEffect} from './traitEffects';
import {trainedSkillGain} from './skillTraining';
import {traitProfile} from './family';
import {relationshipScore,refusesConversation} from './socialJudgment';

export const ACTIVITIES=['rest','work','forage','study','care','socialize',
  'travel','craft','reflect'] as const;
export type Activity=typeof ACTIVITIES[number];
export const ACTIVITY_LABELS:Record<Activity,string>={
  rest:'Resting',work:'At work',forage:'Seeking food',study:'Learning',
  care:'Supporting family',socialize:'Meeting people',travel:'Exploring',
  craft:'Personal project',reflect:'Reflecting',
};
export type Encounter={year:number;day:number;withId:number;
  kind:'conversation'|'mentorship'|'friendship'|'disagreement'|'comfort'|
    'shared_goal'|'debate'|'reconciliation';
  topic?:'belief'|'future'|'family'|'hardship'|'learning'|'exploration';
  detail:string};
export type Familiarity={personId:number;meetings:number;regard?:number};
export type DailyLife={activity:Activity;reason:string;year:number;day:number;
  fatigue:number;socialNeed:number;morale:number;
  acquaintances:Familiarity[];encounters:Encounter[]};

const clamp=(v:number)=>Math.min(100,Math.max(0,v));
const round=(v:number)=>Math.round(v*100)/100;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function initialDailyLife():DailyLife{return {activity:'rest',
  reason:'Finding a rhythm in the world.',year:0,day:0,
  fatigue:16,socialNeed:24,morale:60,acquaintances:[],encounters:[]};}
export function cloneDailyLife(d:DailyLife):DailyLife{return {...d,
  acquaintances:d.acquaintances.map(c=>({...c})),
  encounters:d.encounters.map(e=>({...e}))};}
export function validDailyLife(d:DailyLife,year:number):boolean{
  const bounded=(n:number)=>Number.isFinite(n)&&n>=0&&n<=100;
  return !!d&&ACTIVITIES.includes(d.activity)&&
    typeof d.reason==='string'&&d.reason.length<=140&&
    Number.isInteger(d.year)&&d.year>=0&&d.year<=year&&
    Number.isInteger(d.day)&&d.day>=0&&d.day<=364&&
    bounded(d.fatigue)&&bounded(d.socialNeed)&&bounded(d.morale)&&
    Array.isArray(d.acquaintances)&&d.acquaintances.length<=6&&
    new Set(d.acquaintances.map(c=>c.personId)).size===d.acquaintances.length&&
    d.acquaintances.every(c=>c&&Number.isSafeInteger(c.personId)&&c.personId>0&&
      Number.isInteger(c.meetings)&&c.meetings>=1&&c.meetings<=999&&
      (c.regard===undefined||Number.isFinite(c.regard)&&
        c.regard>=-100&&c.regard<=100))&&
    Array.isArray(d.encounters)&&d.encounters.length<=6&&
    d.encounters.every(e=>e&&Number.isInteger(e.year)&&e.year>=0&&e.year<=year&&
      Number.isInteger(e.day)&&e.day>=0&&e.day<=364&&
      Number.isSafeInteger(e.withId)&&e.withId>0&&
      ['conversation','mentorship','friendship','disagreement','comfort',
        'shared_goal','debate','reconciliation'].includes(e.kind)&&
      (e.topic===undefined||['belief','future','family','hardship',
        'learning','exploration'].includes(e.topic))&&
      typeof e.detail==='string'&&e.detail.length<=140);
}

function decide(a:Agent,week:number,youngInHome:Set<number>,
  seed:number):[Activity,string]{
  const d=a.development,life=a.dailyLife!,stage=lifeStage(a);
  const curiosity=d?.values.discovery??50,community=d?.values.community??50;
  if(life.fatigue>67||a.health<48)
    return ['rest','Recovery takes priority over obligations.'];
  if(stage==='infant'||stage==='child'){
    if(week%3===0&&life.socialNeed>25)
      return ['socialize','Seeking familiar faces and companionship.'];
    return ['study','Learning by watching and asking questions.'];
  }
  if(a.energy<53)return ['forage','Hunger takes precedence over other plans.'];
  if(d?.householdId&&youngInHome.has(d.householdId)&&
    community>=48&&(week+a.id)%4===0)
    return ['care','Choosing to support younger household members.'];
  if(life.socialNeed>63||week%5===a.id%5&&a.genes.social>1.04)
    return ['socialize','Wanting company and conversation.'];
  if(a.mind?.goal==='venture'||a.mind?.goal==='explore'&&curiosity>53)
    if(week%4!==0)return ['travel','Following a personal desire to discover.'];
  if(a.work&&!a.work.tradeId&&(week+a.id)%5!==0)
    return ['work','Fulfilling an accepted community job.'];
  if(a.work?.tradeId||a.mind?.goal==='trade'||a.mind?.goal==='return_home')
    return ['travel','Continuing a chosen journey.'];
  const gift=activeTraitEffect(seed,a);
  if(gift&&(week+a.id)%4===0){
    const chosen=gift.kind==='learning'?'study':gift.kind==='craft'?'craft':
      gift.kind==='social'?'socialize':gift.kind==='exploration'||
      gift.kind==='movement'?'travel':gift.kind==='foraging'?'forage':
      gift.kind==='reflection'||gift.kind==='resolve'?'reflect':
      gift.kind==='care'&&d?.householdId&&youngInHome.has(d.householdId)?
      'care':gift.kind==='recovery'&&life.fatigue>25?'rest':null;
    if(chosen)return [chosen,'Choosing to practice an awakened '+gift.name+' gift.'];
  }
  if(d?.mentorId||d?.career==='scholar'||curiosity>63&&week%3===0)
    return ['study','Choosing to develop knowledge and skills.'];
  if(a.belief&&d?.values.tradition!==undefined&&
    d.values.tradition>51&&week%4===0)
    return ['reflect','Making time for a personally chosen tradition.'];
  if(d?.career==='artisan'||d?.skills.craft&&d.skills.craft>12)
    return ['craft','Practicing a personal craft.'];
  if(life.socialNeed>34)return ['socialize','Catching up with familiar people.'];
  if(week%3===0)return ['rest','Taking time for rest and recovery.'];
  return ['forage','Maintaining personal food security.'];
}

function acquaintance(a:Agent,bId:number,delta:number):number{
  const contacts=a.dailyLife!.acquaintances;
  const existing=contacts.find(c=>c.personId===bId);
  if(existing){existing.meetings=Math.min(999,existing.meetings+1);
    existing.regard=round(Math.max(-100,Math.min(100,(existing.regard??0)+delta)));
    return existing.meetings;}
  if(contacts.length>=6)contacts.shift();
  contacts.push({personId:bId,meetings:1,regard:delta});return 1;
}
function encounter(a:Agent,b:Agent,year:number,day:number,
  kind:Encounter['kind'],topic:Encounter['topic'],detail:string){
  const entries=a.dailyLife!.encounters;
  entries.push({year,day,withId:b.id,kind,topic,detail});
  if(entries.length>6)entries.shift();
}

/** Make one week of time a meaningful, bounded event for every living person.
 * Decisions use personal needs, age, vocation, household and the mind's goal.
 * Conversations need proximity, shared language and willingness from both.
 * All updates are immutable and avoid the annual RNG stream.
 */
export function advanceWeeklyLife(world:World,day:number):World{
  if(!world.agents.length)return world;
  const week=Math.floor(day/7),year=world.year;
  const youngInHome=new Set<number>();
  for(const a of world.agents){
    if(a.development?.householdId&&['infant','child','adolescent']
      .includes(lifeStage(a)))youngInHome.add(a.development.householdId);
  }
  const people=world.agents.map(old=>{
    const a:Agent={...old,dailyLife:cloneDailyLife(old.dailyLife??initialDailyLife())};
    const life=a.dailyLife!;
    const [activity,reason]=decide(a,week,youngInHome,world.settings.seed);
    life.activity=activity;life.reason=reason;life.year=year;life.day=day;
    const tiring=activity==='work'?6:activity==='travel'?7:
      activity==='forage'?4:activity==='craft'?3:activity==='study'?2:
      activity==='care'?2:0;
    life.fatigue=round(clamp(life.fatigue+tiring-(activity==='rest'?
      13*(1+activeTraitBonus(world.settings.seed,a,'recovery')):2)));
    life.socialNeed=round(clamp(life.socialNeed+
      (activity==='socialize'?-8:activity==='care'?-3:2)));
    life.morale=round(clamp(life.morale+
      (activity==='rest'?1:activity==='socialize'?2:activity==='care'?1:
        activity==='forage'&&a.energy<55?-1:life.fatigue>70?-1:-.12)));
    if(activity==='rest')a.energy=round(clamp(a.energy+.25));
    if(activity==='study'||activity==='craft'||activity==='work'){
      const skill=activity==='study'?'knowledge':activity==='craft'?'craft':
        a.work?.job==='farmer'?'foraging':a.work?.job==='builder'?'craft':
        a.work?.job==='woodcutter'?'foraging':'diplomacy';
      if(a.development){a.development=cloneDevelopment(a.development);
        const specialty=skill==='knowledge'?'learning':skill==='craft'?'craft':
          skill==='foraging'?'foraging':'social';
        a.development.skills[skill]=round(clamp(a.development.skills[skill]+
          trainedSkillGain(a.development.skills[skill],
            .018*(1+activeTraitBonus(world.settings.seed,a,specialty)),
            traitProfile(a.ancestry).lifespan)));}
    }
    return a;
  });
  const byId=new Map(people.map(a=>[a.id,a]));
  const cells=new Map<number,Agent[]>();
  for(const a of people){
    const at=a.y*world.width+a.x;
    const cell=cells.get(at);
    if(cell)cell.push(a);else cells.set(at,[a]);
  }
  const talked=new Set<number>();
  for(const a of people){
    if(talked.has(a.id)||!a.development||
      !['socialize','study','care','reflect'].includes(a.dailyLife!.activity))continue;
    // No universal automatic socialization: extremely tired or distrustful
    // individuals can avoid a conversation even when someone is nearby.
    if(a.dailyLife!.fatigue>76||a.development.trust<25)continue;
    let best:Agent|undefined,score=-Infinity;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=a.x+dx,y=a.y+dy;
      if(x<0||y<0||x>=world.width||y>=world.height)continue;
      const candidates=cells.get(y*world.width+x)??[];
      for(const b of candidates){
        if(b.id===a.id||talked.has(b.id)||!b.development||
          b.dailyLife!.fatigue>77||b.development.trust<23||
          a.development.languages[b.species]<12||
          b.development!.languages[a.species]<12||
          !['socialize','study','care','reflect','craft'].includes(
            b.dailyLife!.activity))continue;
        const own=a.dailyLife!.acquaintances,other=b.dailyLife!.acquaintances;
        if(refusesConversation(own,other,a.id,b.id)&&
          a.development.mentorId!==b.id&&
          (!a.development.householdId||
            a.development.householdId!==b.development.householdId))continue;
        const familiar=a.development.friends.includes(b.id)?15:0;
        const mentor=a.development.mentorId===b.id?18:0;
        const family=a.development.householdId===b.development!.householdId?12:0;
        const willingness=b.dailyLife!.activity==='socialize'?8:0;
        const rank=familiar+mentor+family+willingness+
          relationshipScore(own,other,a.id,b.id)+
          activeTraitBonus(world.settings.seed,a,'social')*15-
          distance(a,b)*6+((a.id*7+b.id*13+week*17)%11)*.2;
        if(rank>score){best=b;score=rank;}
      }
    }
    const b=best;
    if(!b)continue;
    talked.add(a.id);talked.add(b.id);
    const mentor=a.development.mentorId===b.id||b.development!.mentorId===a.id;
    const disagreement=!mentor&&a.belief?.faithId&&b.belief?.faithId&&
      a.belief.faithId!==b.belief.faithId&&
      a.development.values.tradition+b.development!.values.tradition>128&&
      (week+a.id+b.id)%4===0;
    const hardships=[a,b].some(person=>person.development!.memories.some(m=>
      ['loss','hardship'].includes(m.kind)&&year-m.year<=4));
    const comfort=!mentor&&!disagreement&&hardships&&
      (a.development.empathy>55||b.development!.empathy>55);
    const common=a.cognition?.agenda.find(p=>p.status==='active')?.purpose;
    const sharedGoal=!!common&&common===b.cognition?.agenda.find(p=>
      p.status==='active')?.purpose&&!['survive','recover'].includes(common);
    const beliefDifference=!disagreement&&!!a.belief&&!!b.belief&&
      a.belief.faithId!==b.belief.faithId;
    const restored=a.dailyLife!.acquaintances.some(c=>c.personId===b.id&&
      (c.regard??0)<-3)&&!disagreement;
    const delta=disagreement?-1.2:comfort?1.1:sharedGoal?0.8:
      beliefDifference?0.2:0.65;
    const aSocial=activeTraitBonus(world.settings.seed,a,'social');
    const bSocial=activeTraitBonus(world.settings.seed,b,'social');
    const metA=acquaintance(a,b.id,delta*(1+aSocial)),
      metB=acquaintance(b,a.id,delta*(1+bSocial));
    const friends=metA>=4&&metB>=4&&!disagreement&&
      a.development.trust>40&&b.development!.trust>40&&
      a.development.friends.length<4&&b.development!.friends.length<4&&
      !a.development.friends.includes(b.id)&&
      !b.development!.friends.includes(a.id)&&
      (a.dailyLife!.acquaintances.find(c=>c.personId===b.id)?.regard??0)>0;
    const kind:Encounter['kind']=mentor?'mentorship':disagreement?'disagreement':
      friends?'friendship':comfort?'comfort':restored?'reconciliation':
      beliefDifference?'debate':sharedGoal?'shared_goal':'conversation';
    const topic:Encounter['topic']=mentor?'learning':disagreement||beliefDifference?
      'belief':comfort?'hardship':sharedGoal?'future':
      a.mind?.goal==='explore'?'exploration':'family';
    const detail=mentor?'Asked questions and practiced a skill together.':
      disagreement?'Defended different traditions; trust was strained.':
      friends?'Chose to turn repeated meetings into friendship.':
      comfort?'Listened to someone carrying recent loss or hardship.':
      restored?'Made peace after an earlier disagreement.':
      beliefDifference?'Compared beliefs without requiring either to convert.':
      sharedGoal?'Discovered a shared ambition and discussed next steps.':
      'Shared memories about family, neighbors and daily life.';
    encounter(a,b,year,day,kind,topic,detail);
    encounter(b,a,year,day,kind,topic,detail);
    for(const [person,other] of [[a,b],[b,a]] as const){
      person.development=cloneDevelopment(person.development!);
      person.development.trust=round(clamp(person.development.trust+
        (disagreement?-.12:comfort?.2:.08)));
      person.development.values[sharedGoal?'community':beliefDifference?
        'discovery':'community']=round(clamp(person.development.values[
          sharedGoal?'community':beliefDifference?'discovery':'community']+
          (disagreement?0:.035)));
      person.development.languages[other.species]=round(clamp(
        person.development.languages[other.species]+.16));
      person.dailyLife!.socialNeed=round(clamp(person.dailyLife!.socialNeed-7));
      person.dailyLife!.morale=round(clamp(person.dailyLife!.morale+
        (disagreement?-.4:comfort?1.9:1.2)));
    }
    if(mentor){
      const mentorPerson=a.development.mentorId===b.id?b:a;
      const student=mentorPerson===a?b:a;
      const skill=mentorPerson.development!.skills.knowledge>
        mentorPerson.development!.skills.craft?'knowledge':'craft';
      student.development!.skills[skill]=round(clamp(
        student.development!.skills[skill]+trainedSkillGain(
          student.development!.skills[skill],.14,
          traitProfile(student.ancestry).lifespan)));
    }
    if(friends){
      a.development.friends.push(b.id);b.development!.friends.push(a.id);
      for(const [person,other] of [[a,b],[b,a]] as const){
        person.development!.memories.push({year,kind:'friendship',
          otherId:other.id,detail:'Chose a lasting friendship through repeated meetings.'});
        if(person.development!.memories.length>18)
          person.development!.memories=person.development!.memories.slice(-18);
      }
    }
  }
  return {...world,agents:people};
}
